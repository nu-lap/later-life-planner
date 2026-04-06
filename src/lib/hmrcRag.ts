import { CosmosClient, type Container, type CosmosClientOptions, type SqlParameter, type SqlQuerySpec } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import type { TaxJurisdiction } from '@/models/types';
import type { HmrcChunk } from '@/lib/optimizerExplain';

const DEFAULT_TOP_K = 5;
const MAX_TOP_K = 10;
const CANDIDATE_MULTIPLIER = 12;
const MIN_CANDIDATE_LIMIT = 40;
const MAX_CANDIDATE_LIMIT = 250;

interface StoredHmrcChunkDocument {
  id?: unknown;
  manual_ref?: unknown;
  section_title?: unknown;
  text?: unknown;
  rule_ids?: unknown;
  source_url?: unknown;
  applicable_tax_year?: unknown;
  jurisdiction?: unknown;
  embedding?: unknown;
}

export class HmrcRagConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HmrcRagConfigError';
  }
}

let cachedRagContainer: Container | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new HmrcRagConfigError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildCosmosClientOptions(): CosmosClientOptions {
  const endpoint = readRequiredEnv('AZURE_COSMOSDB_ENDPOINT');
  const configuredKey = process.env.AZURE_COSMOSDB_KEY?.trim();

  if (configuredKey) {
    return { endpoint, key: configuredKey };
  }

  return {
    endpoint,
    aadCredentials: new DefaultAzureCredential(),
  };
}

function getRagDatabaseId(): string {
  return process.env.HMRC_RAG_DATABASE?.trim() || 'hmrc-guidance';
}

function getRagContainerId(): string {
  return process.env.HMRC_RAG_CONTAINER?.trim() || 'hmrc-chunks';
}

function getRagContainer(): Container {
  if (cachedRagContainer) return cachedRagContainer;

  const client = new CosmosClient(buildCosmosClientOptions());
  cachedRagContainer = client.database(getRagDatabaseId()).container(getRagContainerId());
  return cachedRagContainer;
}

function getAzureApiVersion(): string {
  return process.env.AZURE_OPENAI_API_VERSION?.trim() || '2024-10-21';
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
    throw new HmrcRagConfigError('Azure OpenAI credentials are not configured.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token.token}`,
  };
}

