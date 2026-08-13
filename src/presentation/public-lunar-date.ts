import { plainDateEpoch } from "@/application/calculate-public-lunar-calendar";

export const PUBLIC_LUNAR_ROUTE_WINDOW_DAYS = 31;

export function publicLunarDateWindow(date: string, now: Date) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  let epoch: number;
  try {
    epoch = plainDateEpoch(date);
  } catch {
    return null;
  }
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (
    epoch < today ||
    epoch >= today + PUBLIC_LUNAR_ROUTE_WINDOW_DAYS * 86_400_000
  )
    return null;
  return Object.freeze({
    date,
    epoch,
    previousDate:
      epoch === today
        ? null
        : new Date(epoch - 86_400_000).toISOString().slice(0, 10),
    nextDate:
      epoch + 86_400_000 >= today + PUBLIC_LUNAR_ROUTE_WINDOW_DAYS * 86_400_000
        ? null
        : new Date(epoch + 86_400_000).toISOString().slice(0, 10),
  });
}

export function publicLunarRouteDates(now: Date) {
  const today = now.toISOString().slice(0, 10);
  const start = plainDateEpoch(today);
  return Object.freeze(
    Array.from({ length: PUBLIC_LUNAR_ROUTE_WINDOW_DAYS }, (_, index) =>
      new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    ),
  );
}
