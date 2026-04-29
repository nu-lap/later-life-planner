import { CGT, IHT, PENSION_RULES } from '@/config/financialConstants';

export const GLOSSARY: Record<string, string> = {
  CGT: `Capital Gains Tax — tax on investment growth above the £${CGT.ANNUAL_EXEMPT.toLocaleString('en-GB')} annual exempt amount per person.`,
  GIA: 'General Investment Account — a taxable investment account (shares, funds, bonds) held outside a tax wrapper. Gains are subject to CGT on disposal.',
  ISA: 'Individual Savings Account — a tax-free investment wrapper. Withdrawals are completely free of income tax, CGT, and have no impact on your personal allowance.',
  LSA: `Lump Sum Allowance — the total tax-free cash you can take from your pension across your lifetime (currently £${PENSION_RULES.PCLS_LUMP_SUM_ALLOWANCE.toLocaleString('en-GB')}).`,
  RNRB: `Residence Nil-Rate Band — an additional IHT allowance (up to £${IHT.RNRB.toLocaleString('en-GB')}/person) available when you leave your main home to direct descendants (children, grandchildren). In couple mode both allowances can be stacked.`,
  SIPP: 'Self-Invested Personal Pension — a flexible pension pot you manage yourself. Each withdrawal is 25% tax-free and 75% taxable income.',
  UFPLS: 'Uncrystallised Funds Pension Lump Sum — a way of drawing from your pension where each withdrawal is 25% tax-free and 75% taxable, using your tax-free entitlement gradually over time.',
  PCLS: 'Pension Commencement Lump Sum — the tax-free cash taken when you crystallise (formally access) your pension. Typically 25% of the pot, subject to the Lump Sum Allowance.',
  'Bed & ISA': 'Bed & ISA — selling investments from a GIA and immediately repurchasing them inside an ISA wrapper. The sale crystallises any capital gain (potentially triggering CGT) but future growth is sheltered from tax.',
  'DC pension': 'Defined Contribution pension — a pension pot built from contributions. At retirement you draw from the pot; each withdrawal is 25% tax-free and 75% taxable income.',
  'Effective rate': 'Effective tax rate — your total lifetime tax (income tax + CGT) as a percentage of total gross income. A useful summary of overall tax efficiency.',

  // IHT-specific terms
  IHT: `Inheritance Tax — a ${IHT.RATE * 100}% tax on estates above the nil-rate bands. Currently charged on the portion of the estate exceeding the NRB (£${IHT.NRB.toLocaleString('en-GB')}) and RNRB where applicable.`,
  NRB: `Nil-Rate Band — each person's IHT-free threshold (£${IHT.NRB.toLocaleString('en-GB')}). In a couple, any unused NRB transfers to the surviving spouse, potentially doubling it to £${(IHT.NRB * 2).toLocaleString('en-GB')}.`,
  PET: 'Potentially Exempt Transfer — a gift to an individual that becomes fully exempt from IHT if the giver survives at least 7 years after making it. If death occurs within 7 years, tapered IHT may apply.',
  'Chargeable estate': `The gross estate value after deducting all available nil-rate bands (NRB + RNRB). Inheritance Tax at ${IHT.RATE * 100}% applies to this amount.`,
  'Gross estate': `The total value of all assets — property, investments, cash, and pension (from April ${IHT.PENSION_ESTATE_INCLUSION_YEAR}) — before any nil-rate band deductions. This is the starting point for the IHT calculation.`,
  NMPA: 'Normal Minimum Pension Age — the earliest age you can normally access your pension without a protected pension age. Currently 55, rising to 57 in April 2028.',
  's.21 surplus income': 'Normal expenditure out of income (IHTA 1984 s.21) — gifts made regularly from surplus income (income that exceeds your normal living costs) are immediately exempt from IHT with no 7-year survival requirement.',
  's.19 annual exemption': `Annual exempt gift allowance (IHTA 1984 s.19) — you can give away £${IHT.ANNUAL_GIFT_EXEMPTION.toLocaleString('en-GB')}/year per person free of IHT, regardless of other gifts. Any unused allowance can be carried forward one year.`,
};
