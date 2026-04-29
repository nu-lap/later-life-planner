// ─── Domain types ─────────────────────────────────────────────────────────────

export type AspirationTag =
  | 'travel' | 'hobbies' | 'learning' | 'family'
  | 'volunteering' | 'property' | 'health' | 'fitness' | 'giving' | 'social';

/**
 * Spending tiers map to the product prompt's four category groups:
 *   essential     → Essential (housing, food, utilities, transport, insurance, healthcare)
 *   moderate      → Lifestyle (travel, dining, hobbies)
 *   aspirational  → Family & Giving (family support, charity, gifts)
 *   variable      → Other (home improvements, major purchases, buffer)
 */
export type SpendingTier = 'essential' | 'moderate' | 'aspirational' | 'variable';
export type PlanningMode = 'single' | 'couple';
export type RlssStandard = 'minimum' | 'moderate' | 'comfortable';
export type TaxJurisdiction = 'rUK' | 'scotland';
export type GoalId =
  | 'longevity_protection'
  | 'spending_floor'
  | 'aspirational_spending'
  | 'tax_efficiency'
  | 'liquidity_preservation'
  | 'survivorship'
  | 'care_reserve'
  | 'bequest'
  | 'inflation_resilience';

/** Who owns a shared asset. 'joint' splits CGT gains equally between both persons. */
export type AssetOwner = 'p1' | 'p2' | 'joint';

/**
 * Drawdown strategy for DC pensions.
 *
 * - `standard-ufpls`: Each DC withdrawal is 25% tax-free / 75% taxable (UFPLS).
 *   The full pot stays invested for longer; the LSA is consumed gradually.
 *
 * - `pcls-bed-isa`: At plan start, person1 takes the maximum Pension Commencement
 *   Lump Sum (up to the £268,275 LSA). The cash is reinvested into their ISA
 *   (up to the annual allowance) and GIA. All subsequent DC draws for person1
 *   are 100% taxable (LSA exhausted). Each year, up to the ISA annual allowance
 *   is transferred from person1's GIA to their ISA (pre- and post-FI), and from
 *   the joint GIA to person2's ISA (post-FI only). This Bed & ISA step builds a
 *   large tax-free ISA pot that can cover spending with minimal income tax.
 */
export type DrawdownStrategy = 'standard-ufpls' | 'pcls-bed-isa';

export interface GoalConfig {
  id: GoalId;
  priority: number;
  userWeight?: number;
  enabled: boolean;
  targetValue?: number;
}

export type GoalRegistry = GoalConfig[];

// ─── Life stages ──────────────────────────────────────────────────────────────

export interface LifeStage {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  color: string;
}

// ─── Care Reserve ─────────────────────────────────────────────────────────────

/**
 * Optional earmarked capital set aside for potential late-life care costs.
 * The reserve is invested (grows with the portfolio rate) but excluded from
 * the normal spending drawdown waterfall. If care costs never materialise,
 * it remains part of total portfolio value.
 */
export interface CareReserve {
  enabled: boolean;
  /** Amount in today's £. Grows with investmentGrowth in projections. */
  amount: number;
}

// ─── Primary Residence ────────────────────────────────────────────────────────

/**
 * The household's primary residence — distinct from investment/BTL property.
 * Used for IHT estate projections and RNRB eligibility.
 * Principal Private Residence relief means no CGT applies on sale.
 */
export interface PrimaryResidenceAsset {
  enabled: boolean;
  /** Estimated current market value in pounds. */
  currentValue: number;
  /** Outstanding mortgage balance — reduces net estate value for IHT. */
  mortgageOutstanding: number;
  /**
   * True if the property is intended to pass to direct descendants (children,
   * grandchildren). Required to claim the Residence Nil-Rate Band (RNRB).
   * IHTA 1984 s.8H.
   */
  leavesToDescendants: boolean;
}

// ─── Spending ─────────────────────────────────────────────────────────────────

