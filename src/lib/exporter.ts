/** Выгрузки: CSV баз, отчёт в Markdown, скачивание файлов. */
import { DAY, addDays, dayKey, shortDate, startOfDay, weekdayIndex } from "./analytics";
import { EXPENSE_LABEL, ROW_FORMS, expenseName, fmt, money, moneyByCurrency, monthLabel, monthOf, monthSummary, paidIn, price } from "./expenses";
import { CHANNELS, FUNNEL_LABEL, PRIORITY_LABEL, STAGE_LABEL, STATUS_LABEL, TASK_STATUS_LABEL, plural } from "./meta";
import { CHANNEL_IDS, CURRENCIES, FUNNEL_STAGES } from "./types";
import type { ChannelId, DB } from "./types";

export function download(filename: string, text: string, mime = "text/plain") {
  // BOM, чтобы Excel правильно открыл кириллицу в CSV.
  const body = mime === "text/csv" ? "﻿" + text : text;
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v: string | number) => {
  let s = String(v ?? "");
  // Текст с = + - @ в начале Excel читает как формулу («+1 заявка», «-50%»). Апостроф делает его текстом, числа не трогаем
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d\s.,]*$/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const fullDate = (ts: number) => {
  const d = new Date(ts);
  return `${dayKey(ts)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** База целей в CSV: один канал или все сразу. Формат подходит и для обратного импорта. */
export function targetsCSV(db: DB, channelId?: ChannelId): string {
  const head = ["Канал", "Название", "Ссылка", "Оффер", "Заметка", "Приоритет", "Этап", "Касаний", "Последнее касание", "Аккаунт"];
  const rows = Object.values(db.targets)
    .filter((t) => !channelId || t.channelId === channelId)
    .sort((a, b) => CHANNEL_IDS.indexOf(a.channelId) - CHANNEL_IDS.indexOf(b.channelId) || a.order - b.order)
    .map((t) => [
      CHANNELS[t.channelId].name,
      t.title,
      t.url,
      t.offer,
      t.note,
      t.starred ? "★" : "",
      STAGE_LABEL[t.stage],
      t.touches,
      t.lastTouchAt ? fullDate(t.lastTouchAt) : "",
      t.via ?? "",
    ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

export function tasksCSV(db: DB): string {
  const head = ["Задача", "Статус", "Канал", "Исполнитель", "Приоритет", "Срок", "Заметка", "Создана", "Закрыта"];
  const rows = Object.values(db.tasks)
    .sort((a, b) => a.order - b.order)
    .map((t) => [
      t.title,
      TASK_STATUS_LABEL[t.status],
      t.channelId ? CHANNELS[t.channelId].name : "",
      t.assigneeId ? (db.members[t.assigneeId]?.name ?? "") : "",
      PRIORITY_LABEL[t.priority],
      t.due ?? "",
      t.note,
      fullDate(t.createdAt),
      t.doneAt ? fullDate(t.doneAt) : "",
    ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

/** Расходы месяца (или все) в CSV, все колонки. Этот же файл принимает «Импорт» на странице «Расходы». */
export function expensesCSV(db: DB, month?: string): string {
  const head = ["№", "Месяц", "Дата", "Площадка", "Канал", "Ссылка", "Тема", "Сумма", "Валюта", "Охват (план)", "Статус", "Просмотры (факт)", "Подписки", "Заявки", "Креатив", "Заметка"];
  const rows = Object.values(db.expenses)
    .filter((x) => !month || x.month === month)
    .sort((a, b) => a.month.localeCompare(b.month) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .map((x, i) => [
      i + 1,
      x.month,
      x.date ?? "",
      x.platform,
      x.channelTitle,
      x.channelUrl ?? "",
      x.topic ?? "",
      x.amount,
      x.currency,
      x.reachPlanned ?? "",
      EXPENSE_LABEL[x.status],
      x.viewsFact ?? "",
      x.subs ?? "",
      x.leads ?? "",
      x.creative ?? "",
      x.note ?? "",
    ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

const md = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

const num = (v?: number) => (v === undefined ? "" : fmt(v));

/**
 * Расходы за период [from, to): что оплачено (по дате оплаты), цены по фактам этих строк
 * и бюджет месяцев, в которые попадает период. Валюты не смешиваются.
 */
export function expensesSection(db: DB, from: number, to: number, heading = "## Расходы за период"): string[] {
  const lines: string[] = [heading, ""];
  const paid = paidIn(db, from, to);
  if (paid.length) {
    lines.push(`Оплачено: ${moneyByCurrency(paid)}, ${paid.length} ${plural(paid.length, ROW_FORMS)}.`, "");
    lines.push("| Дата | Площадка | Канал | Сумма | Статус | Охват (план) | Просмотры | Заявки |", "|---|---|---|---|---|---|---|---|");
    for (const x of paid) {
      const cells = [x.date ?? "", x.platform, expenseName(x), money(x.amount, x.currency), EXPENSE_LABEL[x.status], num(x.reachPlanned), num(x.viewsFact), num(x.leads)];
      lines.push(`| ${cells.map(md).join(" | ")} |`);
    }
    lines.push("");
    for (const c of CURRENCIES) {
      const list = paid.filter((x) => x.currency === c);
      const sum = list.reduce((n, x) => n + x.amount, 0);
      const views = list.reduce((n, x) => n + (x.viewsFact ?? 0), 0);
      const leads = list.reduce((n, x) => n + (x.leads ?? 0), 0);
      const parts = [views > 0 ? `цена 1000 просмотров ${price((sum / views) * 1000, c)}` : "", leads > 0 ? `цена заявки ${price(sum / leads, c)}` : ""].filter(Boolean);
      if (parts.length) lines.push(`По оплатам периода (${c}): ${parts.join(", ")}.`, "");
    }
  } else {
    lines.push("Оплат за период нет.", "");
  }
  const months = [...new Set([monthOf(from), monthOf(to - 1)])];
  const budget: string[] = [];
  for (const m of months) {
    const s = monthSummary(db, m);
    if (s.budget === null && !s.main.rows && !s.others.length) continue;
    const c = s.main.currency;
    const parts = [s.budget === null ? "бюджет не задан" : `бюджет ${money(s.budget, c)}`, `оплачено ${money(s.main.paid, c)}`, `в плане ${money(s.main.planned, c)}`];
    if (s.budget !== null) parts.push(`${s.main.left < 0 ? "перерасход" : "остаток"} ${money(Math.abs(s.main.left), c)}`);
    for (const o of s.others) parts.push(`${o.currency}: оплачено ${money(o.paid, o.currency)}, в плане ${money(o.planned, o.currency)}`);
    budget.push(`- ${monthLabel(m)}: ${parts.join(", ")}.`);
  }
  if (budget.length) lines.push("Бюджет месяца:", "", ...budget, "");
  return lines;
}

/** Отчёт за период [from, to): каналы, воронка, задачи, вклад команды. */
export function buildReport(db: DB, from: number, to: number, title: string): string {
  const inRange = (ts?: number | null) => ts != null && ts >= from && ts < to;
  const events = Object.values(db.events).filter((e) => inRange(e.ts));
  const touches = events.filter((e) => e.type === "target.touch");
  const lines: string[] = [];
  lines.push(`# ${title}`, "");
  lines.push(`Период: ${shortDate(from)} - ${shortDate(to - 1)}. Сформирован ${fullDate(Date.now())}.`, "");

  lines.push("## Каналы", "");
  lines.push("| Канал | Статус | Аккаунт | В базе | Охвачено | Касаний за период | Ответили | Предоплат |", "|---|---|---|---|---|---|---|---|");
  for (const id of CHANNEL_IDS) {
    const ts = Object.values(db.targets).filter((t) => t.channelId === id);
    const ch = db.channels[id];
    lines.push(
      `| ${CHANNELS[id].name} | ${STATUS_LABEL[ch.status]} | ${md(ch.account || "-")} | ${ts.length} | ${ts.filter((t) => t.touches > 0).length} | ${touches.filter((e) => e.channelId === id).length} | ${ts.filter((t) => t.at.replied !== undefined).length} | ${ts.filter((t) => t.stage === "won").length} |`,
    );
  }
  lines.push("");

  lines.push("## Воронка за период", "");
  lines.push("| Этап | Факт | Ориентир на неделю |", "|---|---|---|");
  for (const s of FUNNEL_STAGES) {
    const fact = s === "sent" ? touches.length : Object.values(db.targets).filter((t) => inRange(t.at[s])).length;
    lines.push(`| ${FUNNEL_LABEL[s]} | ${fact} | ${db.meta.funnelGoal[s]} |`);
  }
  lines.push("");


  const done = Object.values(db.tasks).filter((t) => t.status === "done" && inRange(t.doneAt));
  lines.push(`## Закрыто задач: ${done.length}`, "");
  for (const t of done) lines.push(`- ${md(t.title)}${t.channelId ? ` (${CHANNELS[t.channelId].name})` : ""}`);
  if (!done.length) lines.push("Нет.");
  lines.push("");

  const open = Object.values(db.tasks)
    .filter((t) => t.status !== "done")
    .sort((a, b) => b.priority - a.priority || a.order - b.order);
  lines.push(`## Открытые задачи: ${open.length}`, "");
  for (const t of open) {
    const who = t.assigneeId ? db.members[t.assigneeId]?.name : null;
    const meta = [t.priority === 2 ? "срочно" : null, t.channelId ? CHANNELS[t.channelId].name : null, who, t.due ? `до ${t.due}` : null].filter(Boolean);
    lines.push(`- [${t.status === "doing" ? "~" : " "}] ${md(t.title)}${meta.length ? `: ${meta.join(", ")}` : ""}`);
  }
  if (!open.length) lines.push("Нет.");
  lines.push("");

  lines.push("## Вклад команды", "");
  lines.push("| Участник | Действий | Касаний | Закрыто задач |", "|---|---|---|---|");
  const people = [...Object.values(db.members).map((m) => ({ id: m.id, name: m.name })), { id: "", name: "Без имени" }];
  for (const p of people) {
    const mine = events.filter((e) => (p.id ? e.by === p.id : !e.by || !db.members[e.by]));
    if (!p.id && !mine.length) continue;
    lines.push(`| ${md(p.name)} | ${mine.length} | ${mine.filter((e) => e.type === "target.touch").length} | ${mine.filter((e) => e.type === "task.done" || e.type === "task.daily").length} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Понедельник недели, в которую попадает ts. */
export function weekStart(ts: number): number {
  const d = startOfDay(ts);
  return addDays(d, -weekdayIndex(d));
}

export const WEEK = 7 * DAY;
