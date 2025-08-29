export type WithId = { id: string };

export function uniqById<T extends WithId>(arr: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of arr) map.set(item.id, item);
  return Array.from(map.values());
}

export function upsertById<T extends WithId>(arr: T[], item: T): T[] {
  const map = new Map(arr.map(i => [i.id, i]));
  map.set(item.id, item);
  return Array.from(map.values());
}