import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  queryFetchAllMock,
  itemsQueryMock,
  databaseMock,
  cosmosClientMock,
  getTokenMock,
} = vi.hoisted(() => {
  const queryFetchAllMock = vi.fn();
  const itemsQueryMock = vi.fn(() => ({ fetchAll: queryFetchAllMock }));
  const containerMock = { items: { query: itemsQueryMock } };
  const databaseMock = vi.fn(() => ({ container: vi.fn(() => containerMock) }));
  const cosmosClientMock = vi.fn(() => ({ database: databaseMock }));
  const getTokenMock = vi.fn(async () => ({ token: 'aad-token' }));

  return {
    queryFetchAllMock,
    itemsQueryMock,
      databaseMock,
    cosmosClientMock,
    getTokenMock,
  };
});

vi.mock('@azure/cosmos', () => ({
  CosmosClient: cosmosClientMock,
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(() => ({ getToken: getTokenMock })),
}));

import { retrieveHmrcChunks } from '@/lib/hmrcRag';

describe('retrieveHmrcChunks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    queryFetchAllMock.mockReset();
    itemsQueryMock.mockClear();
    databaseMock.mockClear();
    cosmosClientMock.mockClear();
    getTokenMock.mockClear();
    process.env.AZURE_COSMOSDB_ENDPOINT = 'https://cosmos-llp-uks.documents.azure.com:443/';
    process.env.AZURE_OPENAI_ENDPOINT = 'https://hmrc-tax-openai.openai.azure.com/';
    delete process.env.AZURE_COSMOSDB_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.HMRC_RAG_DATABASE;
    delete process.env.HMRC_RAG_CONTAINER;
    delete process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ embedding: [1, 0] }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
  });

  test('queries Cosmos with tax year and jurisdiction filters and ranks returned chunks', async () => {
    queryFetchAllMock.mockResolvedValueOnce({
      resources: [
        {
          id: 'chunk-1',
          manual_ref: 'PTM063010',
          section_title: 'Lump sum allowance',
          text: 'Tax-free lump sums are limited by the lump sum allowance.',
          rule_ids: ['pension_lsa_cap'],
          source_url: 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm063010',
          applicable_tax_year: '2025-26',
          jurisdiction: 'rUK',
          embedding: [1, 0],
        },
        {
          id: 'chunk-2',
          manual_ref: 'SAIM1090',
          section_title: 'Savings income',
          text: 'Savings income may be taxed differently.',
          rule_ids: ['income_tax_bands'],
          source_url: 'https://www.gov.uk/hmrc-internal-manuals/savings-and-investment-manual/saim1090',
          applicable_tax_year: '2025-26',
          jurisdiction: 'rUK',
          embedding: [0, 1],
        },
      ],
    });

    const chunks = await retrieveHmrcChunks(
      ['pension_lsa_cap', 'income_tax_bands'],
      'Explain pension lump sum allowance effects on drawdown.',
      '2025-26',
      'rUK',
      2,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/openai/deployments/text-embedding-3-large/embeddings?api-version=2024-10-21'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(itemsQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('c.applicable_tax_year = @taxYear'),
      parameters: expect.arrayContaining([
        { name: '@taxYear', value: '2025-26' },
        { name: '@jurisdiction', value: 'rUK' },
        { name: '@ruleId0', value: 'pension_lsa_cap' },
      ]),
    }));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      id: 'chunk-1',
      manual_ref: 'PTM063010',
      source_url: 'https://www.gov.uk/hmrc-internal-manuals/pensions-tax-manual/ptm063010',
      applicable_tax_year: '2025-26',
      jurisdiction: 'rUK',
    });
  });

  test('falls back to a broader tax-year query when rule-specific candidates are empty', async () => {
    queryFetchAllMock
      .mockResolvedValueOnce({ resources: [] })
      .mockResolvedValueOnce({
        resources: [
          {
            id: 'chunk-3',
            manual_ref: 'IHTM14811',
            section_title: 'Normal expenditure out of income',
            text: 'Regular gifts from surplus income may be exempt.',
            rule_ids: ['iht_normal_expenditure'],
            source_url: 'https://www.gov.uk/hmrc-internal-manuals/inheritance-tax-manual/ihtm14811',
            applicable_tax_year: '2025-26',
            jurisdiction: 'rUK',
            embedding: [1, 0],
          },
        ],
      });

    const chunks = await retrieveHmrcChunks(
      ['missing_rule'],
      'Explain regular gifts from surplus income.',
      '2025-26',
      'rUK',
    );

    expect(itemsQueryMock).toHaveBeenCalledTimes(2);
    expect(itemsQueryMock.mock.calls[1]?.[0]).toMatchObject({
      query: expect.not.stringContaining('ARRAY_CONTAINS(c.rule_ids'),
      parameters: [
        { name: '@taxYear', value: '2025-26' },
        { name: '@jurisdiction', value: 'rUK' },
      ],
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.manual_ref).toBe('IHTM14811');
  });
});
