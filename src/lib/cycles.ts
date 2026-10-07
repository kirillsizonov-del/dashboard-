import { startOfDay } from "./analytics";
import { plural } from "./meta";
import type { Channel, ChannelId, Target } from "./types";

/**
 * Круги рассылки: галочка значит «отмечено в текущем круге».
 * Круги идут от полуночи в часовом поясе канала, по умолчанию каждые 4 часа по Тбилиси.
 * Сброс ничего не пишет в базу: кружок пустеет сам, потому что начался новый круг.
 */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const CYCLE_TZ = "Asia/Tbilisi";
export const CYCLE_HOURS_DEFAULT = 4;
/** Длительности круга: делители суток, чтобы круги шли ровно от полуночи. Другой сохранённый делитель тоже работает. */
export const CYCLE_HOURS = [4, 6, 8, 12, 24];
/** «Можно постить раз в»: 4 ч по умолчанию, то есть раз в круг. */
export const COOLDOWN_HOURS = [4, 8, 12, 24, 48, 168];

export interface CycleCfg {
  hours: number;
  tz: string;
  notify: boolean;
}

/** Текущий круг: начало, конец и подпись «12:00-16:00». */
export interface Cycle {
  start: number;
  end: number;
  label: string;
}

/** Круги включены: флаг канала, без флага только у Telegram. */
export function cyclesOn(id: ChannelId, ch?: Pick<Channel, "cyclesEnabled"> | null): boolean {
  return ch?.cyclesEnabled ?? id === "discord";
}

const formats = new Map<string, Intl.DateTimeFormat>();

function format(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formats.set(tz, f);
  }
  return f;
}

/** Пояс, который понимает браузер. Неизвестный или пустой: Тбилиси. */
export function validTz(tz?: string | null): string {
  if (!tz) return CYCLE_TZ;
  try {
    format(tz);
    return tz;
  } catch {
    return CYCLE_TZ;
  }
}

export function cycleCfg(ch?: Pick<Channel, "cycleHours" | "cycleTz" | "cycleNotify"> | null): CycleCfg {
  const h = Number(ch?.cycleHours);
  return {
    hours: h > 0 && h <= 24 ? h : CYCLE_HOURS_DEFAULT,
    tz: validTz(ch?.cycleTz),
    notify: ch?.cycleNotify ?? true,
  };
}

/** Сдвиг пояса в момент ts: местное время = ts + сдвиг. Считаем через Intl, пояс браузера не важен. */
function offsetAt(ts: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const x of format(tz).formatToParts(ts)) if (x.type !== "literal") p[x.type] = Number(x.value);
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return local - (ts - (ts % 1000));
}

/** «Настенное» время пояса как число: мс от 1970-01-01 00:00 по местным часам. */
const wall = (ts: number, tz: string) => ts + offsetAt(ts, tz);

/** Обратно из настенного времени в момент. Второй проход нужен на смене летнего времени. */
function fromWall(w: number, tz: string): number {
  const ts = w - offsetAt(w, tz);
  return w - offsetAt(ts, tz);
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Мс от полуночи в «ЧЧ:ММ». Конец суток пишем как 24:00. */
const clock = (ms: number) => `${pad(Math.floor(ms / HOUR))}:${pad(Math.floor((ms % HOUR) / MIN))}`;

export function cycleAt(ts: number, cfg: Pick<CycleCfg, "hours" | "tz">): Cycle {
  const w = wall(ts, cfg.tz);
  const day = Math.floor(w / DAY) * DAY;
  const step = cfg.hours * HOUR;
  const sw = day + Math.floor((w - day) / step) * step;
  const ew = Math.min(sw + step, day + DAY);
  return { start: fromWall(sw, cfg.tz), end: fromWall(ew, cfg.tz), label: `${clock(sw - day)}-${clock(ew - day)}` };
}

/** Начало текущего круга. */
export const cycleStart = (ts: number, cfg: Pick<CycleCfg, "hours" | "tz">) => cycleAt(ts, cfg).start;
/** Конец текущего круга, он же начало следующего. */
export const cycleEnd = (ts: number, cfg: Pick<CycleCfg, "hours" | "tz">) => cycleAt(ts, cfg).end;

/** Полночь календарного дня в поясе: от неё считается плитка «Сегодня». */
export function dayStartIn(ts: number, tz: string): number {
  return fromWall(Math.floor(wall(ts, tz) / DAY) * DAY, tz);
}

/** Начало «сегодня» для канала: с кругами полночь их пояса, без кругов полночь браузера. */
export function todayStart(id: ChannelId, ch: Channel | null | undefined, ts: number): number {
  return cyclesOn(id, ch) ? dayStartIn(ts, cycleCfg(ch).tz) : startOfDay(ts);
}

/** Все границы кругов за сутки: «00:00, 04:00, 08:00…». */
export function boundaries(hours: number): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h += hours) out.push(clock(h * HOUR));
  return out;
}

export type Mark = { state: "empty" } | { state: "marked" } | { state: "locked"; until: number };

const EMPTY: Mark = { state: "empty" };
const MARKED: Mark = { state: "marked" };

/**
 * Состояние кружка цели. Отмечен, если касание было в текущем круге.
 * Кулдаун длиннее круга держит кружок закрытым до lastTouchAt + кулдаун.
 */
export function markOf(t: Pick<Target, "lastTouchAt" | "cooldownHours">, cycle: { start: number; hours: number }, at: number): Mark {
  const last = t.lastTouchAt;
  if (last === null || last === undefined) return EMPTY;
  if (last >= cycle.start) return MARKED;
  const cd = Number(t.cooldownHours) || 0;
  if (cd > cycle.hours) {
    const until = last + cd * HOUR;
    if (until > at) return { state: "locked", until };
  }
  return EMPTY;
}

/** Сколько ждать: «45 мин», «3 ч 20 мин», «18 ч», «2 д 4 ч». */
export function waitText(ms: number): string {
  const m = Math.max(1, Math.round(ms / MIN));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 10) return rest ? `${h} ч ${rest} мин` : `${h} ч`;
  if (h < 24) return `${Math.round(m / 60)} ч`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} д ${h % 24} ч` : `${d} д`;
}

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** «в 14:20», а если не сегодня, то «8 окт в 14:20». Время по поясу канала. */
export function atText(ts: number, today: number, tz: string): string {
  const w = wall(ts, tz);
  const day = Math.floor(w / DAY) * DAY;
  const time = `в ${clock(w - day)}`;
  if (day === Math.floor(wall(today, tz) / DAY) * DAY) return time;
  const d = new Date(day);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${time}`;
}

/** «ЧЧ:ММ:СС» до конца круга, секунды округляем вверх: за секунду до сброса видно 00:00:01. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const HOUR_FORMS: [string, string, string] = ["час", "часа", "часов"];
const MIN_FORMS: [string, string, string] = ["минута", "минуты", "минут"];

/** Для скрытого объявления: «2 часа 15 минут». */
export function minutesWords(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} ${plural(h, HOUR_FORMS)}`);
  if (m || !h) parts.push(`${m} ${plural(m, MIN_FORMS)}`);
  return parts.join(" ");
}
