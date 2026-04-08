import Anthropic from '@anthropic-ai/sdk';
import { DefaultAzureCredential } from '@azure/identity';
import { z } from 'zod';
import type { OptimizationSummary, RuleCitation, HmrcChunk } from '@/lib/optimizerExplain';
import type { GoalOrchestrateRequest } from '@/lib/goalOrchestration';
import {
  getBaselineWaterfallDescription,
  getStrategyDefinitions,
  getStrategyDisplayLabel,
} from '@/lib/strategyDefinitions';
import type { TaxJurisdiction } from '@/models/types';
import type { OptimizerPolicyOverride } from '@/financialEngine/types';

const LLM_PROVIDER_VALUES = ['azure-openai', 'anthropic'] as const;
const LLMProviderSchema = z.enum(LLM_PROVIDER_VALUES);
const GBP_FORMATTER = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

export type LlmProvider = z.infer<typeof LLMProviderSchema>;

export interface PlanSummary {
  householdType: 'single' | 'couple';
  ages: number[];
  jurisdiction: TaxJurisdiction;
  guaranteedIncomeAnnual: number;
  dcTotal: number;
  isaTotal: number;
  giaTotal: number;
  targetSpendingAnnual: number;
  planRevision: string;
}

export interface ExplanationContext {
  optimizationResult: OptimizationSummary;
  planSummary: PlanSummary;
  mcpCitations?: RuleCitation[];
  ragChunks?: HmrcChunk[];
}

export interface GoalOrchestrationContext {
  planSummary: GoalOrchestrateRequest['planSummary'];
  goalRegistry: GoalOrchestrateRequest['goalRegistry'];
  naturalLanguageInput?: string;
}

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigError';
  }
}

function enabledGoalsByPriority(goalRegistry: GoalOrchestrateRequest['goalRegistry']) {
  return goalRegistry
    .filter((goal) => goal.enabled)
    .slice()
    .sort((left, right) => left.priority - right.priority);
}

export async function generateGoalPolicyOverride(
  context: GoalOrchestrationContext,
): Promise<OptimizerPolicyOverride> {
  const enabledGoals = enabledGoalsByPriority(context.goalRegistry);
  const policyOverride: OptimizerPolicyOverride = {
    rationale: 'Derived from the user’s ranked retirement goals.',
  };
  const rationaleParts: string[] = [];

  for (const goal of enabledGoals) {
    switch (goal.id) {
      case 'bequest':
        if (goal.targetValue !== undefined) {
          policyOverride.bequestTarget = Math.max(policyOverride.bequestTarget ?? 0, goal.targetValue);
          policyOverride.isaMode = 'defer';
          rationaleParts.push(`Protect at least ${formatMoney(goal.targetValue)} for bequests.`);
        }
        break;
      case 'care_reserve':
        if (goal.targetValue !== undefined) {
          policyOverride.careReserveTarget = Math.max(policyOverride.careReserveTarget ?? 0, goal.targetValue);
          rationaleParts.push(`Keep ${formatMoney(goal.targetValue)} available for later-life care.`);
        }
        break;
      case 'spending_floor':
      case 'longevity_protection':
        if (goal.targetValue !== undefined) {
          policyOverride.minAnnualIncome = Math.max(policyOverride.minAnnualIncome ?? 0, goal.targetValue);
        } else {
          policyOverride.minAnnualIncome = Math.max(
            policyOverride.minAnnualIncome ?? 0,
            context.planSummary.targetSpendingAnnual,
          );
        }
        rationaleParts.push('Keep annual spending support above the requested floor.');
        break;
      case 'liquidity_preservation':
        policyOverride.isaMode = policyOverride.isaMode ?? 'defer';
        rationaleParts.push('Keep ISA balances available for later flexibility.');
        break;
      case 'survivorship':
        if (context.planSummary.householdType === 'couple') {
          policyOverride.dcOrder = 'equal';
          rationaleParts.push('Split pension withdrawals more evenly across both partners.');
        }
        break;
      case 'inflation_resilience':
        // Inflation-adjusted spending is not yet implemented in downstream optimizer/projection logic.
        // Keep this goal as a no-op here until the engine can honor it without misleading users.
        break;
      case 'tax_efficiency':
        rationaleParts.push('Prefer lower-tax withdrawal paths where the higher-priority constraints still hold.');
        break;
      case 'aspirational_spending':
        rationaleParts.push('Leave room for discretionary spending if core goals are still met.');
        break;
    }
  }

  if (!policyOverride.minAnnualIncome && context.planSummary.targetSpendingAnnual > 0) {
    policyOverride.minAnnualIncome = context.planSummary.targetSpendingAnnual;
  }

  const naturalLanguageInput = context.naturalLanguageInput?.trim();
  policyOverride.rationale = [
    rationaleParts.length > 0 ? rationaleParts.join(' ') : policyOverride.rationale,
    naturalLanguageInput ? `User note: ${naturalLanguageInput}.` : '',
  ].filter(Boolean).join(' ');

  return policyOverride;
}

