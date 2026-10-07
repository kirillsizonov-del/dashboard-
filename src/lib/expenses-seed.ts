/**
 * Закупка рекламы на TeleTarget, октябрь 2026, бюджет 5 000 ₽.
 * Охват это средний охват поста по данным TeleTarget на 6 октября.
 * План: 12 строк на 4 750 ₽, резерв: 3 строки на 1 349 ₽.
 * Грузится кнопкой на пустой странице «Расходы» и в чистое пространство из seed.ts.
 */
import type { ExpenseInput } from "./expenses";
import type { Budget, Expense, Row } from "./types";

export const TELETARGET_MONTH = "2026-10";
export const TELETARGET_BUDGET: Budget = { amount: 5000, currency: "RUB" };
export const TELETARGET_COMMON = { platform: "TeleTarget", currency: "RUB", month: TELETARGET_MONTH, date: null } as const;

/** Те же строки, что в ТЗ, раздел B5: этот JSON можно вставить в «Импорт». */
export const TELETARGET_ROWS: Pick<ExpenseInput, "channelUrl" | "channelTitle" | "topic" | "amount" | "reachPlanned" | "status" | "note" | "creative">[] = [
  { channelUrl: "https://t.me/novosti_blogeri_media", channelTitle: "Новости и блогеры", topic: "Бизнес, новости и блогеры (48 ч)", amount: 250, reachPlanned: 1300, status: "plan" },
  { channelUrl: "https://t.me/financ3magic", channelTitle: "Финансовая магия", topic: "Бизнес, финансы и маркетинг", amount: 400, reachPlanned: 1400, status: "plan", note: "сетка из 4 похожих каналов" },
  { channelUrl: "https://t.me/digit4l_trnds", channelTitle: "Цифровые Тренды Сегодня", topic: "Бизнес, цифровые тренды", amount: 350, reachPlanned: 1200, status: "plan", note: "сетка" },
  { channelUrl: "https://t.me/sucesinvestment", channelTitle: "Инвестиции в Успех", topic: "Бизнес, инвестиции", amount: 350, reachPlanned: 1100, status: "plan", note: "сетка" },
  { channelUrl: "https://t.me/business_shift1", channelTitle: "Business Shift", topic: "Бизнес онлайн", amount: 500, reachPlanned: 1500, status: "plan", note: "сетка" },
  { channelUrl: "https://t.me/BusEcoBlock", channelTitle: "BusinessEconomyBlockchain", topic: "Бизнес, экономика", amount: 300, reachPlanned: 635, status: "plan" },
  { channelUrl: "https://t.me/mraket", channelTitle: "Мракетинг", topic: "Маркетинг", amount: 250, reachPlanned: 497, status: "plan" },
  { channelUrl: "https://t.me/busine55code", channelTitle: "Business Code", topic: "ИИ от разработчика", amount: 350, reachPlanned: 1400, status: "plan" },
  { channelUrl: "https://t.me/ksenijavalerievna", channelTitle: "Ксения Валерьевна | Про Telegram", topic: "Маркетинг в Telegram", amount: 800, reachPlanned: 1100, status: "plan" },
  { channelUrl: "https://t.me/explanation_boss", channelTitle: "Начальник разъясняет", topic: "Советы по бизнесу", amount: 800, reachPlanned: 899, status: "plan" },
  { channelUrl: "https://t.me/CartoonNetwork02", channelTitle: "Cartoon Network", topic: "Мультфильмы и аниме", amount: 100, reachPlanned: 2600, status: "plan", creative: "аниме-видео" },
  { channelUrl: "https://t.me/animebay", channelTitle: "Аниме Бухта", topic: "Аниме", amount: 300, reachPlanned: 2300, status: "plan", creative: "аниме-видео" },
  { channelUrl: "https://t.me/neyrocry", channelTitle: "Промты", topic: "Промты для ИИ", amount: 199, reachPlanned: 500, status: "reserve" },
  { channelUrl: "https://t.me/lightbus", channelTitle: "Business Light", topic: "Бизнес простым языком", amount: 500, reachPlanned: 1400, status: "reserve", note: "та же сетка" },
  { channelUrl: "https://t.me/rushbusiness", channelTitle: "Business Rush", topic: "Журнал о бизнесе", amount: 650, reachPlanned: 1600, status: "reserve", note: "та же сетка" },
];

const handle = (url?: string) => (url ?? "").split("/").pop()?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "";

/**
 * Строки закупки с постоянными id: если два браузера загрузят её одновременно,
 * запишутся одни и те же строки, а не две копии.
 */
export function teleTargetInputs(): (ExpenseInput & { id: string })[] {
  return TELETARGET_ROWS.map((r) => ({
    ...TELETARGET_COMMON,
    ...r,
    id: `exp-tt-${TELETARGET_MONTH}-${handle(r.channelUrl)}`,
  }));
}

/** Для чистого пространства: строки хранилища с расходами закупки. */
export function teleTargetSeedRows(ts: number): Row[] {
  return teleTargetInputs().map((input, i) => {
    const x: Expense = { ...input, createdBy: "", createdAt: ts + i, updatedAt: ts + i };
    return { kind: "expense", id: x.id, data: x };
  });
}