export interface SpendingCategory {
  id: string;
  name: string;
  tier: SpendingTier;
  icon: string;           // Emoji icon
  description: string;
  maxValue: number;       // Slider upper bound
  amounts: Record<string, number>; // Keyed by life-stage id
}

/**
 * A one-off timed expenditure that sits on top of regular life-stage spending.
 * The engine inflation-adjusts each event to its target year and adds it to the
 * spending target, so the normal drawdown waterfall funds the spike from the most
 * tax-efficient bucket available in that year.
 */
export interface PlannedEvent {
  id: string;
  /** User-supplied label e.g. "Kitchen renovation" */
  name: string;
  /** Single emoji chosen from a preset list */
  emoji: string;
  /** Person 1's age when the expense falls */
  p1Age: number;
  /** Amount in today's £ */
  amount: number;
  /** When true (default), amount is inflation-adjusted to the target year */
  inflationLinked: boolean;
}

// ─── Income sources (per person) ─────────────────────────────────────────────

export interface StatePensionSource {
  enabled: boolean;
  weeklyAmount: number;
  startAge: number;
}

export interface DCPensionSource {
  enabled: boolean;
  totalValue: number;
  growthRate: number;     // Annual % — user-adjustable, default from config
  workplaceContributionPercent?: number;  // % of salary added each year until FI age
  workplaceSalary?: number;               // Current salary in today's money
  sippContributionAnnualGross?: number;   // Gross annual contribution in today's money
}

export interface DBPensionSource {
  enabled: boolean;
  annualIncome: number;
  startAge: number;
}

export interface AnnuitySource {
  enabled: boolean;
  annualIncome: number;
  startAge: number;
}

export interface PartTimeWorkSource {
  enabled: boolean;
  annualIncome: number;
  stopAge: number;
}

export interface OtherIncomeSource {
  enabled: boolean;
  annualAmount: number;
  description: string;
  startAge: number;
  stopAge: number;  // 0 = no end
}

export interface PersonIncomeSources {
  statePension: StatePensionSource;
  dbPension: DBPensionSource;
  annuity: AnnuitySource;
  dcPension: DCPensionSource;
  partTimeWork: PartTimeWorkSource;
  otherIncome: OtherIncomeSource;
}

// ─── Assets (per person) ─────────────────────────────────────────────────────

export interface CashSavingsAsset {
  enabled: boolean;
  totalValue: number;
}

export interface ISAAsset {
  enabled: boolean;
  totalValue: number;
  growthRate: number;
}

export interface GIAAsset {
  enabled: boolean;
  totalValue: number;
  baseCost: number;    // Purchase price — required for CGT calculation
  growthRate: number;
}

export interface PropertyAsset {
  enabled: boolean;
  propertyValue: number;
  baseCost: number;        // Original purchase price — for CGT planning
  annualRent: number;      // 0 if main home / not rented
  durationYears: number;   // How many years rental income continues
  /** Owner of the property — determines which person's rental income it counts toward. */
  owner: AssetOwner;
}

export interface PersonAssets {
  cashSavings: CashSavingsAsset;
  isaInvestments: ISAAsset;
  generalInvestments: GIAAsset;
  property: PropertyAsset;
}

// ─── Person ───────────────────────────────────────────────────────────────────

export interface Person {
  name: string;
  /**
   * Date of birth in ISO format (YYYY-MM-DD).
   * Used to compute currentAge precisely.
   */
  dateOfBirth: string;
  /** Computed from dateOfBirth at plan creation / update. Stored for performance. */
  currentAge: number;
  incomeSources: PersonIncomeSources;
  assets: PersonAssets;
}

// ─── Projection assumptions ───────────────────────────────────────────────────