const SYSTEM_PROMPT = `You explain later-life withdrawal optimizer results in plain English for end users.
Rules:
- Start with the recommendation itself. Do not open with filler such as "Here is the explanation".
- Explain the optimizer result using only the supplied facts.
- Never recalculate tax or invent figures.
- Be direct and specific. Avoid fluff.
- Use short paragraphs and bullet points. Do not return one long wall of text.
- Follow this exact structure. Output these headings exactly as plain lines with no leading spaces, bullets, or trailing colons:
Recommendation
- one or two bullets
Why this fits
- two or three bullets
Points to note
- one or two bullets
- Do not add any other headings.
- Use any supplied HMRC guidance and citations to ground the explanation. Prefer paraphrase; only quote short excerpts when useful.
- When you reference HMRC guidance, name the HMRC manual reference and link when they are available.
- Use plain English instead of internal labels or abbreviations.
- When the prompt supplies a strategy meaning, restate it faithfully and do not reinterpret it into a different withdrawal order.
- Do not describe an even-split strategy as one partner first and the other partner later.
- Never mention raw strategy labels, field names, internal abbreviations, or system codes.
- If you mention secure income, make clear that some of it may start later in retirement, for example State Pension.
- If you mention spending, make clear that the figure shown is the first projected year's target unless you explicitly say otherwise.
- Treat required spending as a net cash target. If tax applies, explain that gross withdrawals may need to be higher to leave the same spendable amount.
- If the recommended strategy matches the app's standard starting strategy, say that plainly as the app's usual starting approach.
- Do not mention internal system terms or missing internal inputs.
- Do not ask follow-up questions.`;

function getAzureApiVersion(): string {
  return process.env.AZURE_OPENAI_API_VERSION?.trim() || '2024-10-21';
}

export function getConfiguredLlmProvider(): LlmProvider {
  const parsed = LLMProviderSchema.safeParse(process.env.LLM_PROVIDER ?? 'azure-openai');
  if (!parsed.success) {
    throw new LlmConfigError('Unsupported LLM provider.');
  }
  return parsed.data;
}

function formatMoney(value: number): string {
  return GBP_FORMATTER.format(value);
}

function describeJurisdiction(jurisdiction: TaxJurisdiction): string {
  return jurisdiction === 'rUK' ? 'England, Wales or Northern Ireland' : 'Scotland';
}

function describeHousehold(planSummary: PlanSummary): string {
  if (planSummary.householdType === 'single') {
    return `One person aged ${planSummary.ages[0]} living in ${describeJurisdiction(planSummary.jurisdiction)}`;
  }

  return `A couple aged ${planSummary.ages.join(' and ')} living in ${describeJurisdiction(planSummary.jurisdiction)}`;
}

function describeSecureIncome(planSummary: PlanSummary): string {
  if (planSummary.guaranteedIncomeAnnual <= 0) {
    return 'No secure pension or annuity income is included in this summary yet.';
  }

  return [
    `Secure pension or annuity income is about ${formatMoney(planSummary.guaranteedIncomeAnnual)} a year when fully in payment.`,
    'Some components, such as State Pension, may only start from State Pension age.',
  ].join(' ');
}

function describeSpending(planSummary: PlanSummary): string {
  return `The spending figure is the first projected year's target, about ${formatMoney(planSummary.targetSpendingAnnual)}.`;
}

function getStrategyDefinitionText(planSummary: PlanSummary, label: string): string {
  const strategyDefinitions = getStrategyDefinitions(planSummary.householdType, 'Partner 1', 'Partner 2');
  return strategyDefinitions.find((definition) => definition.label === label)?.description
    ?? (label === 'LLP baseline waterfall'
      ? getBaselineWaterfallDescription(planSummary.householdType)
      : 'Use the plan’s standard withdrawal order or the comparison strategy named above.');
}

