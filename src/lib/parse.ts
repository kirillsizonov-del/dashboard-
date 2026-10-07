import type { TaskInput } from "./store";
import type { ChannelId, Member, Priority } from "./types";
import { dayKey, addDays, startOfDay } from "./analytics";

const ALIASES: Record<string, ChannelId> = {
  x: "x", х: "x", tw: "x", twitter: "x", твиттер: "x", твитер: "x", твит: "x",
  тредс: "threads", threads: "threads", th: "threads",
  дс: "discord", ds: "discord", дискорд: "discord", discord: "discord", dc: "discord",
  рд: "reddit", rd: "reddit", реддит: "reddit", редит: "reddit", reddit: "reddit",
};

const KEYWORDS: [RegExp, ChannelId][] = [
  [/twitter|твит+ер|(^|[^\p{L}])твит|x\.com\//iu, "x"],
  [/threads|тредс/iu, "threads"],
  [/discord|дискорд|discord\.gg\//iu, "discord"],
  [/reddit|ре+дд?ит|(^|[^\p{L}])r\/[\w]+/iu, "reddit"],
];

export function detectChannel(text: string): ChannelId | null {
  for (const [re, id] of KEYWORDS) if (re.test(text)) return id;
  return null;
}

/**
 * Быстрый ввод задачи. Понимает метки прямо в тексте:
 * #x #тредс #дс #рд, @имя, !срочно или !!, сегодня / завтра / 12.10
 */
export function parseQuick(input: string, members: Member[], now = Date.now()): TaskInput {
  let text = ` ${input.trim()} `;
  let channelId: ChannelId | null = null;
  let assigneeId: string | null = null;
  let priority: Priority = 1;
  let due: string | null = null;

  text = text.replace(/\s#([\p{L}\d_]+)(?=\s)/gu, (m, tag: string) => {
    const id = ALIASES[tag.toLowerCase()];
    if (!id) return m;
    channelId = id;
    return " ";
  });

  text = text.replace(/\s@([\p{L}\d_]+)(?=\s)/gu, (m, name: string) => {
    const who = members.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()));
    if (!who) return m;
    assigneeId = who.id;
    return " ";
  });

  text = text.replace(/\s(!!+|!срочно|!high|!важно)(?=\s)/giu, () => {
    priority = 2;
    return " ";
  });
  text = text.replace(/\s(!низкий|!low|!потом)(?=\s)/giu, () => {
    priority = 0;
    return " ";
  });

  const today = startOfDay(now);
  text = text.replace(/\s(сегодня|завтра|послезавтра)(?=\s)/giu, (_m, w: string) => {
    const shift = { сегодня: 0, завтра: 1, послезавтра: 2 }[w.toLowerCase()] ?? 0;
    due = dayKey(addDays(today, shift));
    return " ";
  });
  text = text.replace(/\s(\d{1,2})\.(\d{1,2})(?=\s)/u, (m, d: string, mo: string) => {
    const day = Number(d);
    const month = Number(mo);
    if (day < 1 || day > 31 || month < 1 || month > 12) return m;
    const year = new Date(now).getFullYear();
    let date = new Date(year, month - 1, day);
    if (date.getTime() < addDays(today, -180)) date = new Date(year + 1, month - 1, day);
    due = dayKey(date.getTime());
    return " ";
  });

  return { title: text.replace(/\s+/g, " ").trim(), channelId, assigneeId, priority, due };
}

/** Кусок текста из чата превращает в список задач: по одной на строку. */
export function parseBulk(text: string, members: Member[]): TaskInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•–—▪◦]|\d+[.)]|\[[ xX]?\])\s*/u, "").trim())
    .filter((line) => line.length >= 3)
    .map((line) => {
      const task = parseQuick(line, members);
      if (!task.channelId) task.channelId = detectChannel(line);
      return task;
    })
    .filter((t) => t.title.length >= 3);
}
