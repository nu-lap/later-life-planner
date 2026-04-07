import { describe, expect, test } from 'vitest';
import { formatTooltipAge } from '@/components/charts/AssetChart';

describe('formatTooltipAge', () => {
  test('shows both ages for couple projections', () => {
    expect(formatTooltipAge(64, 65)).toBe('Age 64 / 65');
  });

  test('shows a single age when there is no partner age', () => {
    expect(formatTooltipAge(68, null)).toBe('Age 68');
  });
});
