// F24: legal helpers shared by web clients and node tests
// (importable under node type-stripping: no enums, no namespaces).
// ageOnDate mirrors the worker gate and the Go gate exactly; all three are
// pinned by the same boundary cases (node f24 suite, Go TestAgeOnDate,
// Flutter legal_test.dart).

export function ageOnDate(birthdate: string, onDay: string): number | null {
  if (typeof birthdate !== 'string' || typeof onDay !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate.trim());
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(onDay.trim());
  if (!m || !d) return null;
  const by = Number(m[1]);
  const bm = Number(m[2]);
  const bd = Number(m[3]);
  const oy = Number(d[1]);
  const om = Number(d[2]);
  const od = Number(d[3]);
  if (bm < 1 || bm > 12 || om < 1 || om > 12) return null;
  const dim = (y: number, mo: number): number =>
    new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (bd < 1 || bd > dim(by, bm) || od < 1 || od > dim(oy, om)) return null;
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age--;
  return age < 0 ? null : age;
}

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
