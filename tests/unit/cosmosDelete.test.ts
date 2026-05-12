import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockDelete = vi.fn();
const mockItemFn = vi.fn(() => ({ delete: mockDelete }));
const mockContainer = { item: mockItemFn };
const mockDatabase = { container: vi.fn(() => mockContainer) };
const mockClient = { database: vi.fn(() => mockDatabase) };

vi.mock('@azure/cosmos', () => ({
  CosmosClient: vi.fn(() => mockClient),
}));

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(),
}));

describe('cosmos deletePlannerPersistenceDocument', () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockItemFn.mockReset();
    mockItemFn.mockReturnValue({ delete: mockDelete });
    process.env.AZURE_COSMOSDB_ENDPOINT = 'https://test.documents.azure.com:443/';
    process.env.AZURE_COSMOSDB_DATABASE = 'test-db';
    process.env.AZURE_COSMOSDB_CONTAINER = 'test-container';
  });

  afterEach(() => {
    delete process.env.AZURE_COSMOSDB_ENDPOINT;
    delete process.env.AZURE_COSMOSDB_DATABASE;
    delete process.env.AZURE_COSMOSDB_CONTAINER;
  });

  test('calls item().delete() with the userId as both id and partition key', async () => {
    mockDelete.mockResolvedValue({});
    const { deletePlannerPersistenceDocument } = await import('@/lib/cosmos');

    await deletePlannerPersistenceDocument('user_abc');

    expect(mockItemFn).toHaveBeenCalledWith('user_abc', 'user_abc');
    expect(mockDelete).toHaveBeenCalled();
  });

  test('returns without throwing when the document does not exist (404)', async () => {
    mockDelete.mockRejectedValue({ statusCode: 404 });
    const { deletePlannerPersistenceDocument } = await import('@/lib/cosmos');

    await expect(deletePlannerPersistenceDocument('user_abc')).resolves.toBeUndefined();
  });

  test('rethrows non-404 errors', async () => {
    mockDelete.mockRejectedValue({ statusCode: 500, message: 'Internal error' });
    const { deletePlannerPersistenceDocument } = await import('@/lib/cosmos');

    await expect(deletePlannerPersistenceDocument('user_abc')).rejects.toMatchObject({ statusCode: 500 });
  });
});
