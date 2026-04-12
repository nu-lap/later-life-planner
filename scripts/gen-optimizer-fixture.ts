import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { paulAndLisaState } from '../tests/fixtures/states';
import { optimizeWithdrawals } from '../src/financialEngine/withdrawalOptimizer';

function makeFixture() {
  const result = optimizeWithdrawals(paulAndLisaState());

  const counts = Object.fromEntries(
    result.yearRecords.reduce((map, record) => {
      map.set(record.winner.strategy.label, (map.get(record.winner.strategy.label) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  );

  const fixture = {
    recommended: result.recommendedStrategy.label,
    lifetimeTaxSaving: result.lifetimeTaxSaving,
    lifetimeTaxPaid: result.lifetimeTaxPaid,
    baselineLifetimeTaxPaid: result.baselineLifetimeTaxPaid,
    assetDepletionAge: result.assetDepletionAge,
    baselineAssetDepletionAge: result.baselineAssetDepletionAge,
    terminalAssets: result.terminalAssets,
    yearCount: result.yearRecords.length,
    firstYear: {
      label: result.yearRecords[0].winner.strategy.label,
      totalTax: result.yearRecords[0].winner.totalTax,
      terminalAssets: result.yearRecords[0].terminalAssets,
    },
    lastYear: {
      label: result.yearRecords.at(-1)!.winner.strategy.label,
      totalTax: result.yearRecords.at(-1)!.winner.totalTax,
      terminalAssets: result.yearRecords.at(-1)!.terminalAssets,
    },
    counts,
  };

  const outPath = resolve('tests/fixtures/withdrawal-optimizer-paul-lisa.json');
  writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
  console.log('Fixture written to', outPath);
}

makeFixture();