async function embedQueryText(queryText: string): Promise<number[]> {
  const endpoint = readRequiredEnv('AZURE_OPENAI_ENDPOINT');
  const deployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT?.trim() || 'text-embedding-3-large';
  const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/embeddings?api-version=${getAzureApiVersion()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: await getAzureHeaders(),
    body: JSON.stringify({ input: queryText }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Azure OpenAI embedding request failed: ${response.status} ${detail}`.trim());
  }

  const payload = await response.json() as { data?: Array<{ embedding?: unknown }> };
  const embedding = payload.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number')) {
    throw new Error('Azure OpenAI embedding response was malformed.');
  }

  return embedding as number[];
}

function normalizeChunk(document: StoredHmrcChunkDocument): (HmrcChunk & { embedding?: number[] }) | null {
  if (typeof document.id !== 'string' || typeof document.text !== 'string') return null;
  if (typeof document.manual_ref !== 'string' || typeof document.section_title !== 'string') return null;
  if (typeof document.source_url !== 'string' || typeof document.applicable_tax_year !== 'string') return null;
  if (document.jurisdiction !== 'rUK' && document.jurisdiction !== 'scotland') return null;

  const ruleIds = Array.isArray(document.rule_ids)
    ? document.rule_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];
  const embedding = Array.isArray(document.embedding)
    ? document.embedding.filter((value): value is number => typeof value === 'number')
    : undefined;

  return {
    id: document.id,
    manual_ref: document.manual_ref,
    section_title: document.section_title,
    title: `${document.manual_ref} — ${document.section_title}`,
    text: document.text,
    rule_ids: ruleIds,
    source_url: document.source_url,
    url: document.source_url,
    applicable_tax_year: document.applicable_tax_year,
    taxYear: document.applicable_tax_year,
    jurisdiction: document.jurisdiction,
    embedding,
  };
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < a.length; index += 1) {
    const aValue = a[index];
    const bValue = b[index];
    dot += aValue * bValue;
    aNorm += aValue * aValue;
    bNorm += bValue * bValue;
  }

  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

function lexicalScore(chunk: HmrcChunk, queryText: string): number {
  const haystack = `${chunk.manual_ref} ${chunk.section_title} ${chunk.text}`.toLowerCase();
  const terms = queryText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);

  if (terms.length === 0) return 0;
  let matches = 0;
  for (const term of terms) {
    if (haystack.includes(term)) {
      matches += 1;
    }
  }

  return matches / terms.length;
}

function buildQuery(ruleIds: string[], taxYear: string, jurisdiction: TaxJurisdiction, topK: number): SqlQuerySpec {
  const candidateLimit = Math.min(
    Math.max(topK * CANDIDATE_MULTIPLIER, MIN_CANDIDATE_LIMIT),
    MAX_CANDIDATE_LIMIT,
  );
  const parameters: SqlParameter[] = [
    { name: '@taxYear', value: taxYear },
    { name: '@jurisdiction', value: jurisdiction },
  ];
  const ruleFilters = ruleIds.map((ruleId, index) => {
    const name = `@ruleId${index}`;
    parameters.push({ name, value: ruleId });
    return `ARRAY_CONTAINS(c.rule_ids, ${name})`;
  });

  const ruleClause = ruleFilters.length > 0 ? ` AND (${ruleFilters.join(' OR ')})` : '';

  return {
    query: `SELECT TOP ${candidateLimit} c.id, c.manual_ref, c.section_title, c.text, c.rule_ids, c.source_url, c.applicable_tax_year, c.jurisdiction, c.embedding FROM c WHERE c.applicable_tax_year = @taxYear AND c.jurisdiction = @jurisdiction${ruleClause}`,
    parameters,
  };
}

function buildFallbackQuery(taxYear: string, jurisdiction: TaxJurisdiction, topK: number): SqlQuerySpec {
  const candidateLimit = Math.min(
    Math.max(topK * CANDIDATE_MULTIPLIER, MIN_CANDIDATE_LIMIT),
    MAX_CANDIDATE_LIMIT,
  );

  return {
    query: `SELECT TOP ${candidateLimit} c.id, c.manual_ref, c.section_title, c.text, c.rule_ids, c.source_url, c.applicable_tax_year, c.jurisdiction, c.embedding FROM c WHERE c.applicable_tax_year = @taxYear AND c.jurisdiction = @jurisdiction`,
    parameters: [
      { name: '@taxYear', value: taxYear },
      { name: '@jurisdiction', value: jurisdiction },
    ],
  };
}

async function queryChunks(querySpec: SqlQuerySpec): Promise<(HmrcChunk & { embedding?: number[] })[]> {
  const { resources } = await getRagContainer().items.query<StoredHmrcChunkDocument>(querySpec).fetchAll();
  return resources
    .map((resource) => normalizeChunk(resource))
    .filter((chunk): chunk is HmrcChunk & { embedding?: number[] } => chunk !== null);
}

export async function retrieveHmrcChunks(
  ruleIds: string[],
  queryText: string,
  taxYear: string,
  jurisdiction: TaxJurisdiction,
  topK = DEFAULT_TOP_K,
): Promise<HmrcChunk[]> {
  const normalizedTopK = Math.min(Math.max(Math.trunc(topK), 1), MAX_TOP_K);
  const uniqueRuleIds = [...new Set(ruleIds.filter((ruleId) => ruleId.trim().length > 0))];
  const queryEmbedding = await embedQueryText(queryText);

  let candidates = await queryChunks(buildQuery(uniqueRuleIds, taxYear, jurisdiction, normalizedTopK));
  if (candidates.length === 0 && uniqueRuleIds.length > 0) {
    candidates = await queryChunks(buildFallbackQuery(taxYear, jurisdiction, normalizedTopK));
  }

  return candidates
    .map((chunk) => {
      const vectorScore = Array.isArray(chunk.embedding)
        ? cosineSimilarity(queryEmbedding, chunk.embedding)
        : 0;
      const lexical = lexicalScore(chunk, queryText);
      return {
        chunk,
        score: vectorScore > 0 ? vectorScore : lexical,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, normalizedTopK)
    .map(({ chunk }) => {
      const { embedding: _embedding, ...publicChunk } = chunk;
      return publicChunk;
    });
}
