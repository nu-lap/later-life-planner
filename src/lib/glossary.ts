import { CGT } from '@/config/financialConstants';

export const GLOSSARY: Record<string, string> = {
  CGT: `Capital Gains Tax — tax on investment growth above the £${CGT.ANNUAL_EXEMPT.toLocaleString('en-GB')} annual exempt amount per person.`,
  GIA: 'General Investment Account — a taxable investment account (shares, funds, bonds) held outside a tax wrapper. Gains are subject to CGT on disposal.',
  ISA: 'Individual Savings Account — a tax-free investment wrapper. Withdrawals are completely free of income tax, CGT, and have no impact on your personal allowance.',
  LSA: 'Lump Sum Allowance — the total tax-free cash you can take from your pension across your lifetime (currently £268,275).',
  RNRB: 'Residence Nil-Rate Band — an additional IHT allowance (up to £175,000) available when you leave your main residence to direct descendants.',
  SIPP: 'Self-Invested Personal Pension — a flexible pension pot you manage yourself. Each withdrawal is 25% tax-free and 75% taxable income.',
  UFPLS: 'Uncrystallised Funds Pension Lump Sum — a way of drawing from your pension where each withdrawal is 25% tax-free and 75% taxable, using your tax-free entitlement gradually over time.',
  PCLS: 'Pension Commencement Lump Sum — the tax-free cash taken when you crystallise (formally access) your pension. Typically 25% of the pot, subject to the Lump Sum Allowance.',
  'Bed & ISA': 'Bed & ISA — selling investments from a GIA and immediately repurchasing them inside an ISA wrapper. The sale crystallises any capital gain (potentially triggering CGT) but future growth is sheltered from tax.',
  'DC pension': 'Defined Contribution pension — a pension pot built from contributions. At retirement you draw from the pot; each withdrawal is 25% tax-free and 75% taxable income.',
  'Effective rate': 'Effective tax rate — your total lifetime tax (income tax + CGT) as a percentage of total gross income. A useful summary of overall tax efficiency.',
};
