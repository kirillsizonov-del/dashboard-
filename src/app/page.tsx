"use client";

import { ArrowUpRight, Radar } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useShell } from "@/components/AppShell";
import { DailyStrip } from "@/components/daily";
import { FormatBadge, VerdictBadge } from "@/components/post";
import { QuickCapture, TaskRow, sortOpen } from "@/components/tasks";
import { Empty, PageHead, Panel, cx } from "@/components/ui";
import { dayKey, shortDate, weekdayIndex, weekdayName } from "@/lib/analytics";
import {
  STAGE_LABEL,
  WINDOW_LABEL,
  fmtNum,
  isPost,
  lastSnapshot,
  lint,
  medianViews,
  snapshotDue,
  snapshotLabel,
  stageOf,
  verdictOf,
  windowAt,
} from "@/lib/content";
import { useNow } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import type { Task } from "@/lib/types";

/**
 * «Сегодня»: только то, что надо сделать сегодня, по порядку.
 * Планирование — во вкладке «План», цифры — в «Результатах».
 */
export default function TodayPage() {
  const { db } = useApp();
  const shell = useShell();
  const now = useNow();
  const today = dayKey(now);

  const all = useMemo(() => Object.values(db.tasks), [db.tasks]);
  const median = useMemo(() => medianViews(all), [all]);
  const releases = db.meta.releases ?? [];
  const live = windowAt(now, releases);

  const todayPosts = useMemo(
    () => all.filter((t) => isPost(t) && !t.daily && t.due === today).sort((a, b) => ((a.time ?? "99") < (b.time ?? "99") ? -1 : 1)),
    [all, today],
  );
  const metricsDue = useMemo(
    () => all.flatMap((t) => (isPost(t) ? [{ t, h: snapshotDue(t, now) }] : [])).filter((x): x is { t: Task; h: number } => x.h !== null),
    [all, now],
  );
  const other = useMemo(() => all.filter((t) => !isPost(t) && !t.daily && t.status !== "done").sort(sortOpen), [all]);

  return (
    <div className="stagger space-y-4">
      <PageHead
        title="Сегодня"
        purpose="Что сделать сегодня. Идите сверху вниз: выпустить посты, снять метрики, пройти рутину."
        right={
          <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-muted">
            {weekdayName(weekdayIndex(now))}, {shortDate(now)}
          </span>
        }
      />

      {live && (live.state === "day0" || live.state === "open") && (
        <Link
          href="/plan"
          className="flex items-center gap-3 rounded-[16px] border border-good/40 bg-good/[0.08] px-4 py-3 text-[14px] text-ink transition-colors hover:bg-good/[0.12]"
        >
          <Radar size={18} className="shrink-0 text-good" />
          <span className="min-w-0 flex-1">
            <b className="font-medium">{live.release.model}</b>: {WINDOW_LABEL[live.state]}. Пост про модель должен выйти в ближайшие 24 часа.
          </span>
          <ArrowUpRight size={16} className="shrink-0 text-muted" />
        </Link>
      )}

      <Panel eyebrow="Шаг 1" title="Выпустить посты" hint="Откройте пост, исправьте красное, опубликуйте и вставьте ссылку. Первый час отвечайте на реплаи." right={<More href="/plan">План</More>}>
        {todayPosts.length ? (
          <ul className="-mx-2 space-y-0.5">
            {todayPosts.map((t) => (
              <PostRow key={t.id} task={t} onOpen={() => shell.openTask(t.id)}>
                <StageMark task={t} all={all} median={median} />
              </PostRow>
            ))}
          </ul>
        ) : (
          <Empty title="Сегодня постов нет">Добавьте слот во вкладке «План».</Empty>
        )}
      </Panel>

      <Panel eyebrow="Шаг 2" title="Снять метрики" hint="Цифры из X Analytics: views, лайки, реплаи, репосты, закладки. Без них нет вердикта." right={<More href="/analytics">Результаты</More>}>
        {metricsDue.length ? (
          <ul className="-mx-2 space-y-0.5">
            {metricsDue.map(({ t, h }) => (
              <PostRow key={t.id} task={t} onOpen={() => shell.openTask(t.id)}>
                <span className="font-mono rounded-md border border-warn/40 bg-warn/10 px-1.5 py-px text-[11px] text-warn">нужен {snapshotLabel(h)}</span>
              </PostRow>
            ))}
          </ul>
        ) : (
          <Empty title="Всё снято">Новые отметки появятся через 1, 6, 24 часа, 3 и 7 дней после выхода.</Empty>
        )}
      </Panel>

      <div>
        <div className="eyebrow mb-2 px-1">Шаг 3 · Рутина</div>
        <DailyStrip />
      </div>

      <Panel eyebrow="Остальное" title="Другие задачи" hint="Всё, что не пост: монтаж, гайды, площадки." right={<More href="/tasks">Все задачи</More>}>
        <div className="mb-3">
          <QuickCapture />
        </div>
        {other.length ? (
          <div className="-mx-2 space-y-0.5">
            {other.slice(0, 5).map((t) => (
              <TaskRow key={t.id} task={t} members={db.members} onOpen={shell.openTask} />
            ))}
          </div>
        ) : (
          <Empty title="Пусто">Других задач нет.</Empty>
        )}
      </Panel>
    </div>
  );
}

function PostRow({ task, onOpen, children }: { task: Task; onOpen: () => void; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.04]"
      >
        <span className="w-11 shrink-0 font-mono text-[12.5px] text-muted">{task.time ?? "—"}</span>
        <span className="hidden shrink-0 sm:block">
          <FormatBadge id={task.format} size="xs" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-ink">{task.title}</span>
          {task.model && <span className="block truncate text-[12px] text-muted">{task.model}</span>}
        </span>
        <span className="shrink-0">{children}</span>
      </button>
    </li>
  );
}

function StageMark({ task, all, median }: { task: Task; all: Task[]; median: number }) {
  const stage = stageOf(task, all);
  if (stage === "published") {
    const s = lastSnapshot(task);
    return (
      <span className="inline-flex items-center gap-2">
        {s && <span className="font-mono text-[12px] tabular-nums text-ink-2">{fmtNum(s.views)}</span>}
        <VerdictBadge verdict={verdictOf(task, median)} size="xs" />
      </span>
    );
  }
  const errors = lint(task, all).filter((i) => i.level === "error").length;
  return (
    <span
      className={cx(
        "font-mono rounded-md border px-1.5 py-px text-[11px]",
        stage === "ready" ? "border-good/40 bg-good/10 text-good" : "border-crit/40 bg-crit/10 text-crit",
      )}
    >
      {stage === "ready" ? STAGE_LABEL.ready : `${STAGE_LABEL.draft}: ${errors}`}
    </span>
  );
}

function More({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-[13.5px] text-muted transition-colors hover:text-accent-soft">
      {children}
      <ArrowUpRight size={15} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
