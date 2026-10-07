/**
 * Правила контента X из ресерча конкурентов (сентябрь–октябрь 2026):
 * рубрики, квоты, пороги, kill/boost, окно релиза, линтер поста.
 * Чистые функции, без состояния. UI и store их только вызывают.
 */
import { dayKey } from "./analytics";
import type { FormatId, MetricSnapshot, Release, Task, Verdict } from "./types";

export type FormatGroup = "reach" | "engage" | "convert";

export const FORMATS: Record<FormatId, { code: string; name: string; group: FormatGroup; hook: string; hint: string }> = {
  duel: {
    code: "R1",
    name: "Дуэль моделей",
    group: "reach",
    hook: "{A} vs {B} in 3D game dev. Same prompt.",
    hint: "Сплит одна над другой, подписи моделей, карточки результата в конце. Вопрос «кто выиграл?» в теле. 12–45 с.",
  },
  boss: {
    code: "R2",
    name: "Босс недели",
    group: "engage",
    hook: "{Model} + Unreal + Blender. 1 prompt · {N} min · ${X}",
    hint: "HUD с первого кадра: здоровье босса, бой, победный экран. Чек времени и цены в тексте. 25–30 с.",
  },
  howbuilt: {
    code: "R3",
    name: "Как построено",
    group: "convert",
    hook: "How we built {thing}: prompt → agents → Unreal",
    hint: "3–5 с интерфейса Quadcode и движка в кадре. Шаги 1 → 2 → 3, чтобы сохраняли как рецепт. Ссылка на гайд в реплае.",
  },
  overnight: {
    code: "R4",
    name: "Overnight Build",
    group: "reach",
    hook: "I spent {N} hours. Not a demo.",
    hint: "Тур 2–3 мин с лучшего кадра, финальная карточка с часами, токенами и $. Раз в месяц.",
  },
  remake: {
    code: "R5",
    name: "Жанровый ремейк",
    group: "reach",
    hook: "{Genre}-style game built in Unreal with {Model}. Play 👇",
    hint: "Трейлерный монтаж, ссылка на билд в первом реплае. Своя сцена, без чужих IP и логотипов.",
  },
  prompt: {
    code: "R6",
    name: "Промпт недели",
    group: "convert",
    hook: "{Model} can now {X}. Prompt 👇",
    hint: "Короткий клип 10–30 с, пайплайн в подписях, полный промпт в первом реплае. Цель: закладки ≥ 1%.",
  },
  human: {
    code: "R7",
    name: "Человек в цикле",
    group: "engage",
    hook: "Reply with a game you want to exist. We build the top 5.",
    hint: "Идеи из реплаев → игры за 30 с с цитатой автора. Голосование, итоги через 5–10 дней.",
  },
  other: {
    code: "—",
    name: "Вне рубрик",
    group: "engage",
    hook: "",
    hint: "Текстовые мнения, мемы, ньюсджеки и голые анонсы у нас набирают 230–420 views. Переупаковать в рубрику.",
  },
};

export const FORMAT_GROUP_LABEL: Record<FormatGroup, string> = { reach: "Охват", engage: "Вовлечение", convert: "Конверсия" };
/** Доли недели из /calendar: 60% охват, 25% вовлечение, 15% конверсия. */
export const QUOTA: Record<FormatGroup, number> = { reach: 0.6, engage: 0.25, convert: 0.15 };

/** Пороги из CONTEXT и ресерча. Ниже порога — разбор, а не «нормально». */
export const THRESHOLD = {
  likeRate: 0.006,
  replyRate: 0.0005,
  rtLike: 0.08,
  bookmarkDuel: 0.003,
  bookmarkRecipe: 0.01,
  flagshipViews: 100_000,
  /** Kill rule: ниже 1/3 медианы и закладок < 0.1% через 6 часов */
  killBookmarks: 0.001,
  /** Boost rule: like ≥ 0.5% и ≥ 50 закладок за 6 часов */
  boostLike: 0.005,
  boostBookmarks: 50,
  /** Промо-флаг чужого поста: лайков < 0.25% от просмотров */
  promoLike: 0.0025,
} as const;

