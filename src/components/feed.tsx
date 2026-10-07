"use client";

import { relativeTime } from "@/lib/analytics";
import { CHANNELS } from "@/lib/meta";
import type { DB, Ev } from "@/lib/types";
import { Avatar, Empty } from "./ui";

function verb(e: Ev): string {
  switch (e.type) {
    case "doc.add":
      return "Документ";
    case "target.import":
      return "Импорт базы";
    case "task.add":
      return "Новая задача";
    case "task.start":
      return "Взято в работу";
    case "task.done":
      return "Закрыта задача";
    case "task.daily":
      return "Сделано за день";
    case "task.reopen":
      return "Возвращена в работу";
    case "task.delete":
      return "Удалена задача";
    case "target.add":
      return "Добавлено в список";
    case "target.touch":
      return e.channelId ? CHANNELS[e.channelId].touchVerb : "Отправлено";
    case "target.stage":
      return "Этап";
    case "channel.status":
      return "Статус канала";
    case "expense.add":
      return "Добавлен расход";
    case "expense.import":
      return "Импорт расходов";
    case "expense.paid":
      return "Оплачено";
    case "expense.result":
      return "Итог по";
    default:
      return "Действие";
  }
}

export function Feed({ db, events, now, limit = 8 }: { db: DB; events: Ev[]; now: number; limit?: number }) {
  const recent = [...events].sort((a, b) => b.ts - a.ts).slice(0, limit);
  if (!recent.length) return <Empty title="Пока тихо">Здесь появятся действия команды: отметки, задачи, смена статусов.</Empty>;
  return (
    <ul className="space-y-1">
      {recent.map((e) => (
        <li key={e.id} className="rise flex items-start gap-3 rounded-xl px-2 py-2">
          <div className="pt-0.5">
            <Avatar member={e.by ? db.members[e.by] : null} size={22} />
          </div>
          <div className="min-w-0 flex-1 text-[14px] leading-snug">
            {/* «Итог по t.me/animebay: 2 100 просмотров», остальное через двоеточие */}
            <span className="text-muted">
              {verb(e)}
              {e.type === "expense.result" ? " " : ": "}
            </span>
            <span className="text-ink">{e.text}</span>
            <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">
              {e.type.startsWith("expense.") && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-[3px] bg-warn" />
                  Расходы
                </span>
              )}
              {e.channelId && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-[3px]" style={{ background: CHANNELS[e.channelId].color }} />
                  {CHANNELS[e.channelId].name}
                </span>
              )}
              <span>{relativeTime(e.ts, now)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