export interface Assumptions {
  investmentGrowth: number;   // % p.a. — default from DEFAULT_ASSUMPTIONS
  inflation: number;          // % p.a. — default from DEFAULT_ASSUMPTIONS
  lifeExpectancy: number;     // Planning horizon age
  /**
   * When true, State Pension income is excluded from the taxable income
   * calculation in years where it is the person's only taxable income source.
   * Reflects the UK government's stated policy (2024) that sole-SP recipients
   * will not pay income tax. Togglable because policy may change.
   */
  statePensionSoleIncomeExempt: boolean;
}

// ─── Top-level planner state ──────────────────────────────────────────────────

export interface PlannerState {
  currentStep: number;
  maxVisitedStep: number;
  mode: PlanningMode;
  person1: Person;
  person2: Person;
  /**
   * Financial independence age for person1 — the age from which work becomes a choice.
   * Life stages (Go-Go Years, Slo-Go Years, No-Go Years) start from this age.
   * The period from person1.currentAge to fiAge-1 is the building phase, still
   * modelled in projections but using Go-Go Years spending as a baseline.
   */
  fiAge: number;
  lifeVision: string;
  aspirations: AspirationTag[];
  lifeStages: LifeStage[];
  spendingCategories: SpendingCategory[];
  assumptions: Assumptions;
  rlssStandard: RlssStandard | null;
  goalRegistry: GoalRegistry;
  /**
   * Jointly-held GIA shared between both persons.
   * Capital gains are split 50/50 across both persons' CGT allowances.
   * Only relevant in couple mode; ignored in single mode.
   */
  jointGia: GIAAsset;
  /**
   * Optional earmarked care reserve — excluded from normal drawdown.
   * See CareReserve interface above.
   */
  careReserve: CareReserve;
  /**
   * The household's primary residence — used for IHT estate projections.
   * See PrimaryResidenceAsset interface above.
   */
  primaryResidence: PrimaryResidenceAsset;
  /**
   * DC pension drawdown strategy.
   * - `standard-ufpls` (default): each DC draw is 25% tax-free via UFPLS.
   * - `pcls-bed-isa`: take full PCLS at a chosen age (≥ NMPA), reinvest into ISA + GIA,
   *   then Bed & ISA each year to build the ISA wrapper further.
   */
  drawdownStrategy: DrawdownStrategy;
  /**
   * Age at which person 1 crystallises their PCLS under the `pcls-bed-isa` strategy.
   * Must be ≥ 55 (or 57 if that calendar year is 2028 or later).
   * Defaults to `fiAge` when not set.
   */
  pclsAge?: number;
  /**
   * Financial independence age for person 2 — the age at which person 2's DC pension
   * contributions stop. This value is also used as the drawdown label anchor in Step 3.
   * Only used in couple mode; ignored in single mode.
   * When not set, the engine derives the age person 2 would be when person 1 reaches
   * `fiAge`, preserving backward-compatible behaviour for existing plans.
   */
  p2FiAge?: number;
  /**
   * One-off timed expenditures layered on top of regular life-stage spending.
   * Each event is inflation-adjusted (if inflationLinked) and added to the
   * spending target in the year it falls.
   */
  plannedEvents: PlannedEvent[];
}

export type PlannerUiState = Pick<PlannerState, 'currentStep' | 'maxVisitedStep'>;
export type PersistedPlannerState = Omit<PlannerState, keyof PlannerUiState>;
export type PlannerSaveStatus = 'local' | 'loading' | 'saving' | 'saved' | 'approval_required' | 'error' | 'conflict';

// ─── Projection output ────────────────────────────────────────────────────────

export interface YearlyProjection {
  yearIndex: number;
  p1Age: number;
  p2Age: number | null;
  lifeStage: string;
  spending: number;

  // Per-person fixed income
  p1StatePension: number;
  p1DbPension: number;
  p1PartTimeWork: number;
  p1OtherIncome: number;   // Includes annuity
  p1PropertyRent: number;
  p2StatePension: number;
  p2DbPension: number;
  p2PartTimeWork: number;
  p2OtherIncome: number;
  p2PropertyRent: number;

