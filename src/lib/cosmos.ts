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

export type DeviceRegistrationStatus = 'pending' | 'active' | 'revoked';

export interface DeviceRegistrationDocument {
  id: string;
  type: 'device';
  userId: string;
  deviceId: string;
  publicKey: string;
  status: DeviceRegistrationStatus;
  requestId: string | null;
  requestExpiresAt: string | null;
  label?: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface WrappedDekPackage {
  v: 1;
  suite: {
    kem: string;
    kdf: string;
    aead: string;
  };
  deviceId: string;
  requestId: string;
  enc: string;
  ciphertext: string;
  aad: string;
  createdAt: string;
}

export interface DeviceWrappedDekDocument {
  id: string;
  type: 'wrappedDek';
  userId: string;
  deviceId: string;
  requestId: string;
  wrappedKeyPackage: WrappedDekPackage;
  expiresAt: string;
  createdAt: string;
  consumedAt: string | null;
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

export class DeviceRegistrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceRegistrationConflictError';
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

function buildDeviceDocumentId(userId: string, deviceId: string): string {
  return `${userId}:device:${deviceId}`;
}

function buildWrappedDekDocumentId(userId: string, deviceId: string, requestId: string): string {
  return `${userId}:wrappedDek:${deviceId}:${requestId}`;
}

interface ExistingDeviceDocument {
  document: DeviceRegistrationDocument;
  etag: string;
}

async function readExistingDeviceDocument(
  userId: string,
  deviceId: string,
): Promise<ExistingDeviceDocument | null> {
  const id = buildDeviceDocumentId(userId, deviceId);
  try {
    const { resource } = await getPlannerContainer()
      .item(id, id)
      .read<DeviceRegistrationDocument>();

    if (!resource) return null;

    const resourceWithMetadata = resource as DeviceRegistrationDocument & { _etag?: string };
    if (!resourceWithMetadata._etag) {
      throw new Error('Missing _etag on device registration document.');
    }

    return {
      document: resource,
      etag: resourceWithMetadata._etag,
    };
  } catch (error) {
    if (isStatusCode(error, 404)) return null;
    throw error;
  }
}

export async function upsertDeviceRegistration(input: {
  userId: string;
  deviceId: string;
  publicKey: string;
  requestId: string;
  requestExpiresAt: string;
  label?: string;
}): Promise<DeviceRegistrationDocument> {
  const now = new Date().toISOString();
  const existing = await readExistingDeviceDocument(input.userId, input.deviceId);
  const id = buildDeviceDocumentId(input.userId, input.deviceId);
  const container = getPlannerContainer();

  if (!existing) {
    const created: DeviceRegistrationDocument = {
      id,
      type: 'device',
      userId: input.userId,
      deviceId: input.deviceId,
      publicKey: input.publicKey,
      status: 'pending',
      requestId: input.requestId,
      requestExpiresAt: input.requestExpiresAt,
      label: input.label,
      createdAt: now,
      lastSeenAt: now,
    };

    try {
      await container.items.create(created, {
        accessCondition: { type: 'IfNoneMatch', condition: '*' },
      });
      return created;
    } catch (error) {
      // If another request created the same device record concurrently, surface a stable conflict
      // response rather than leaking an unhandled 500 from the persistence layer.
      if (isStatusCode(error, 409) || isStatusCode(error, 412)) {
        const reread = await readExistingDeviceDocument(input.userId, input.deviceId);
        if (reread) return reread.document;
        throw new DeviceRegistrationConflictError('Device registration already exists.');
      }
      throw error;
    }
  }

  if (existing.document.status === 'revoked') {
    throw new DeviceRegistrationConflictError('Device registration is revoked.');
  }
  if (existing.document.publicKey !== input.publicKey) {
    throw new DeviceRegistrationConflictError('DeviceId is already registered with a different public key.');
  }

  const updated: DeviceRegistrationDocument = {
    ...existing.document,
    // Existing device public keys are immutable. Requests can be refreshed for the same key.
    requestId: existing.document.status === 'pending' ? input.requestId : existing.document.requestId,
    requestExpiresAt: existing.document.status === 'pending' ? input.requestExpiresAt : existing.document.requestExpiresAt,
    label: input.label ?? existing.document.label,
    lastSeenAt: now,
  };

  await container.item(id, id).replace(updated, {
    accessCondition: { type: 'IfMatch', condition: existing.etag },
  });
  return updated;
}

export async function listDeviceRegistrations(userId: string): Promise<DeviceRegistrationDocument[]> {
  const container = getPlannerContainer();
  const { resources } = await container.items
    .query<DeviceRegistrationDocument>(
      {
        query: 'SELECT * FROM c WHERE c.type = @type AND c.userId = @userId',
        parameters: [
          { name: '@type', value: 'device' },
          { name: '@userId', value: userId },
        ],
      },
    )
    .fetchAll();

  return resources ?? [];
}

export async function approveDeviceWrappedDek(input: {
  userId: string;
  deviceId: string;
  requestId: string;
  wrappedKeyPackage: WrappedDekPackage;
}): Promise<void> {
  const now = new Date().toISOString();
  const container = getPlannerContainer();

  const deviceExisting = await readExistingDeviceDocument(input.userId, input.deviceId);
  if (!deviceExisting) {
    throw new Error('Device registration not found.');
  }

  const device = deviceExisting.document;
  if (device.status === 'revoked') {
    throw new Error('Device is revoked.');
  }

  if (device.requestId !== input.requestId || !device.requestExpiresAt) {
    throw new Error('Approval request mismatch.');
  }

  if (new Date(device.requestExpiresAt).getTime() < Date.now()) {
    throw new Error('Approval request expired.');
  }

  const wrappedId = buildWrappedDekDocumentId(input.userId, input.deviceId, input.requestId);
  const wrappedDoc: DeviceWrappedDekDocument = {
    id: wrappedId,
    type: 'wrappedDek',
    userId: input.userId,
    deviceId: input.deviceId,
    requestId: input.requestId,
    wrappedKeyPackage: input.wrappedKeyPackage,
    expiresAt: device.requestExpiresAt,
    createdAt: now,
    consumedAt: null,
  };

  try {
    await container.items.create(wrappedDoc, {
      accessCondition: { type: 'IfNoneMatch', condition: '*' },
    });
  } catch (error) {
    // Approval is safe to retry. If the wrapped package already exists, treat it as success.
    if (isStatusCode(error, 409) || isStatusCode(error, 412)) return;
    throw error;
  }
}

async function readExistingWrappedDekDocument(
  userId: string,
  deviceId: string,
  requestId: string,
): Promise<{ document: DeviceWrappedDekDocument; etag: string } | null> {
  const id = buildWrappedDekDocumentId(userId, deviceId, requestId);
  try {
    const { resource } = await getPlannerContainer().item(id, id).read<DeviceWrappedDekDocument>();
    if (!resource) return null;
    const withMeta = resource as DeviceWrappedDekDocument & { _etag?: string };
    if (!withMeta._etag) throw new Error('Missing _etag on wrapped DEK document.');
    return { document: resource, etag: withMeta._etag };
  } catch (error) {
    if (isStatusCode(error, 404)) return null;
    throw error;
  }
}

export async function fetchApprovedWrappedDek(input: {
  userId: string;
  deviceId: string;
  requestId: string;
}): Promise<WrappedDekPackage | null> {
  const existing = await readExistingWrappedDekDocument(input.userId, input.deviceId, input.requestId);
  if (!existing) return null;

  const doc = existing.document;
  if (doc.consumedAt) return null;
  if (new Date(doc.expiresAt).getTime() < Date.now()) return null;

  return doc.wrappedKeyPackage;
}

export async function consumeApprovedWrappedDek(input: {
  userId: string;
  deviceId: string;
  requestId: string;
}): Promise<boolean> {
  const existing = await readExistingWrappedDekDocument(input.userId, input.deviceId, input.requestId);
  if (!existing) return false;

  const doc = existing.document;
  if (new Date(doc.expiresAt).getTime() < Date.now()) return false;
  if (doc.consumedAt) return true;

  const container = getPlannerContainer();
  const now = new Date().toISOString();

  try {
    await container.item(doc.id, doc.id).replace(
      { ...doc, consumedAt: now },
      { accessCondition: { type: 'IfMatch', condition: existing.etag } },
    );
  } catch (error) {
    // If another request consumed the package first, treat it as unavailable.
    if (isStatusCode(error, 409) || isStatusCode(error, 412)) return true;
    throw error;
  }

  const deviceExisting = await readExistingDeviceDocument(input.userId, input.deviceId);
  if (deviceExisting && deviceExisting.document.status !== 'revoked') {
    const device = deviceExisting.document;
    const updated: DeviceRegistrationDocument = {
      ...device,
      status: 'active',
      requestId: null,
      requestExpiresAt: null,
      lastSeenAt: now,
    };
    try {
      await container.item(device.id, device.id).replace(updated, {
        accessCondition: { type: 'IfMatch', condition: deviceExisting.etag },
      });
    } catch {
      // Best-effort. The wrapped DEK has already been consumed and returned to the device.
      // Device status can be repaired on the next registration/list refresh.
    }
  }

  return true;
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
