import Anthropic from '@anthropic-ai/sdk';
import { DefaultAzureCredential } from '@azure/identity';
import { z } from 'zod';
import type { OptimizationSummary, RuleCitation, HmrcChunk } from '@/lib/optimizerExplain';
import type { TaxJurisdiction } from '@/models/types';

const LLM_PROVIDER_VALUES = ['azure-openai', 'anthropic'] as const;
const LLMProviderSchema = z.enum(LLM_PROVIDER_VALUES);

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

const SYSTEM_PROMPT = `You explain later-life withdrawal optimizer results in plain English.
Rules:
- Explain the optimizer result using only the supplied facts.
- Never recalculate tax or invent figures.
- Be direct and specific. Avoid fluff.
- Format the explanation for scanning: use short paragraphs, and use bullets for grouped points or caveats.
- Do not return one long wall of text.
- Use any supplied HMRC guidance and citations to ground the explanation. Prefer paraphrase; only quote short excerpts when useful.
- When you reference HMRC guidance, name the HMRC manual reference and link when they are available.
- Do not mention internal system terms such as RAG, chunk, payload, schema, optimizer summary, or supplied data.
- If no HMRC guidance or citations are available, just explain the recommendation plainly without mentioning missing internal inputs.
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

function buildPrompt(context: ExplanationContext): string {
  return JSON.stringify({
    planSummary: context.planSummary,
    optimizationResult: context.optimizationResult,
    mcpCitations: context.mcpCitations ?? [],
    ragChunks: (context.ragChunks ?? []).map((chunk) => ({
      manual_ref: chunk.manual_ref,
      section_title: chunk.section_title,
      text: chunk.text,
      source_url: chunk.source_url,
      applicable_tax_year: chunk.applicable_tax_year,
      jurisdiction: chunk.jurisdiction,
      rule_ids: chunk.rule_ids,
    })),
  }, null, 2);
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
