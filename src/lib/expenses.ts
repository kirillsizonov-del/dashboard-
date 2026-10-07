/** Расходы на трафик: подписи, цвета, итоги месяца, разбор импорта. */
import { dayKey } from "./analytics";
import { splitCSV, detectDelimiter, targetKey } from "./importer";
import { plural } from "./meta";
import { CURRENCIES } from "./types";
import type { Currency, DB, Expense, ExpenseStatus } from "./types";

export type ExpenseInput = Omit<Expense, "id" | "createdBy" | "createdAt" | "updatedAt"> & { id?: string };

export const EXPENSE_LABEL: Record<ExpenseStatus, string> = {
  reserve: "Резерв",
  plan: "План",
  paid: "Оплачено",
  published: "Вышло",
  result: "Итог",
  refunded: "Возврат",
  declined: "Отказ",
};

// Резерв серый, план синий, оплачено жёлтый, вышло фиолетовый, итог зелёный, возврат и отказ красные
export const EXPENSE_COLOR: Record<ExpenseStatus, string> = {
  reserve: "#8b93a3",
  plan: "#4c8ef0",
  paid: "#fab219",
  published: "#9d8cf5",
  result: "#22c55e",
  refunded: "#f85a6a",
  declined: "#f85a6a",
};

/** Статусы, при которых деньги уже ушли. */
export const PAID_STATUSES: ExpenseStatus[] = ["paid", "published", "result"];
export const isPaid = (s: ExpenseStatus) => PAID_STATUSES.includes(s);

export const CURRENCY_SIGN: Record<Currency, string> = { RUB: "₽", USD: "$", GEL: "₾" };

export const PLATFORMS = ["TeleTarget", "Telegram чат", "FL.ru", "Kwork", "Instagram Ads"];

export const ROW_FORMS: [string, string, string] = ["строка", "строки", "строк"];
export const VIEW_FORMS: [string, string, string] = ["просмотр", "просмотра", "просмотров"];
export const LEAD_FORMS: [string, string, string] = ["заявка", "заявки", "заявок"];

/** 4 750, 15 931, 166,7 */
export function fmt(n: number, digits = 0): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
}

/** Сумма без знака: копейки и центы видны, если они есть. «4 750», «19,99». */
export const fmtMoney = (n: number) => fmt(n, 2);

/** «4 750 ₽», «19,99 $». Знак валюты через неразрывный пробел, чтобы не уезжал на новую строку. */
export function money(n: number, currency: Currency = "RUB"): string {
  return `${fmtMoney(n)}\u00a0${CURRENCY_SIGN[currency]}`;
}

/** Цена заявки или 1000 просмотров без знака: рубли от 10 округляем до целых, остальное до сотых. */
export const fmtPrice = (n: number, currency: Currency = "RUB") => fmt(n, currency === "RUB" && Math.abs(n) >= 10 ? 0 : 2);

/** «262 ₽», «0,45 $». */
export function price(n: number, currency: Currency = "RUB"): string {
  return `${fmtPrice(n, currency)}\u00a0${CURRENCY_SIGN[currency]}`;
}

/** Числа из ячеек: «2 100», «1,5», «300 ₽». Пусто = undefined, мусор = NaN. */
export function parseNum(raw: string): number | undefined {
  const s = raw.replace(/[\s  ₽$₾]/g, "").replace(",", ".");
  if (!s) return undefined;
  return Number(s);
}

// ───────────── Месяцы ─────────────

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export const monthOf = (ts: number) => dayKey(ts).slice(0, 7);

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** «Октябрь 2026» */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1] ?? month} ${y}`;
}

/** «в октябре» */
export function monthIn(month: string): string {
  const m = Number(month.split("-")[1]);
  return MONTHS_IN[m - 1] ? `в ${MONTHS_IN[m - 1]}` : month;
}

/** «6 окт» для даты YYYY-MM-DD */
export function shortDay(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1] ?? ""}`;
}

// ───────────── Подписи для журнала ─────────────

/** Ссылка для показа: без https:// и www. */
export const shortUrl = (url?: string) => (url ?? "").replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/+$/, "");

