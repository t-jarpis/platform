/** Waarde die er volgens de logica altijd is (index binnen het rooster, sleutel die bestaat). Anders een fout. */
export function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new RangeError("Waarde ontbreekt");
  return value;
}