  // Per-person asset drawdowns
  p1IsaDrawdown: number;
  p1GiaDrawdown: number;
  p1CashDrawdown: number;
  p1DcDrawdown: number;
  p2IsaDrawdown: number;
  p2GiaDrawdown: number;
  p2CashDrawdown: number;
  p2DcDrawdown: number;

  // Combined drawdowns (chart convenience)
  isaDrawdown: number;
  giaDrawdown: number;
  cashDrawdown: number;
  dcDrawdown: number;
  /** Tax-free portion of DC pension drawn via UFPLS this year (25% per withdrawal, capped at remaining LSA). */
  dcTaxFreeDrawdown: number;
  propertyRent: number;

  // CGT
  p1CapitalGain: number;
  p2CapitalGain: number;
  p1CgtPaid: number;
  p2CgtPaid: number;
  totalCgtPaid: number;

  // Income tax
  p1IncomeTax: number;
  p2IncomeTax: number;
  incomeTaxPaid: number;

  // Totals
  totalIncome: number;
  totalTaxPaid: number;
  netIncome: number;
  gap: number;

  // Care Reserve balance (earmarked, not drawn for spending)
  careReserveBalance: number;

  // Asset balances (end of year)
  p1IsaBalance: number;
  p1GiaValue: number;
  p1GiaBaseCost: number;
  p1CashBalance: number;
  p1DcBalance: number;
  p2IsaBalance: number;
  p2GiaValue: number;
  p2GiaBaseCost: number;
  p2CashBalance: number;
  p2DcBalance: number;
  jointGiaValue: number;
  jointGiaBaseCost: number;
  totalAssets: number;

  // PCLS + Bed & ISA strategy tracking (zero when strategy = 'standard-ufpls')
  /** PCLS lump sum taken at plan start (person1 only, year 0 event). */
  p1PclsEvent: number;
  /** Total transferred into person1 ISA via Bed & ISA this year (individual + joint GIA). */
  p1BedIsaTransfer: number;
  /** Amount from person1's own individual GIA → person1 ISA (subset of p1BedIsaTransfer). */
  p1IndivBedIsaTransfer: number;
  /** Amount from the joint GIA → person1 ISA (subset of p1BedIsaTransfer). */
  p1JointBedIsaTransfer: number;
  /** Total transferred into person2 ISA via Bed & ISA this year (individual + joint GIA). */
  p2BedIsaTransfer: number;
  /** Amount from person2's own individual GIA → person2 ISA (subset of p2BedIsaTransfer). */
  p2IndivBedIsaTransfer: number;
  /** Amount from the joint GIA → person2 ISA (subset of p2BedIsaTransfer). */
  p2JointBedIsaTransfer: number;
  /** Sum of all PlannedEvent amounts (inflation-adjusted) falling in this year. Zero when no events. */
  plannedEventSpend: number;
}

// ─── Simulation result (dashboard summary) ───────────────────────────────────

export interface SimulationResult {
  projections: YearlyProjection[];
  depletionAge: number | null;
  lifetimeTaxPaid: number;
  lifetimeCGT: number;
  sustainableRlssLevel: RlssStandard | null;
}

// ─── Gamification metrics ────────────────────────────────────────────────────

export interface GamificationMetrics {
  /**
   * Income stability score (0–100).
   * Measures what % of spending is covered by guaranteed income (State Pension,
   * DB pension, annuity). Higher = more stable.
   */
  incomeStabilityScore: number;
  /**
   * Spending confidence score (0–100).
   * Based on how many years the plan remains funded vs. planning horizon.
   */
  spendingConfidenceScore: number;
  /**
   * Number of aspirations (life goals) that can be "funded" within current projections.
   * Funded = spending in aspirational/moderate tiers > 0 in all stages.
   */
  fundedGoalsCount: number;
  totalGoalsCount: number;
}
