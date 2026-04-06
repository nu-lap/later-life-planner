import type { RuleProvenance } from '@/financialEngine/types';
import type { RuleCitation } from '@/lib/optimizerExplain';

const HMRC_MCP_TIMEOUT_MS = 5_000;

type CitationLike = {
  title?: unknown;
  url?: unknown;
  summary?: unknown;
};

type ExplainRuleResponse = {
  title?: unknown;
  url?: unknown;
  summary?: unknown;
  explanation?: unknown;
  citations?: CitationLike[];
};

function summarize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= 280 ? trimmed : `${trimmed.slice(0, 277)}...`;
}

function normalizeCitation(
  rule: RuleProvenance,
  citation: CitationLike | undefined,
  fallbackSummary?: string,
): RuleCitation {
  return {
    ruleId: rule.rule_id,
    version: rule.version,
    taxYear: rule.tax_year_used,
    jurisdiction: rule.jurisdiction,
    title: typeof citation?.title === 'string' && citation.title.trim()
      ? citation.title.trim()
      : `HMRC ${rule.rule_id}`,
    url: typeof citation?.url === 'string' && citation.url.trim() ? citation.url.trim() : undefined,
    summary: summarize(citation?.summary) ?? fallbackSummary,
  };
}

async function fetchRuleCitations(rule: RuleProvenance, baseUrl: string): Promise<RuleCitation[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HMRC_MCP_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/explain_rule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rule_id: rule.rule_id,
        version: rule.version,
        tax_year: rule.tax_year_used,
        jurisdiction: rule.jurisdiction,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HMRC MCP request failed: ${response.status}`);
    }

    const data = await response.json().catch(() => null) as ExplainRuleResponse | null;
    if (!data) return [];

    const fallbackSummary = summarize(data.summary) ?? summarize(data.explanation);
    const citations = Array.isArray(data.citations)
      ? data.citations
          .filter((citation) => citation && typeof citation === 'object')
          .map((citation) => normalizeCitation(rule, citation, fallbackSummary))
      : [];

    if (citations.length > 0) {
      return citations;
    }

    return [normalizeCitation(rule, {
      title: data.title,
      url: data.url,
      summary: fallbackSummary,
    }, fallbackSummary)];
  } finally {
    clearTimeout(timeout);
  }
}

export async function collectHmrcRuleCitations(
  ruleProvenance: RuleProvenance[],
): Promise<RuleCitation[]> {
  const baseUrl = process.env.HMRC_TAX_MCP_BASE_URL?.trim()?.replace(/\/$/, '');
  if (!baseUrl) return [];

  const uniqueRules = Array.from(new Map(
    ruleProvenance.map((rule) => [
      `${rule.rule_id}|${rule.version}|${rule.tax_year_used}|${rule.jurisdiction}`,
      rule,
    ]),
  ).values());

  const settled = await Promise.allSettled(
    uniqueRules.map((rule) => fetchRuleCitations(rule, baseUrl)),
  );

  const failedRequests = settled.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failedRequests.length > 0) {
    const reasons = failedRequests
      .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
      .join('; ');

    throw new Error(
      `Failed to fetch HMRC MCP citations for ${failedRequests.length} of ${uniqueRules.length} rules: ${reasons}`,
    );
  }

  return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
}