export const SNAPSHOT_HOURS = [1, 6, 24, 72, 168] as const;

export function snapshotLabel(h: number): string {
  return h >= 24 ? `T+${h / 24}д` : `T+${h}ч`;
}

export interface Rates {
  likeRate: number;
  replyRate: number;
  bookmarkRate: number;
  rtLike: number;
}

export function rates(s: MetricSnapshot): Rates {
  const v = Math.max(1, s.views);
  return {
    likeRate: s.likes / v,
    replyRate: s.replies / v,
    bookmarkRate: s.bookmarks / v,
    rtLike: s.likes ? s.reposts / s.likes : 0,
  };
}

export const pct = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;

export function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** Самый поздний снимок поста. */
export function lastSnapshot(t: Task): MetricSnapshot | null {
  const list = t.metrics ?? [];
  if (!list.length) return null;
  return list.reduce((m, s) => (s.hours > m.hours ? s : m));
}

/** Снимок на T+6h или ближайший более поздний: по нему работают kill и boost. */
export function snapshotAtLeast(t: Task, hours: number): MetricSnapshot | null {
  const list = (t.metrics ?? []).filter((s) => s.hours >= hours).sort((a, b) => a.hours - b.hours);
  return list[0] ?? null;
}

export const isPost = (t: Task) => !!t.time || t.channelId === "x";
export const isPublished = (t: Task) => !!t.postUrl;