/** Ссылка для хранения: t.me/x становится https://t.me/x. Пусто = undefined. */
export function fullUrl(raw?: string): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  return /^[a-z][\w+.-]*:/i.test(v) || !/^[\w-]+(?:\.[\w-]+)+(?:[/?#]|$)/.test(v) ? v : `https://${v}`;
}

/** «t.me/animebay» или название, если ссылки нет. */
export const expenseName = (x: Pick<Expense, "channelUrl" | "channelTitle">) => shortUrl(x.channelUrl) || x.channelTitle || "без названия";

/** «TeleTarget, t.me/animebay, 300 ₽» */
export function expenseLabel(x: Expense): string {
  return [x.platform, expenseName(x), money(x.amount, x.currency)].filter(Boolean).join(", ");
}

/** «t.me/animebay: 2 100 просмотров, 1 заявка». Цифр ещё нет: «t.me/animebay: цифр пока нет». */
export function resultLabel(x: Expense): string {
  const parts: string[] = [];
  if (x.viewsFact !== undefined) parts.push(`${fmt(x.viewsFact)} ${plural(x.viewsFact, VIEW_FORMS)}`);
  if (x.leads !== undefined) parts.push(`${fmt(x.leads)} ${plural(x.leads, LEAD_FORMS)}`);
  return `${expenseName(x)}: ${parts.length ? parts.join(", ") : "цифр пока нет"}`;
}

/** Суммы по каждой валюте отдельно: ["4 750 ₽", "20 $"]. */
export function moneyParts(list: Pick<Expense, "amount" | "currency">[]): string[] {
  const by = new Map<Currency, number>();
  for (const x of list) by.set(x.currency, (by.get(x.currency) ?? 0) + x.amount);
  if (!by.size) return [money(0)];
  return CURRENCIES.filter((c) => by.has(c)).map((c) => money(by.get(c) ?? 0, c));
}

/** «6 099 ₽» или «4 750 ₽ + 20 $». */
export const moneyByCurrency = (list: Pick<Expense, "amount" | "currency">[]) => moneyParts(list).join(" + ");

// ───────────── Итоги месяца ─────────────

export interface Totals {
  currency: Currency;
  planned: number;
  paid: number;
  /** Охват по плану у строк в плане и оплаченных */
  reach: number;
  views: number;
  subs: number;
  leads: number;
  /** Есть ли хоть один факт по просмотрам */
  hasViews: boolean;
  rows: number;
}

function totalsOf(list: Expense[], currency: Currency): Totals {
  const t: Totals = { currency, planned: 0, paid: 0, reach: 0, views: 0, subs: 0, leads: 0, hasViews: false, rows: list.length };
  for (const x of list) {
    if (x.status === "plan") t.planned += x.amount;
    if (isPaid(x.status)) t.paid += x.amount;
    if (x.status === "plan" || isPaid(x.status)) t.reach += x.reachPlanned ?? 0;
    if (x.viewsFact !== undefined) {
      t.views += x.viewsFact;
      t.hasViews = true;
    }
    t.subs += x.subs ?? 0;
    t.leads += x.leads ?? 0;
  }
  return t;
}

export interface MonthSummary {
  budget: number | null;
  main: Totals & { left: number; perMille: number | null; perLead: number | null };
  /** Строки в других валютах: в основные итоги не попадают. */
  others: Totals[];
}

/**
 * Итоги месяца в основной валюте (валюта бюджета, по умолчанию рубли).
 * Остаток = бюджет − оплачено − запланировано. Другие валюты считаются отдельно.
 */
export function monthSummary(db: DB, month: string): MonthSummary {
  const b = db.meta.budgets?.[month];
  const currency: Currency = b?.currency ?? "RUB";
  const all = Object.values(db.expenses).filter((x) => x.month === month);
  const main = totalsOf(all.filter((x) => x.currency === currency), currency);
  const others = CURRENCIES.filter((c) => c !== currency)
    .map((c) => totalsOf(all.filter((x) => x.currency === c), c))
    .filter((t) => t.rows > 0);
  const budget = b ? b.amount : null;
  return {
    budget,
    main: {
      ...main,
      left: (budget ?? 0) - main.paid - main.planned,
      perMille: main.views > 0 ? (main.paid / main.views) * 1000 : null,
      perLead: main.leads > 0 ? main.paid / main.leads : null,
    },
    others,
  };
}

/** Оплаченные строки (оплачено, вышло, итог) с датой оплаты в [from, to), по дате. */
export function paidIn(db: DB, from: number, to: number): Expense[] {
  const a = dayKey(from);
  const b = dayKey(to - 1);
  return Object.values(db.expenses)
    .filter((x) => isPaid(x.status) && !!x.date && x.date >= a && x.date <= b)
    .sort((x, y) => (x.date ?? "").localeCompare(y.date ?? "") || x.createdAt - y.createdAt);
}

export interface MoneyStats {
  /** Месяц бюджета, YYYY-MM */
  month: string;
  currency: Currency;
  /** Оплачено в основной валюте с начала недели и сколько это строк */
  week: number;
  weekRows: number;
  summary: MonthSummary;
  /** Суммы в других валютах: ["20 $"] */
  weekOther: string[];
  monthOther: string[];
}

/** Деньги для «Аналитики»: оплачено за неделю (по дате оплаты) и за месяц бюджета, цены заявки и 1000 просмотров за месяц. */
export function moneyStats(db: DB, now: number, weekFrom: number): MoneyStats {
  const month = monthOf(now);
  const summary = monthSummary(db, month);
  const currency = summary.main.currency;
  const week = paidIn(db, weekFrom, now + 1);
  const inMain = week.filter((x) => x.currency === currency);
  // Другие валюты в итоги не смешиваем, показываем рядом
  const other = (list: Expense[]) => {
    const rest = list.filter((x) => x.currency !== currency);
    return rest.length ? moneyParts(rest) : [];
  };
  return {
    month,
    currency,
    week: inMain.reduce((s, x) => s + x.amount, 0),
    weekRows: inMain.length,
    summary,
    weekOther: other(week),
    monthOther: other(Object.values(db.expenses).filter((x) => x.month === month && isPaid(x.status))),
  };
}

/** Строки месяца в порядке добавления: по нему считается №. */
export function monthRows(db: DB, month: string): Expense[] {
  return Object.values(db.expenses)
    .filter((x) => x.month === month)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

// ───────────── Импорт ─────────────

/** Ключ дубля: месяц и ссылка на канал, без ссылки название. */
export const expenseKey = (x: Pick<Expense, "month" | "channelUrl" | "channelTitle">) =>
  `${x.month}|${targetKey(x.channelUrl ?? "", x.channelTitle ?? "")}`;

export interface ExpenseImportItem {
  input: ExpenseInput;
  key: string;
  duplicate: boolean;
}

export type ExpenseCommon = Pick<ExpenseInput, "platform" | "currency" | "month">;

const FIELDS: [keyof ExpenseInput, RegExp][] = [
  ["channelUrl", /^(?:channel_?url|url|link|ссылка|ссылка на канал)$/i],
  ["channelTitle", /^(?:channel_?title|channel|title|name|канал|название|услуга)$/i],
  ["platform", /^(?:platform|площадка|сервис)$/i],
  ["topic", /^(?:topic|тема)$/i],
  ["amount", /^(?:amount|sum|price|сумма|цена|стоимость)$/i],
  ["currency", /^(?:currency|валюта)$/i],
  ["reachPlanned", /^(?:reach|reach_?planned|охват|охват \(план\))$/i],
  ["status", /^(?:status|статус)$/i],
  ["viewsFact", /^(?:views|views_?fact|просмотры|просмотры \(факт\))$/i],
  ["subs", /^(?:subs|subscribers|подписки)$/i],
  ["leads", /^(?:leads|заявки)$/i],
  ["creative", /^(?:creative|креатив)$/i],
  ["note", /^(?:note|notes|заметка|комментарий)$/i],
  ["date", /^(?:date|дата|дата оплаты)$/i],
  ["month", /^(?:month|месяц)$/i],
];

const STATUS_WORDS: [RegExp, ExpenseStatus][] = [
  [/^(?:reserve|резерв)/i, "reserve"],
  [/^(?:plan|план|запланировано)/i, "plan"],
  [/^(?:paid|оплачено|оплачен)/i, "paid"],
  [/^(?:published|вышло|вышел)/i, "published"],
  [/^(?:result|итог)/i, "result"],
  [/^(?:refunded|возврат)/i, "refunded"],
  [/^(?:declined|отказ)/i, "declined"],
];

const CURRENCY_WORDS: [RegExp, Currency][] = [
  [/^(?:rub|руб|₽|р\.?$)/i, "RUB"],
  [/^(?:usd|\$|долл)/i, "USD"],
  [/^(?:gel|₾|лари)/i, "GEL"],
];

function fieldOf(key: string): keyof ExpenseInput | null {
  const k = key.replace(/^﻿/, "").trim();
  for (const [f, re] of FIELDS) if (k === f || re.test(k)) return f;
  return null;
}

function toDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

function toItem(raw: Record<string, unknown>, common: ExpenseCommon): ExpenseInput | null {
  const r: Partial<Record<keyof ExpenseInput, string>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const f = fieldOf(key);
    if (f && value !== null && value !== undefined && String(value).trim() !== "") r[f] = String(value).trim();
  }
  if (!r.channelUrl && !r.channelTitle) return null;
  const num = (v?: string) => {
    const n = v === undefined ? undefined : parseNum(v);
    return n === undefined || Number.isNaN(n) ? undefined : n;
  };
  const date = r.date ? toDate(r.date) : null;
  const month = r.month && /^\d{4}-\d{2}$/.test(r.month) ? r.month : date ? date.slice(0, 7) : common.month;
  const url = fullUrl(r.channelUrl);
  const item: ExpenseInput = {
    status: STATUS_WORDS.find(([re]) => re.test(r.status ?? ""))?.[1] ?? "plan",
    date,
    month,
    platform: r.platform ?? common.platform,
    channelTitle: r.channelTitle ?? url?.replace(/^https?:\/\/(?:www\.)?/i, "") ?? "",
    amount: num(r.amount) ?? 0,
    currency: CURRENCY_WORDS.find(([re]) => re.test(r.currency ?? ""))?.[1] ?? common.currency,
  };
  if (url) item.channelUrl = url;
  if (r.topic) item.topic = r.topic;
  if (r.creative) item.creative = r.creative;
  if (r.note) item.note = r.note;
  for (const f of ["reachPlanned", "viewsFact", "subs", "leads"] as const) {
    const n = num(r[f]);
    if (n !== undefined) item[f] = n;
  }
  return item;
}

function commonOf(obj: Record<string, unknown>, common: ExpenseCommon): ExpenseCommon {
  const out = { ...common };
  for (const [key, value] of Object.entries(obj)) {
    const v = typeof value === "string" ? value.trim() : "";
    const f = fieldOf(key);
    if (!v) continue;
    if (f === "platform") out.platform = v;
    if (f === "month" && /^\d{4}-\d{2}$/.test(v)) out.month = v;
    if (f === "currency") out.currency = CURRENCY_WORDS.find(([re]) => re.test(v))?.[1] ?? out.currency;
  }
  return out;
}

/**
 * Разбирает JSON (массив строк или объект с общими полями и списком rows/items/expenses)
 * и CSV с заголовками, в том числе выгрузку «CSV» с этой же страницы.
 * Общие поля из окна импорта подставляются, если в строке их нет.
 */
export function parseExpenses(text: string, common: ExpenseCommon, db: DB): ExpenseImportItem[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return [];
  let raws: Record<string, unknown>[] = [];
  let shared = common;

  if (/^[[{]/.test(trimmed)) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return [];
    }
    if (Array.isArray(data)) raws = data as Record<string, unknown>[];
    else if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      const listKey = ["rows", "items", "expenses"].find((k) => Array.isArray(obj[k]));
      raws = listKey ? (obj[listKey] as Record<string, unknown>[]) : [obj];
      // Поля верхнего уровня общие для всех строк: {"platform": "TeleTarget", "rows": [...]}
      if (listKey) shared = commonOf(obj, common);
    }
  } else {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    // Ячейки в кавычках могут содержать запятые, поэтому разделитель берём по строке заголовков
    const delim = detectDelimiter(lines) ?? ["\t", ";", ","].sort((x, y) => lines[0].split(y).length - lines[0].split(x).length)[0];
    if (lines[0].split(delim).length < 2) return [];
    const [head, ...body] = splitCSV(trimmed, delim);
    raws = body.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""])));
  }

  const existing = new Set(Object.values(db.expenses).map(expenseKey));
  const seen = new Set<string>();
  const out: ExpenseImportItem[] = [];
  for (const raw of raws) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = toItem(raw, shared);
    if (!item) continue;
    const key = expenseKey(item);
    out.push({ input: item, key, duplicate: existing.has(key) || seen.has(key) });
    seen.add(key);
  }
  return out;
}

/** Сегодня в формате YYYY-MM-DD */
export const today = () => dayKey(Date.now());
