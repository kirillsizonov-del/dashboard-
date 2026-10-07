import { CHANNEL_IDS, FUNNEL_STAGES } from "./types";
import type { ChannelId, DB, Ev, FunnelStage, Range } from "./types";

export const DAY = 86_400_000;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Локальная полночь через n суток. Через setDate, чтобы не ломаться на переводе часов. */
export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function sinceOf(range: Range, now = Date.now()): number {
  if (range === "all") return 0;
  return addDays(startOfDay(now), range === "7d" ? -6 : -29);
}

export function eventsSince(db: DB, since: number): Ev[] {
  return Object.values(db.events)
    .filter((e) => e.ts >= since)
    .sort((a, b) => a.ts - b.ts);
}

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const weekdayName = (i: number) => WEEKDAYS[i];
export const shortDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
/** 0 = понедельник. */
export const weekdayIndex = (ts: number) => (new Date(ts).getDay() + 6) % 7;

export interface HeatCell {
  ts: number;
  key: string;
  count: number;
  future: boolean;
}

/** Колонки по неделям (Пн–Вс), последняя колонка содержит сегодня. */
export function heatWeeks(events: Ev[], weeks: number, now = Date.now()): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const k = dayKey(e.ts);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const today = startOfDay(now);
  const monday = addDays(today, -weekdayIndex(today));
  const first = addDays(monday, -(weeks - 1) * 7);
  const out: HeatCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const ts = addDays(first, w * 7 + d);
      const key = dayKey(ts);
      col.push({ ts, key, count: counts.get(key) ?? 0, future: ts > today });
    }
    out.push(col);
  }
  return out;
}

export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (max <= 4) return Math.min(4, count) as 1 | 2 | 3 | 4;
  return Math.max(1, Math.min(4, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4;
}

export type Series = ChannelId | "none";
export const SERIES: Series[] = [...CHANNEL_IDS, "none"];

export interface DayBucket {
  ts: number;
  key: string;
  label: string;
  total: number;
  by: Record<Series, number>;
}

export function perDay(events: Ev[], days: number, now = Date.now()): DayBucket[] {
  const today = startOfDay(now);
  const buckets: DayBucket[] = [];
  const index = new Map<string, DayBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const ts = addDays(today, -i);
    const b: DayBucket = {
      ts,
      key: dayKey(ts),
      label: shortDate(ts),
      total: 0,
      by: { x: 0, threads: 0, discord: 0, reddit: 0, none: 0 },
    };
    buckets.push(b);
    index.set(b.key, b);
  }
  for (const e of events) {
    const b = index.get(dayKey(e.ts));
    if (!b) continue;
    b.total++;
    b.by[e.channelId ?? "none"]++;
  }
  return buckets;
}

/** [день недели, 0 = Пн][час] */
export function hourGrid(events: Ev[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const e of events) grid[weekdayIndex(e.ts)][new Date(e.ts).getHours()]++;
  return grid;
}

export function peakHour(events: Ev[]): number | null {
  if (!events.length) return null;
  const hours = Array<number>(24).fill(0);
  for (const e of events) hours[new Date(e.ts).getHours()]++;
  let best = 0;
  hours.forEach((c, h) => {
    if (c > hours[best]) best = h;
  });
  return best;
}

export function activeDays(events: Ev[]): number {
  return new Set(events.map((e) => dayKey(e.ts))).size;
}

