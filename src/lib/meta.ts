import type { Channel, ChannelAccount, ChannelId, ChannelStatus, FunnelStage, Priority, Stage, TaskStatus } from "./types";

type Forms = [string, string, string];

export const CHANNELS: Record<
  ChannelId,
  { name: string; color: string; target: Forms; touch: Forms; touchVerb: string }
> = {
  x: {
    name: "X / Twitter",
    color: "var(--c-x)",
    target: ["аккаунт", "аккаунта", "аккаунтов"],
    touch: ["пост", "поста", "постов"],
    touchVerb: "Запостили",
  },
  threads: {
    name: "Threads",
    color: "var(--c-threads)",
    target: ["аккаунт", "аккаунта", "аккаунтов"],
    touch: ["пост", "поста", "постов"],
    touchVerb: "Запостили",
  },
  discord: {
    name: "Discord",
    color: "var(--c-discord)",
    target: ["сервер", "сервера", "серверов"],
    touch: ["сообщение", "сообщения", "сообщений"],
    touchVerb: "Написали",
  },
  reddit: {
    name: "Reddit",
    color: "var(--c-reddit)",
    target: ["сабреддит", "сабреддита", "сабреддитов"],
    touch: ["пост", "поста", "постов"],
    touchVerb: "Запостили",
  },
};

export const NO_CHANNEL_COLOR = "var(--c-none)";

/** Аккаунты канала: поле «аккаунт» можно заполнить списком через запятую. Повторы убираем: «@a, @a» это один аккаунт. */
export function channelAccounts(account: string): string[] {
  return [
    ...new Set(
      account
        .split(/[,;]|\s\+\s/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** Ник без символов, которые разрезали бы строку account на части. */
export function cleanHandle(handle: string): string {
  return handle.replace(/[,;]|\s\+\s/g, " ").replace(/\s+/g, " ").trim();
}

const blankAccount = (handle: string): ChannelAccount => ({ handle, memberId: "", label: "" });

/**
 * Справочник аккаунтов канала. Сначала accounts, иначе ники из строки account с пустыми владельцем и подписью.
 * Если старый клиент поменял только строку account, ники берём из неё, а владельцев и подписи из accounts.
 */
export function accountsOf(ch?: Pick<Channel, "account" | "accounts"> | null): ChannelAccount[] {
  if (!ch) return [];
  const raw: unknown = ch.accounts;
  const parsed = channelAccounts(ch.account ?? "");
  if (typeof raw === "string") return channelAccounts(raw).map(blankAccount);
  if (!Array.isArray(raw)) return parsed.map(blankAccount);
  const list: ChannelAccount[] = [];
  for (const a of raw as Partial<ChannelAccount>[]) {
    const handle = cleanHandle(String(a?.handle ?? ""));
    if (!handle || list.some((x) => x.handle === handle)) continue;
    list.push({ handle, memberId: String(a?.memberId ?? ""), label: String(a?.label ?? "").trim() });
  }
  const same = parsed.length === list.length && parsed.every((h) => list.some((a) => a.handle === h));
  if (!parsed.length || same) return list;
  return parsed.map((h) => list.find((a) => a.handle === h) ?? blankAccount(h));
}

/** Ключ localStorage для выбранного аккаунта на телефоне. У Telegram ключ из ТЗ. */
export function accountTabKey(id: ChannelId): string {
  return `qcai.${id}.accountTab`;
}

export const STATUS_LABEL: Record<ChannelStatus, string> = {
  active: "В работе",
  paused: "На паузе",
  idle: "Не начат",
};

export const STAGE_LABEL: Record<Stage, string> = {
  new: "Не отправлено",
  sent: "Отправлено",
  replied: "Ответил",
  concept: "Концепт",
  call: "Созвон",
  won: "Предоплата",
  lost: "Отказ",
};

export const FUNNEL_LABEL: Record<FunnelStage, string> = {
  sent: "Отправлено",
  replied: "Ответили",
  concept: "Концепты",
  call: "Созвоны",
  won: "Предоплаты",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "К выполнению",
  doing: "В работе",
  done: "Готово",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  0: "Низкий",
  1: "Обычный",
  2: "Срочно",
};

export const MEMBER_COLORS = ["#ff9569", "#3485d1", "#9085e9", "#d55181", "#f2c14e", "#4cc9f0"];

export function plural(n: number, forms: Forms): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export const ACTION_FORMS: Forms = ["действие", "действия", "действий"];
export const TASK_FORMS: Forms = ["задача", "задачи", "задач"];
export const DAY_FORMS: Forms = ["день", "дня", "дней"];
