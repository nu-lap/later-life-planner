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

interface ExistingPlannerDocument {
  document: PlannerPersistenceDocument;
  etag: string;
}

async function readExistingPlannerDocument(userId: string): Promise<ExistingPlannerDocument | null> {
  try {
    const { resource } = await getPlannerContainer()
      .item(userId, userId)
      .read<PlannerPersistenceDocument>();

    if (!resource) return null;

    const resourceWithMetadata = resource as PlannerPersistenceDocument & { _etag?: string };
    if (!resourceWithMetadata._etag) {
      throw new Error('Missing _etag on planner persistence document.');
    }

    return {
      document: {
        id: resource.id,
        schemaVersion: resource.schemaVersion,
        revision: resource.revision,
        iv: resource.iv,
        ciphertext: resource.ciphertext,
        createdAt: resource.createdAt,
        updatedAt: resource.updatedAt,
        keyVersion: resource.keyVersion,
        wrappedKey: resource.wrappedKey,
      },
      etag: resourceWithMetadata._etag,
    };
  } catch (error) {
    if (isStatusCode(error, 404)) return null;
    throw error;
  }
}

export async function getPlannerPersistenceDocument(
  userId: string,
): Promise<PlannerPersistenceDocument | null> {
  const existing = await readExistingPlannerDocument(userId);
  return existing?.document ?? null;
}

export async function savePlannerPersistenceDocument(
  input: SavePlannerPersistenceInput,
): Promise<PlannerPersistenceDocument> {
  const existing = await readExistingPlannerDocument(input.userId);
  const existingDocument = existing?.document;

  if (existingDocument && typeof input.baseRevision !== 'number') {
    throw new RevisionConflictError(existingDocument.revision);
  }

  if (
    existingDocument &&
    typeof input.baseRevision === 'number' &&
    input.baseRevision !== existingDocument.revision
  ) {
    throw new RevisionConflictError(existingDocument.revision);
  }

  const timestamp = new Date().toISOString();
  const container = getPlannerContainer();

  if (!existingDocument) {
    const createdDocument: PlannerPersistenceDocument = {
      id: input.userId,
      schemaVersion: input.schemaVersion,
      revision: 1,
      iv: input.iv,
      ciphertext: input.ciphertext,
      createdAt: timestamp,
      updatedAt: timestamp,
      keyVersion: input.keyVersion,
      wrappedKey: input.wrappedKey,
    };

    try {
      await container.items.create(createdDocument, {
        accessCondition: {
          type: 'IfNoneMatch',
          condition: '*',
        },
      });
      return createdDocument;
    } catch (error) {
      if (isStatusCode(error, 409) || isStatusCode(error, 412)) {
        const current = await getPlannerPersistenceDocument(input.userId);
        throw new RevisionConflictError(current?.revision ?? 1);
      }
      throw error;
    }
  }

  const updatedDocument: PlannerPersistenceDocument = {
    id: input.userId,
    schemaVersion: input.schemaVersion,
    revision: existingDocument.revision + 1,
    iv: input.iv,
    ciphertext: input.ciphertext,
    createdAt: existingDocument.createdAt,
    updatedAt: timestamp,
    keyVersion: input.keyVersion ?? existingDocument.keyVersion,
    wrappedKey: input.wrappedKey ?? existingDocument.wrappedKey,
  };

  try {
    await container.item(input.userId, input.userId).replace(updatedDocument, {
      accessCondition: {
        type: 'IfMatch',
        condition: existing.etag,
      },
    });
    return updatedDocument;
  } catch (error) {
    if (isStatusCode(error, 412) || isStatusCode(error, 409)) {
      const current = await getPlannerPersistenceDocument(input.userId);
      throw new RevisionConflictError(current?.revision ?? existingDocument.revision);
    }
    throw error;
  }
}