export function streak(events: Ev[], now = Date.now()): number {
  const days = new Set(events.map((e) => dayKey(e.ts)));
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Сколько целей дошло до каждого этапа. since = 0 считает и импортированные без даты. */
export function funnel(db: DB, since: number, channelId?: ChannelId): Record<FunnelStage, number> {
  const out = { sent: 0, replied: 0, concept: 0, call: 0, won: 0 };
  for (const t of Object.values(db.targets)) {
    if (channelId && t.channelId !== channelId) continue;
    for (const s of FUNNEL_STAGES) {
      const at = t.at[s];
      if (at !== undefined && at >= since) out[s]++;
    }
  }
  return out;
}

/** Сколько раз писали или постили. За всё время считаем по целям, за период по журналу. */
export function touches(db: DB, since: number, channelId?: ChannelId): number {
  if (since === 0) {
    return Object.values(db.targets)
      .filter((t) => !channelId || t.channelId === channelId)
      .reduce((n, t) => n + t.touches, 0);
  }
  return Object.values(db.events).filter(
    (e) => e.type === "target.touch" && e.ts >= since && (!channelId || e.channelId === channelId),
  ).length;
}

/**
 * Сколько касаний сегодня с каждого аккаунта канала. Ключ "" = аккаунт не указан.
 * В старых событиях аккаунта нет: берём тот, за которым цель закреплена сейчас.
 */
export function todayByAccount(db: DB, channelId: ChannelId, now = Date.now(), since = startOfDay(now), handles?: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of Object.values(db.events)) {
    if (e.type !== "target.touch" || e.channelId !== channelId || e.ts < since) continue;
    const via = e.ref ? db.targets[e.ref]?.via : undefined;
    // Ника из касания уже нет в списке (переименовали): считаем по нынешнему аккаунту цели
    const gone = handles && e.account && !handles.includes(e.account);
    const k = (gone ? via || e.account : e.account) ?? via ?? "";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export interface AccountStats {
  total: number;
  /** Сколько целей уже получили хотя бы одно касание. */
  sent: number;
  replied: number;
  today: number;
}

/** Счёт по аккаунтам канала. Ключ "" = аккаунт не выбран или его уже нет в списке. dayStart: начало «сегодня». */
export function statsByAccount(
  db: DB,
  channelId: ChannelId,
  handles: string[],
  now = Date.now(),
  dayStart = startOfDay(now),
): Record<string, AccountStats> {
  const out: Record<string, AccountStats> = {};
  for (const h of [...handles, ""]) out[h] = { total: 0, sent: 0, replied: 0, today: 0 };
  const key = (via?: string) => (via && handles.includes(via) ? via : "");
  for (const t of Object.values(db.targets)) {
    if (t.channelId !== channelId) continue;
    const s = out[key(t.via)];
    s.total++;
    if (t.touches > 0) s.sent++;
    if (t.at.replied !== undefined) s.replied++;
  }
  for (const [k, n] of Object.entries(todayByAccount(db, channelId, now, dayStart, handles))) out[key(k)].today += n;
  return out;
}

export interface ChannelStats {
  total: number;
  reached: number;
  replied: number;
  won: number;
  today: number;
  openTasks: number;
}

/** dayStart: начало «сегодня». По умолчанию полночь браузера, у кругов полночь их часового пояса. */
export function channelStats(db: DB, id: ChannelId, now = Date.now(), dayStart = startOfDay(now)): ChannelStats {
  const targets = Object.values(db.targets).filter((t) => t.channelId === id);
  return {
    total: targets.length,
    reached: targets.filter((t) => t.touches > 0).length,
    replied: targets.filter((t) => t.at.replied !== undefined).length,
    won: targets.filter((t) => t.stage === "won").length,
    today: touches(db, dayStart, id),
    openTasks: Object.values(db.tasks).filter((t) => t.channelId === id && t.status !== "done").length,
  };
}

export function byMember(db: DB, events: Ev[]): { id: string; name: string; color: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const k = e.by && db.members[e.by] ? e.by : "";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const rows = Object.values(db.members).map((m) => ({ id: m.id, name: m.name, color: m.color, count: counts.get(m.id) ?? 0 }));
  const anon = counts.get("") ?? 0;
  if (anon) rows.push({ id: "", name: "Без имени", color: "var(--c-none)", count: anon });
  return rows.sort((a, b) => b.count - a.count);
}

export interface FlowPoint {
  ts: number;
  label: string;
  created: number;
  done: number;
}

export function taskFlow(events: Ev[], days: number, now = Date.now()): FlowPoint[] {
  const today = startOfDay(now);
  const points: FlowPoint[] = [];
  const index = new Map<string, FlowPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const ts = addDays(today, -i);
    const p = { ts, label: shortDate(ts), created: 0, done: 0 };
    points.push(p);
    index.set(dayKey(ts), p);
  }
  for (const e of events) {
    const p = index.get(dayKey(e.ts));
    if (!p) continue;
    if (e.type === "task.add") p.created++;
    else if (e.type === "task.done" || e.type === "task.daily") p.done++;
    else if (e.type === "task.reopen") p.done = Math.max(0, p.done - 1);
  }
  return points;
}

/** Сколько дней показывать на графиках для выбранного периода. */
export function daysFor(range: Range, events: Ev[], now = Date.now()): number {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  if (!events.length) return 14;
  const span = Math.round((startOfDay(now) - startOfDay(events[0].ts)) / DAY) + 1;
  return Math.max(14, Math.min(90, span));
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24 && dayKey(ts) === dayKey(now)) return `${h} ч назад`;
  if (dayKey(ts) === dayKey(addDays(startOfDay(now), -1))) return "вчера";
  return shortDate(ts);
}
