import { CosmosClient, type Container, type CosmosClientOptions } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

export interface PlannerPersistenceDocument {
  id: string;
  schemaVersion: number;
  revision: number;
  iv: string;
  ciphertext: string;
  createdAt: string;
  updatedAt: string;
  keyVersion?: number;
  wrappedKey?: string;
}

export interface SavePlannerPersistenceInput {
  userId: string;
  schemaVersion: number;
  baseRevision?: number;
  iv: string;
  ciphertext: string;
  keyVersion?: number;
  wrappedKey?: string;
}

export class PersistenceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersistenceConfigError';
  }
}

export class RevisionConflictError extends Error {
  readonly currentRevision: number;

  constructor(currentRevision: number) {
    super('The planner data has changed since your last load.');
    this.name = 'RevisionConflictError';
    this.currentRevision = currentRevision;
  }
}

let cachedContainer: Container | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new PersistenceConfigError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildCosmosClientOptions(): CosmosClientOptions {
  const endpoint = readRequiredEnv('AZURE_COSMOSDB_ENDPOINT');
  const configuredKey = process.env.AZURE_COSMOSDB_KEY;

  if (configuredKey) {
    return { endpoint, key: configuredKey };
  }

  return {
    endpoint,
    aadCredentials: new DefaultAzureCredential(),
  };
}

function getPlannerContainer(): Container {
  if (cachedContainer) return cachedContainer;

  const databaseId = readRequiredEnv('AZURE_COSMOSDB_DATABASE');
  const containerId = readRequiredEnv('AZURE_COSMOSDB_CONTAINER');
  const client = new CosmosClient(buildCosmosClientOptions());

  cachedContainer = client.database(databaseId).container(containerId);
  return cachedContainer;
}

function isStatusCode(error: unknown, statusCode: number): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; statusCode?: unknown };
  return candidate.code === statusCode || candidate.statusCode === statusCode;
}

export async function getPlannerPersistenceDocument(
  userId: string,
): Promise<PlannerPersistenceDocument | null> {
  try {
    const { resource } = await getPlannerContainer()
      .item(userId, userId)
      .read<PlannerPersistenceDocument>();

    return resource ?? null;
  } catch (error) {
    if (isStatusCode(error, 404)) return null;
    throw error;
  }
}

export async function savePlannerPersistenceDocument(
  input: SavePlannerPersistenceInput,
): Promise<PlannerPersistenceDocument> {
  const existing = await getPlannerPersistenceDocument(input.userId);

  if (
    existing &&
    typeof input.baseRevision === 'number' &&
    input.baseRevision !== existing.revision
  ) {
    throw new RevisionConflictError(existing.revision);
  }

  const timestamp = new Date().toISOString();
  const nextDocument: PlannerPersistenceDocument = {
    id: input.userId,
    schemaVersion: input.schemaVersion,
    revision: existing ? existing.revision + 1 : 1,
    iv: input.iv,
    ciphertext: input.ciphertext,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    keyVersion: input.keyVersion ?? existing?.keyVersion,
    wrappedKey: input.wrappedKey ?? existing?.wrappedKey,
  };

  await getPlannerContainer().items.upsert(nextDocument);
  return nextDocument;
}