function describeIsaMode(isaMode: OptimizationSummary['recommendedStrategy']['isaMode']): string {
  return isaMode === 'now'
    ? 'Use ISA withdrawals from the start of the plan where needed.'
    : 'Keep ISA withdrawals back for later years unless they are needed sooner.';
}

function describeStrategyComparison(context: ExplanationContext): string {
  const { optimizationResult, planSummary } = context;
  const recommendedLabel = getStrategyDisplayLabel(planSummary.householdType, optimizationResult.recommendedStrategy.label);
  const baselineLabel = 'LLP baseline waterfall';

  if (recommendedLabel === baselineLabel) {
    return `The recommendation matches LaterLifePlan's usual starting approach for this plan.`;
  }

  return `${recommendedLabel} is being compared against ${baselineLabel}.`;
}

function describeAssetOutcome(optimizationResult: OptimizationSummary): string {
  if (optimizationResult.assetDepletionAge === null) {
    return `Assets are projected to last through the modelled horizon, with about ${formatMoney(optimizationResult.terminalAssets)} remaining at the end.`;
  }

  return `Assets are projected to run out around age ${optimizationResult.assetDepletionAge}, reaching ${formatMoney(optimizationResult.terminalAssets)} at that point.`;
}

function describeTaxRuleCaveat(optimizationResult: OptimizationSummary): string {
  const usedYears = Array.from(new Set(optimizationResult.ruleProvenance.map((entry) => entry.tax_year_used))).sort();
  const rangeText = usedYears.length > 0
    ? ` The projection uses tax rules referenced across ${usedYears[0]} to ${usedYears[usedYears.length - 1]}.`
    : '';

  if (optimizationResult.ruleProvenance.some((entry) => entry.is_fallback)) {
    return [
      'Some later-year tax calculations still rely on the latest confirmed HMRC rules currently available, because not every future rate and allowance has been published yet.',
      rangeText.trim(),
    ].filter(Boolean).join(' ');
  }

  return `The tax calculations use the confirmed HMRC rules referenced in this projection.${rangeText}`.trim();
}

function describeFirstYearTax(planSummary: PlanSummary, optimizationResult: OptimizationSummary): string {
  const roundedFirstYearTax = Math.round(optimizationResult.firstYearTax);
  const yearTax = formatMoney(roundedFirstYearTax);
  const yearSpending = formatMoney(optimizationResult.firstYearSpending ?? planSummary.targetSpendingAnnual);
  const yearNet = formatMoney(optimizationResult.firstYearNetIncome);

  if (roundedFirstYearTax <= 0) {
    return `The first projected year meets the spending target of ${yearSpending} with no tax due in that year. The net income for that year is ${yearNet}.`;
  }

  return `The first projected year targets ${yearSpending} of spending, with ${yearTax} of tax due and net income of ${yearNet}.`;
}

function buildCitationsSection(citations: RuleCitation[]): string[] {
  if (citations.length === 0) {
    return [];
  }

  return [
    'HMRC citations:',
    ...citations.map((citation) => {
      const parts = [citation.title, citation.taxYear];
      if (citation.url) parts.push(citation.url);
      return `- ${parts.join(' | ')}`;
    }),
  ];
}

function buildGuidanceSection(chunks: HmrcChunk[]): string[] {
  if (chunks.length === 0) {
    return [];
  }

  return [
    'Relevant HMRC guidance excerpts:',
    ...chunks.map((chunk) => `- ${chunk.manual_ref}: ${chunk.section_title} | ${chunk.text} | ${chunk.source_url}`),
  ];
}

