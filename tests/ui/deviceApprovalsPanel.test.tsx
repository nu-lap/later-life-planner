import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeviceApprovalsPanel from '@/components/account/DeviceApprovalsPanel';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('DeviceApprovalsPanel', () => {
  test('prefills approval input when defaultApprovalInput is provided later', async () => {
    const onRefreshDevices = vi.fn();
    const onApproveDevice = vi.fn();

    const { rerender } = render(
      <DeviceApprovalsPanel
        devices={[]}
        onRefreshDevices={onRefreshDevices}
        onApproveDevice={onApproveDevice}
        defaultApprovalInput=""
      />,
    );

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    rerender(
      <DeviceApprovalsPanel
        devices={[]}
        onRefreshDevices={onRefreshDevices}
        onApproveDevice={onApproveDevice}
        defaultApprovalInput="https://example.com/account/devices/approve#code=abc"
      />,
    );

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('#code=abc');
  });
});

