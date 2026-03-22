import type { DeviceRegistrationDocument, WrappedDekPackage } from '@/lib/cosmos';

export interface DevicesResponse {
  devices: DeviceRegistrationDocument[];
}

export async function fetchDevices(): Promise<DeviceRegistrationDocument[]> {
  const response = await fetch('/api/devices', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Device list failed (${response.status}).`);
  }
  const body = await response.json() as DevicesResponse;
  return body.devices ?? [];
}

export async function registerDevice(input: {
  deviceId: string;
  publicKey: string;
  requestId: string;
  requestExpiresAt: string;
  label?: string;
}): Promise<{
  deviceId: string;
  status: string;
  requestId: string | null;
  requestExpiresAt: string | null;
}> {
  const response = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Device registration failed (${response.status}).`);
  }
  const body = await response.json() as {
    deviceId: string;
    status: string;
    requestId: string | null;
    requestExpiresAt: string | null;
  };
  return body;
}

export async function activateDevice(input: {
  deviceId: string;
  publicKey: string;
  label?: string;
}): Promise<{ deviceId: string; status: string }> {
  const response = await fetch('/api/devices/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Device activation failed (${response.status}).`);
  }
  return await response.json() as { deviceId: string; status: string };
}

export async function approveDevice(input: {
  deviceId: string;
  approverDeviceId: string;
  requestId: string;
  wrappedKeyPackage: WrappedDekPackage;
}): Promise<void> {
  const response = await fetch(`/api/devices/${encodeURIComponent(input.deviceId)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: input.requestId,
      approverDeviceId: input.approverDeviceId,
      wrappedKeyPackage: input.wrappedKeyPackage,
    }),
  });

  if (response.status === 204) return;
  throw new Error(`Device approval failed (${response.status}).`);
}

export async function fetchWrappedDek(input: {
  deviceId: string;
  requestId: string;
}): Promise<WrappedDekPackage> {
  const url = new URL(`/api/devices/${encodeURIComponent(input.deviceId)}/wrapped-dek`, window.location.origin);
  url.searchParams.set('requestId', input.requestId);
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Wrapped key fetch failed (${response.status}).`);
  }
  const body = await response.json() as { wrappedKeyPackage: WrappedDekPackage };
  return body.wrappedKeyPackage;
}

export async function consumeWrappedDek(input: {
  deviceId: string;
  requestId: string;
}): Promise<void> {
  const response = await fetch(`/api/devices/${encodeURIComponent(input.deviceId)}/wrapped-dek`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: input.requestId }),
  });

  if (response.status === 204 || response.status === 404) return;
  throw new Error(`Wrapped key consume failed (${response.status}).`);
}