export function buildPrompt(context: ExplanationContext): string {
  const { planSummary, optimizationResult } = context;
  const recommendationLabel = getStrategyDisplayLabel(planSummary.householdType, optimizationResult.recommendedStrategy.label);
  const recommendedStrategyDefinition = getStrategyDefinitionText(planSummary, recommendationLabel);
  const baselineStrategyDefinition = getStrategyDefinitionText(planSummary, 'LLP baseline waterfall');
  const outcome = optimizationResult.lifetimeTaxSaving > 0
    ? `This is projected to save about ${formatMoney(optimizationResult.lifetimeTaxSaving)} in lifetime tax compared with the app's standard starting strategy.`
    : "This is not projected to produce a meaningful lifetime tax saving versus the app's standard starting strategy.";

  return [
    'Write a plain-English explanation for an end user of a later-life withdrawal plan.',
    'Use the facts below. Do not mention internal labels, abbreviations, raw field names, or missing internal inputs.',
    'The final answer must use exactly these headings: Recommendation, Why this fits, Points to note.',
    'Under each heading, use bullet points rather than dense prose.',
    '',
    'Starting point:',
    `- Household: ${describeHousehold(planSummary)}.`,
    `- ${describeSecureIncome(planSummary)}`,
    `- Defined contribution pensions total about ${formatMoney(planSummary.dcTotal)}.`,
    `- ISAs total about ${formatMoney(planSummary.isaTotal)}.`,
    `- General investment accounts total about ${formatMoney(planSummary.giaTotal)}.`,
    `- ${describeSpending(planSummary)}`,
    `- ISA timing: ${describeIsaMode(optimizationResult.recommendedStrategy.isaMode)}`,
    '',
    'Recommendation:',
    `- Recommended approach: ${recommendationLabel}.`,
    `- Strategy meaning: ${recommendedStrategyDefinition.replace(/\.$/, '')}.`,
    `- Comparison strategy: ${baselineStrategyDefinition.replace(/\.$/, '')}.`,
    `- ${describeStrategyComparison(context)}`,
    '',
    'Likely outcome:',
    `- ${outcome}`,
    `- ${describeAssetOutcome(optimizationResult)}`,
    `- ${describeFirstYearTax(planSummary, optimizationResult)}`,
    '',
    'Tax rule caveat:',
    `- ${describeTaxRuleCaveat(optimizationResult)}`,
    '',
    'Writing requirements:',
    '- Start directly with the recommendation and why it matters.',
    '- Use plain English throughout. For example, say England, Wales or Northern Ireland rather than a code.',
    '- Do not say things like ISA mode, baseline, fallback version, payload, schema, technical guidance retrieval terms, or raw strategy labels.',
    '- Treat required spending as a net cash target.',
    '- Only mention gross-up if tax is actually due in the year you are describing. If first-year tax is zero, say that clearly.',
    "- If the recommendation matches the app's standard starting strategy, explain that plainly as the app's usual starting approach rather than calling it optimal by default.",
    '- Restate the chosen strategy label and its plain-English meaning before explaining why it was chosen.',
    '- If you mention secure income, make clear that part of it may only arrive later in retirement, such as State Pension.',
    '- If you mention spending, make clear that the figure is for the first projected year.',
    '- Use the provided strategy definitions rather than inventing your own summary of the withdrawal order.',
    '- Keep the answer concise, readable, and useful.',
    '',
    ...buildCitationsSection(context.mcpCitations ?? []),
    ...(context.mcpCitations && context.mcpCitations.length > 0 ? [''] : []),
    ...buildGuidanceSection(context.ragChunks ?? []),
  ].join('\n').trim();
}

async function getAzureHeaders(): Promise<HeadersInit> {
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  if (apiKey) {
    return {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    };
  }

  const credential = new DefaultAzureCredential();
  const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
  if (!token?.token) {
    throw new LlmConfigError('Azure OpenAI credentials are not configured.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.token}`,
  };
}

async function* streamAzureOpenAI(context: ExplanationContext): AsyncGenerator<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const deployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT?.trim();
  if (!endpoint || !deployment) {
    throw new LlmConfigError('Azure OpenAI is not configured.');
  }

  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${getAzureApiVersion()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: await getAzureHeaders(),
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(context) },
      ],
      max_tokens: 700,
      temperature: 0.2,
      stream: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Azure OpenAI request failed: ${response.status} ${detail}`.trim());
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Azure OpenAI returned an empty response body.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data && data !== '[DONE]') {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) {
            yield chunk;
          }
        }
      }

      newlineIndex = buffer.indexOf('\n');
    }
  }
}

async function* streamAnthropic(context: ExplanationContext): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmConfigError('Anthropic is not configured.');
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-4-5';
  const stream = client.messages.stream({
    model,
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(context) }],
  });

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

export async function* streamExplanation(
  context: ExplanationContext,
): AsyncGenerator<string> {
  switch (getConfiguredLlmProvider()) {
    case 'azure-openai':
      yield* streamAzureOpenAI(context);
      return;
    case 'anthropic':
      yield* streamAnthropic(context);
      return;
    default:
      throw new LlmConfigError('Unsupported LLM provider.');
  }
}
