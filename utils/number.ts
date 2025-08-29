export const toCount = (v: unknown): number => {
  const n = Number((v as any) ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const inc = (v: unknown, delta: number): number => {
  const next = toCount(v) + delta;
  return next < 0 ? 0 : next;
};