export function postedAt(t: Task): number | null {
  if (t.postedAt) return t.postedAt;
  if (!t.due) return null;
  const [y, m, d] = t.due.split("-").map(Number);
  const [hh, mm] = (t.time ?? "12:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0).getTime();
}

/** Медиана последнего снимка views по опубликованным постам за N дней. 0 = данных нет. */
export function medianViews(tasks: Task[], days = 30, now = Date.now()): number {
  const from = now - days * 86_400_000;
  const xs = tasks
    .filter((t) => isPublished(t) && (postedAt(t) ?? 0) >= from)
    .map((t) => lastSnapshot(t)?.views ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

/** Какой снимок метрик пора снять: последняя наступившая отметка без записи. null = ничего. */
export function snapshotDue(t: Task, now = Date.now()): number | null {
  if (!isPublished(t)) return null;
  const at = postedAt(t);
  if (!at) return null;
  const elapsed = (now - at) / 3_600_000;
  const latest = Math.max(0, ...(t.metrics ?? []).map((s) => s.hours));
  const due = SNAPSHOT_HOURS.filter((h) => elapsed >= h && h > latest);
  if (!due.length) return null;
  // Пропущенные ранние отметки уже не снять честно: просим только самую свежую
  return due[due.length - 1];
}

/** Стадия слота для простых списков: черновик → готов → вышел. */
export type SlotStage = "draft" | "ready" | "published";
export function stageOf(t: Task, all: Task[] = []): SlotStage {
  if (isPublished(t)) return "published";
  return lint(t, all).some((i) => i.level === "error") ? "draft" : "ready";
}
export const STAGE_LABEL: Record<SlotStage, string> = { draft: "Не готов", ready: "Готов к выходу", published: "Вышел" };

export function verdictOf(t: Task, median: number): Verdict | null {
  if (t.verdict) return t.verdict;
  const s = snapshotAtLeast(t, 6) ?? lastSnapshot(t);
  if (!s) return null;
  const r = rates(s);
  const mature = s.hours >= 6;
  if (mature && r.likeRate >= THRESHOLD.boostLike && s.bookmarks >= THRESHOLD.boostBookmarks) return "boost";
  if (median > 0 && s.views >= median * 3) return "hit";
  if (mature && median > 0 && s.views < median / 3 && r.bookmarkRate < THRESHOLD.killBookmarks) return "dead";
  return "ok";
}

export const VERDICT_LABEL: Record<Verdict, { label: string; hint: string; tone: "good" | "warn" | "crit" | "muted" }> = {
  hit: { label: "Хит", hint: "≥ 3× медианы. Страница на games за 48 ч, тред «как построено».", tone: "good" },
  boost: { label: "Бустить", hint: "Like ≥ 0.5% и ≥ 50 закладок за 6 ч: единственный случай, когда платим за промо.", tone: "good" },
  ok: { label: "Норм", hint: "В пределах медианы.", tone: "muted" },
  dead: { label: "Умер", hint: "Ниже 1/3 медианы и закладки < 0.1%. Три таких подряд в одной рубрике = рубрику закрываем.", tone: "crit" },
};

// ───────────── Окно релиза ─────────────

export const WINDOW = { openH: 24, closeH: 96, tailD: 10 } as const;

export type WindowState = "before" | "day0" | "open" | "tail" | "closed";

export interface WindowInfo {
  release: Release;
  /** Часов от релиза до момента. Отрицательное = до релиза. */
  hours: number;
  state: WindowState;
}

export function releaseTs(r: Release): number {
  const [y, m, d] = r.date.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0).getTime();
}

function windowState(hours: number): WindowState {
  if (hours < -24) return "before";
  if (hours < WINDOW.openH) return "day0";
  if (hours <= WINDOW.closeH) return "open";
  if (hours <= WINDOW.tailD * 24) return "tail";
  return "closed";
}

/** Ближайший релиз, в чьё окно попадает момент. Приоритет: открытое окно, потом день релиза, потом хвост. */
export function windowAt(ts: number, releases: Release[]): WindowInfo | null {
  const rank: Record<WindowState, number> = { open: 0, day0: 1, tail: 2, before: 3, closed: 4 };
  let best: WindowInfo | null = null;
  for (const r of releases) {
    const hours = Math.round((ts - releaseTs(r)) / 3_600_000);
    const state = windowState(hours);
    if (state === "before" || state === "closed") continue;
    const info = { release: r, hours, state };
    if (!best || rank[state] < rank[best.state]) best = info;
  }
  return best;
}

export const WINDOW_LABEL: Record<WindowState, string> = {
  before: "до релиза",
  day0: "день релиза",
  open: "окно открыто",
  tail: "хвост",
  closed: "окно закрыто",
};

/** Протокол релиза: 5 задач по шаблону T+0–4 / 4–24 / 24–96 / 3–5д / 5–10д. */
export function protocolTasks(r: Release): { title: string; note: string; due: string; time: string; format: FormatId; model: string; priority: 0 | 1 | 2 }[] {
  const d0 = releaseTs(r);
  const day = (n: number) => dayKey(d0 + n * 86_400_000);
  const m = r.model;
  return [
    {
      title: `${m}: первый тест, 1 промпт`,
      note: "T+0–4 ч. Самый короткий текст: только стек. Без продажи. Промпт в первом реплае.",
      due: day(0),
      time: "15:00",
      format: "prompt",
      model: m,
      priority: 2,
    },
    {
      title: `${m} vs Claude Opus 5.5: same prompt, 3D game`,
      note: "T+4–24 ч. Дуэль: сплит, подписи моделей, вопрос «кто выиграл?». Голосование в реплаях.",
      due: day(0),
      time: "23:00",
      format: "duel",
      model: m,
      priority: 2,
    },
    {
      title: `${m} + Unreal + Blender: босс за N минут`,
      note: "T+24–96 ч. Флагман недели: эпичный объект в кадре, HUD с первого кадра, чек «1 prompt · N min · $X». Промпт и ссылка в реплае.",
      due: day(1),
      time: "15:00",
      format: "boss",
      model: m,
      priority: 2,
    },
    {
      title: `How we built it with ${m}: prompt → agents → Unreal`,
      note: "T+3–5 д. Интерфейс Quadcode и движок в кадре 3–5 с. Гайд на guides.quadcode.ai, ссылка в реплае.",
      due: day(3),
      time: "15:00",
      format: "howbuilt",
      model: m,
      priority: 1,
    },
    {
      title: `Results: кто победил в дуэли ${m}`,
      note: "T+5–10 д. Итоги голосования «Results: 68% picked …», ссылка на гайд «{A} vs {B}». Закрывает цикл.",
      due: day(5),
      time: "15:00",
      format: "human",
      model: m,
      priority: 1,
    },
  ];
}

// ───────────── Линтер поста ─────────────

/** Запрещённые слова и штампы из WRITING RULES. */
export const STOP_WORDS = [
  "excited to announce",
  "game changer",
  "game-changer",
  "revolutionary",
  "revolutionize",
  "unleash",
  "elevate",
  "seamlessly",
  "supercharge",
  "next-level",
  "effortlessly",
  "the future of",
  "in today's fast-paced world",
  "link in bio",
  "agi is here",
  "devs are cooked",
  "replaces artists",
  "#",
  "🚀",
];

export interface LintIssue {
  level: "error" | "warn";
  text: string;
}

/** Проверка слота перед выходом. error = не выходит, warn = подумать. */
export function lint(t: Task, all: Task[] = []): LintIssue[] {
  const out: LintIssue[] = [];
  const hook = (t.hook ?? "").trim();
  const first = hook.split("\n")[0] ?? "";
  const lines = hook.split("\n").filter((l) => l.trim()).length;

  if (!t.format || t.format === "other") out.push({ level: "error", text: "Нет рубрики. Вне рубрик у нас медиана 230–420 views." });
  if (!t.model?.trim()) out.push({ level: "error", text: "Не указана модель. Название модели в первой строке — главный ключ дистрибуции." });
  if (!hook) out.push({ level: "warn", text: "Текст поста пуст." });
  else {
    if (t.model && !first.toLowerCase().includes(t.model.toLowerCase().split(" ").pop() ?? "")) {
      out.push({ level: "warn", text: "Модель не в первой строке." });
    }
    if (first.length > 60) out.push({ level: "error", text: `Первая строка ${first.length} символов, лимит 60.` });
    if (lines > 2) out.push({ level: "error", text: `${lines} строки текста при видео, лимит 2.` });
    if (/https?:\/\//i.test(hook)) out.push({ level: "error", text: "Ссылка в теле поста режет охват. Только в реплае." });
    const low = hook.toLowerCase();
    const bad = STOP_WORDS.filter((w) => low.includes(w));
    if (bad.length) out.push({ level: "error", text: `Стоп-слова: ${bad.join(", ")}.` });
    if (hook === hook.toUpperCase() && /[A-ZА-Я]{4,}/.test(hook)) out.push({ level: "warn", text: "ALL-CAPS не работает." });
  }
  if (!t.firstReply?.trim()) out.push({ level: "error", text: "Нет первого комментария: промпт в реплае удваивает закладки (1.0% против 0.52%)." });
  if (!t.refs?.length) out.push({ level: "warn", text: "Нет референса." });
  if (!t.video) out.push({ level: "warn", text: "Нет ссылки на видео." });
  if (t.due && t.time) {
    const sameDay = all.filter((o) => o.id !== t.id && o.due === t.due && o.time && isPost(o) && (o.format ?? "other") !== "other");
    if (sameDay.length >= 1 && (t.format ?? "other") !== "other") {
      out.push({ level: "warn", text: "Второй видеопост за день: у Higgsfield чем больше постов в день, тем ниже медиана (ρ = −0,69)." });
    }
  }
  return out;
}

/** Заполненность недельных квот по группам рубрик. */
export function quotaFill(tasks: Task[]): Record<FormatGroup, { have: number; want: number }> {
  const posts = tasks.filter((t) => isPost(t) && t.format && t.format !== "other");
  const total = tasks.filter(isPost).length || 1;
  const out = { reach: { have: 0, want: 0 }, engage: { have: 0, want: 0 }, convert: { have: 0, want: 0 } };
  for (const g of Object.keys(out) as FormatGroup[]) out[g].want = Math.round(total * QUOTA[g]);
  for (const t of posts) out[FORMATS[t.format!].group].have++;
  return out;
}
