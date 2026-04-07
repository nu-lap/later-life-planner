import Anthropic from '@anthropic-ai/sdk';
import { DefaultAzureCredential } from '@azure/identity';
import { z } from 'zod';
import type { OptimizationSummary, RuleCitation, HmrcChunk } from '@/lib/optimizerExplain';
import { getBaselineWaterfallDescription } from '@/lib/strategyDefinitions';
import type { TaxJurisdiction } from '@/models/types';

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

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigError';
  }
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

function describeDcOrder(planSummary: PlanSummary, dcOrder: OptimizationSummary['recommendedStrategy']['dcOrder']): string {
  if (planSummary.householdType === 'single') {
    return 'Use the defined contribution pension in the order that best fits the plan.';
  }

  switch (dcOrder) {
    case 'paul-first':
      return "Start taxable pension withdrawals from one partner before moving to the other partner's pension.";
    case 'lisa-first':
      return "Start taxable pension withdrawals from one partner's pension before moving to the other partner's pension.";
    case 'equal':
      return 'Split taxable pension withdrawals evenly across both partners.';
    case 'proportional':
      return 'Split taxable pension withdrawals across both partners in proportion to the pension pots available.';
    default:
      return 'Use the defined contribution pensions to help fund spending.';
  }
}

function describeIsaMode(isaMode: OptimizationSummary['recommendedStrategy']['isaMode']): string {
  return isaMode === 'now'
    ? 'Use ISA withdrawals from the start of the plan where needed.'
    : 'Keep ISA withdrawals back for later years unless they are needed sooner.';
}

function describeStrategy(planSummary: PlanSummary, strategy: OptimizationSummary['recommendedStrategy']): string {
  return `${describeDcOrder(planSummary, strategy.dcOrder)} ${describeIsaMode(strategy.isaMode)}`;
}

function describeStrategyComparison(context: ExplanationContext): string {
  const { optimizationResult, planSummary } = context;
  const matchesStandard = optimizationResult.recommendedStrategy.dcOrder === optimizationResult.baselineStrategy.dcOrder
    && optimizationResult.recommendedStrategy.isaMode === optimizationResult.baselineStrategy.isaMode;

  if (matchesStandard) {
    return "The recommendation matches LaterLifePlan's usual starting approach for this plan.";
  }

  return getBaselineWaterfallDescription(planSummary.householdType);
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
  const recommendation = describeStrategy(planSummary, optimizationResult.recommendedStrategy);
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
    '',
    'Recommendation:',
    `- Recommended approach: ${recommendation}`,
    `- ${describeStrategyComparison(context)}`,
    '',
    'Likely outcome:',
    `- ${outcome}`,
    `- ${describeAssetOutcome(optimizationResult)}`,
    '',
    'Tax rule caveat:',
    `- ${describeTaxRuleCaveat(optimizationResult)}`,
    '',
    'Writing requirements:',
    '- Start directly with the recommendation and why it matters.',
    '- Use plain English throughout. For example, say England, Wales or Northern Ireland rather than a code.',
    '- Do not say things like ISA mode, baseline, fallback version, payload, schema, technical guidance retrieval terms, or raw strategy labels.',
    '- Treat required spending as a net cash target. Explain that tax can make gross withdrawals higher than the spendable amount.',
    "- If the recommendation matches the app's standard starting strategy, explain that plainly as the app's usual starting approach rather than calling it optimal by default.",
    '- If you mention secure income, make clear that part of it may only arrive later in retirement, such as State Pension.',
    '- If you mention spending, make clear that the figure is for the first projected year.',
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
