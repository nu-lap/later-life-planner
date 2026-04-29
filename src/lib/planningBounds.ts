export const MIN_PLANNING_HORIZON = 80;
export const MAX_PLANNING_HORIZON = 105;
export const MIN_LIFE_STAGE_YEARS = 3;
export const MIN_SUPPORTED_CURRENT_AGE = 18;
export const MAX_SUPPORTED_CURRENT_AGE = MAX_PLANNING_HORIZON - (MIN_LIFE_STAGE_YEARS - 1);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isIsoDate(dateOfBirth: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
  return !Number.isNaN(new Date(dateOfBirth).getTime());
}

export function getMinSupportedDob(): string {
  const year = new Date().getFullYear() - MAX_SUPPORTED_CURRENT_AGE;
  return `${year}-01-01`;
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function getMaxSupportedDob(): string {
  const latestAdultDate = new Date();
  latestAdultDate.setFullYear(latestAdultDate.getFullYear() - MIN_SUPPORTED_CURRENT_AGE);
  return latestAdultDate.toISOString().split('T')[0];
}

export function clampCurrentAge(age: number): number {
  return clamp(age, MIN_SUPPORTED_CURRENT_AGE, MAX_SUPPORTED_CURRENT_AGE);
}

export function getLifeExpectancyMin(primaryCurrentAge: number, secondaryCurrentAge: number = 0): number {
  return Math.max(
    MIN_PLANNING_HORIZON,
    clampCurrentAge(primaryCurrentAge) + MIN_LIFE_STAGE_YEARS - 1,
    clampCurrentAge(secondaryCurrentAge),
  );
}

export function clampLifeExpectancy(
  lifeExpectancy: number,
  primaryCurrentAge: number,
  secondaryCurrentAge: number = 0,
): number {
  return clamp(
    lifeExpectancy,
    getLifeExpectancyMin(primaryCurrentAge, secondaryCurrentAge),
    MAX_PLANNING_HORIZON,
  );
}

export function getFiAgeMax(lifeExpectancy: number): number {
  return lifeExpectancy - (MIN_LIFE_STAGE_YEARS - 1);
}

export function clampFiAge(fiAge: number, currentAge: number, lifeExpectancy: number): number {
  const normalizedCurrentAge = clampCurrentAge(currentAge);
  const normalizedLifeExpectancy = clampLifeExpectancy(lifeExpectancy, normalizedCurrentAge);
  return clamp(fiAge, normalizedCurrentAge, getFiAgeMax(normalizedLifeExpectancy));
}

export function clampP2FiAge(
  p2FiAge: number | undefined,
  p2CurrentAge: number,
  lifeExpectancy: number,
): number | undefined {
  if (p2FiAge === undefined) return undefined;
  return clampFiAge(p2FiAge, p2CurrentAge, lifeExpectancy);
}

export function normalizePlanningBounds(
  currentAge: number,
  secondaryCurrentAge: number,
  fiAge: number,
  lifeExpectancy: number,
  p2FiAge?: number,
) {
  const normalizedCurrentAge = clampCurrentAge(currentAge);
  const normalizedSecondaryCurrentAge = clampCurrentAge(secondaryCurrentAge);
  const normalizedLifeExpectancy = clampLifeExpectancy(
    lifeExpectancy,
    normalizedCurrentAge,
    normalizedSecondaryCurrentAge,
  );

  return {
    currentAge: normalizedCurrentAge,
    secondaryCurrentAge: normalizedSecondaryCurrentAge,
    lifeExpectancy: normalizedLifeExpectancy,
    fiAge: clampFiAge(fiAge, normalizedCurrentAge, normalizedLifeExpectancy),
    p2FiAge: clampP2FiAge(p2FiAge, normalizedSecondaryCurrentAge, normalizedLifeExpectancy),
  };
}

export function getRangeProgress(value: number, min: number, max: number): number {
  if (max <= min) return 100;
  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

export function clampDateOfBirth(dateOfBirth: string): string {
  if (!dateOfBirth) return dateOfBirth;
  if (!isIsoDate(dateOfBirth)) return '';
  return dateOfBirth < getMinSupportedDob()
    ? getMinSupportedDob()
    : dateOfBirth > getMaxSupportedDob()
      ? getMaxSupportedDob()
      : dateOfBirth;
}
