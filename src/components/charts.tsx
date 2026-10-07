"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import type { DayBucket, FlowPoint, HeatCell, Series } from "@/lib/analytics";
import { SERIES, heatLevel, shortDate, weekdayIndex, weekdayName } from "@/lib/analytics";
import { ACTION_FORMS, CHANNELS, FUNNEL_LABEL, NO_CHANNEL_COLOR, plural } from "@/lib/meta";
import { FUNNEL_STAGES } from "@/lib/types";
import type { FunnelStage } from "@/lib/types";
import { Avatar, cx } from "./ui";

// ───────────── Общие части ─────────────

export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Всплывающая подсказка у курсора. Одна на график. */
export function useTip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = (e: { clientX: number; clientY: number }, content: ReactNode) =>
    setTip({ x: e.clientX, y: e.clientY, content });
  const hide = () => setTip(null);
  const node =
    tip && typeof document !== "undefined"
      ? createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-[70] min-w-[120px] max-w-[260px] rounded-xl border border-white/12 bg-menu/95 px-3 py-2 text-[13px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] backdrop-blur"
            style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 270)), top: tip.y + 16 }}
          >
            {tip.content}
          </div>,
          document.body,
        )
      : null;
  return { show, hide, node };
}

const seriesColor = (s: Series) => (s === "none" ? NO_CHANNEL_COLOR : CHANNELS[s].color);
const seriesName = (s: Series) => (s === "none" ? "Без канала" : CHANNELS[s].name);

function niceScale(max: number): { top: number; ticks: number[] } {
  const target = Math.max(4, max);
  const rough = target / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const top = Math.ceil(target / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
  return { top, ticks };
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className={i.line ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"}
            style={{ background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13.5px] text-muted">
      {children}
    </div>
  );
}

// ───────────── Тепловая карта активности ─────────────

const HEAT = ["var(--h0)", "var(--h1)", "var(--h2)", "var(--h3)", "var(--h4)"];

/** Сколько недель помещается при текущей ширине блока. */
export function weeksForWidth(width: number): number {
  if (!width) return 26;
  const pitch = width < 520 ? 15 : 20;
  return Math.max(12, Math.min(53, Math.floor((width + 4) / pitch)));
}

export function Heatmap({ weeks }: { weeks: HeatCell[][] }) {
  const tip = useTip();
  const max = useMemo(() => Math.max(0, ...weeks.flat().map((c) => c.count)), [weeks]);
  const total = useMemo(() => weeks.flat().reduce((n, c) => n + c.count, 0), [weeks]);
  const months = weeks.map((col, i) => {
    const d = new Date(col[0].ts);
    const prev = i > 0 ? new Date(weeks[i - 1][0].ts) : null;
    const next = i < weeks.length - 1 ? new Date(weeks[i + 1][0].ts) : null;
    // Подпись нужна на первой неделе месяца, если за ней есть место: иначе соседние подписи слипаются.
    const starts = prev ? prev.getMonth() !== d.getMonth() : true;
    const roomy = next ? next.getMonth() === d.getMonth() : false;
    return starts && roomy ? shortDate(col[0].ts).split(" ")[1] : "";
  });

  return (
    <div>
      <div
        className="wipe-in grid gap-[3px] sm:gap-1"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`Активность по дням за ${weeks.length} недель: ${total} ${plural(total, ACTION_FORMS)}`}
        onPointerLeave={tip.hide}
      >
        {weeks.map((_, i) => (
          <div key={`m${i}`} className="h-4 overflow-visible whitespace-nowrap text-[11px] leading-4 text-muted">
            {months[i]}
          </div>
        ))}
        {Array.from({ length: 7 }, (_, row) =>
          weeks.map((col) => {
            const c = col[row];
            if (c.future) return <div key={c.key} className="aspect-square" />;
            return (
              <div
                key={c.key}
                className="aspect-square rounded-[4px] transition-[filter,transform] duration-200 hover:scale-125 hover:brightness-125"
                style={{ background: HEAT[heatLevel(c.count, max)] }}
                onPointerMove={(e) =>
                  tip.show(
                    e,
                    <>
                      <div className="font-semibold text-ink">
                        {c.count} {plural(c.count, ACTION_FORMS)}
                      </div>
                      <div className="text-muted">
                        {shortDate(c.ts)}, {weekdayName(weekdayIndex(c.ts)).toLowerCase()}
                      </div>
                    </>,
                  )
                }
              />
            );
          }),
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-1.5 text-[12px] text-muted">
        Меньше
        {HEAT.map((c) => (
          <span key={c} className="size-2.5 rounded-[3px]" style={{ background: c }} />
        ))}
        Больше
      </div>
      {tip.node}
    </div>
  );
}

// ───────────── Действия по дням, столбики по каналам ─────────────

export function StackedDays({ buckets, height = 220 }: { buckets: DayBucket[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);

  const m = { l: 30, r: 6, t: 8, b: 24 };
  const plotW = Math.max(0, width - m.l - m.r);
  const plotH = height - m.t - m.b;
  const max = Math.max(0, ...buckets.map((b) => b.total));
  const { top, ticks } = niceScale(max);
  const band = buckets.length ? plotW / buckets.length : 0;
  const barW = Math.max(2, Math.min(24, band - 4));
  const y = (v: number) => m.t + plotH - (v / top) * plotH;
  const every = Math.max(1, Math.ceil(52 / Math.max(1, band)));
  const GAP = 2;

  return (
    <div>
      <Legend items={SERIES.map((s) => ({ label: seriesName(s), color: seriesColor(s) }))} />
      <div ref={ref} className="relative mt-3" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label="Действия по дням, с разбивкой по каналам" className="grow-y">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-2)" : "var(--line)"} />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11.5" fill="var(--muted)" className="tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {buckets.map((b, i) => {
              const cx0 = m.l + band * i + band / 2;
              const present = SERIES.filter((s) => b.by[s] > 0);
              let acc = 0;
              return (
                <g key={b.key}>
                  {hover === i && <rect x={m.l + band * i} y={m.t} width={band} height={plotH} fill="rgba(255,255,255,0.04)" />}
                  <g>
                  {present.map((s, k) => {
                    const y1 = y(acc + b.by[s]);
                    const y0 = y(acc);
                    acc += b.by[s];
                    const last = k === present.length - 1;
                    const h = Math.max(1, y0 - y1 - (last ? 0 : GAP));
                    const x = cx0 - barW / 2;
                    const topY = y0 - h;
                    const r = last ? Math.min(4, barW / 2, h) : 0;
                    return (
                      <path
                        key={s}
                        d={`M${x},${y0} V${topY + r} Q${x},${topY} ${x + r},${topY} H${x + barW - r} Q${x + barW},${topY} ${x + barW},${topY + r} V${y0} Z`}
                        fill={seriesColor(s)}
                      />
                    );
                  })}
                  </g>
                  {(buckets.length - 1 - i) % every === 0 && (
                    <text x={cx0} y={height - 7} textAnchor="middle" fontSize="11.5" fill="var(--muted)">
                      {b.label}
                    </text>
                  )}
                  <rect
                    x={m.l + band * i}
                    y={m.t}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onPointerMove={(e) => {
                      setHover(i);
                      tip.show(
                        e,
                        <>
                          <div className="mb-1 text-muted">{b.label}</div>
                          <div className="font-semibold text-ink">
                            {b.total} {plural(b.total, ACTION_FORMS)}
                          </div>
                          {present.map((s) => (
                            <div key={s} className="mt-0.5 flex items-center gap-2">
                              <span className="h-0.5 w-3 rounded-full" style={{ background: seriesColor(s) }} />
                              <span className="font-medium text-ink">{b.by[s]}</span>
                              <span className="text-muted">{seriesName(s)}</span>
                            </div>
                          ))}
                        </>,
                      );
                    }}
                    onPointerLeave={() => {
                      setHover(null);
                      tip.hide();
                    }}
                  />
                </g>
              );
            })}
          </svg>
        )}
        {max === 0 && <ChartEmpty>За этот период действий пока нет</ChartEmpty>}
      </div>
      {tip.node}
    </div>
  );
}

// ───────────── Воронка ─────────────

export function FunnelBars({
  counts,
  goals,
}: {
  counts: Record<FunnelStage, number>;
  /** С ориентиром каждая строка показывает прогресс к своей цели, без него все строки в одном масштабе. */
  goals?: Record<FunnelStage, number>;
}) {
  const scale = Math.max(1, ...FUNNEL_STAGES.map((s) => counts[s]));
  return (
    <div className="space-y-3">
      {FUNNEL_STAGES.map((s, i) => {
        const prev = i > 0 ? counts[FUNNEL_STAGES[i - 1]] : 0;
        const conv = i > 0 && prev > 0 ? Math.round((counts[s] / prev) * 100) : null;
        const goal = goals?.[s];
        const hasGoal = goal !== undefined && goal > 0;
        const pct = hasGoal ? Math.min(100, (counts[s] / goal) * 100) : (counts[s] / scale) * 100;
        return (
          <div key={s} className="grid grid-cols-[92px_minmax(0,1fr)_auto] items-center gap-3">
            <div className="text-[13.5px] text-ink-2">{FUNNEL_LABEL[s]}</div>
            <div
              className={cx("h-2.5 overflow-hidden", hasGoal && "rounded-full")}
              style={hasGoal ? { background: "color-mix(in srgb, var(--accent) 20%, transparent)" } : undefined}
            >
              <div
                className={cx(
                  "grow-x h-full bg-accent transition-[width] duration-700 ease-out-quint",
                  hasGoal ? "rounded-full" : "rounded-r-[4px]",
                )}
                style={{ width: `${pct}%`, minWidth: counts[s] > 0 ? 4 : 0, "--i": i } as CSSProperties}
              />
            </div>
            <div className="min-w-[84px] text-right text-[13.5px] tabular-nums">
              <span className="font-semibold text-ink">{counts[s]}</span>
              {hasGoal && <span className="text-muted"> из {goal}</span>}
              {!hasGoal && conv !== null && <span className="text-muted"> · {conv}%</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────── Когда работаем: дни недели × часы ─────────────

export function HourGrid({ grid }: { grid: number[][] }) {
  const tip = useTip();
  const max = Math.max(0, ...grid.flat());
  return (
    <div className="relative">
      <div
        className="wipe-in grid items-center gap-[3px]"
        style={{ gridTemplateColumns: "22px repeat(24, minmax(0, 1fr))" }}
        role="img"
        aria-label="Активность по дням недели и часам"
        onPointerLeave={tip.hide}
      >
        {grid.map((row, d) => [
          <div key={`l${d}`} className="text-[11.5px] text-muted">
            {weekdayName(d)}
          </div>,
          ...row.map((count, h) => (
            <div
              key={`${d}-${h}`}
              className="aspect-square max-h-6 w-full rounded-[4px] transition-[filter] hover:brightness-125"
              style={{ background: HEAT[heatLevel(count, max)] }}
              onPointerMove={(e) =>
                tip.show(
                  e,
                  <>
                    <div className="font-semibold text-ink">
                      {count} {plural(count, ACTION_FORMS)}
                    </div>
                    <div className="text-muted">
                      {weekdayName(d)}, {String(h).padStart(2, "0")}:00-{String(h + 1).padStart(2, "0")}:00
                    </div>
                  </>,
                )
              }
            />
          )),
        ])}
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={`h${h}`} className="text-center text-[11px] tabular-nums text-muted">
            {h % 6 === 0 ? h : ""}
          </div>
        ))}
      </div>
      {max === 0 && <ChartEmpty>Появится после первых действий</ChartEmpty>}
      {tip.node}
    </div>
  );
}

// ───────────── Кто сколько сделал ─────────────

export function MemberBars({ rows }: { rows: { id: string; name: string; color: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.id || "anon"} className="grid grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink-2">
            <Avatar member={r.id ? { id: r.id, name: r.name, color: r.color } : null} size={20} />
            <span className="truncate">{r.name}</span>
          </div>
          <div className="h-3">
            <div
              className="grow-x h-full rounded-r-[4px] bg-accent transition-[width] duration-700 ease-out-quint"
              style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count > 0 ? 3 : 0, "--i": i } as CSSProperties}
            />
          </div>
          <div className="min-w-[36px] text-right text-[13.5px] font-semibold tabular-nums text-ink">{r.count}</div>
        </div>
      ))}
    </div>
  );
}

// ───────────── Задачи: создано и закрыто ─────────────

export function FlowLines({ points, height = 200 }: { points: FlowPoint[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);

  const m = { l: 30, r: 12, t: 10, b: 24 };
  const plotW = Math.max(0, width - m.l - m.r);
  const plotH = height - m.t - m.b;
  const max = Math.max(0, ...points.map((p) => Math.max(p.created, p.done)));
  const { top, ticks } = niceScale(max);
  const n = points.length;
  const x = (i: number) => m.l + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const y = (v: number) => m.t + plotH - (v / top) * plotH;
  const path = (key: "created" | "done") => points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join(" ");
  const every = Math.max(1, Math.ceil(52 / Math.max(1, n > 1 ? plotW / (n - 1) : plotW)));
  const CREATED = "var(--c-none)";
  const DONE = "var(--accent)";

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left) / Math.max(1, rect.width)) * (n - 1))));
    setHover(i);
    const p = points[i];
    tip.show(
      e,
      <>
        <div className="mb-1 text-muted">{p.label}</div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: DONE }} />
          <span className="font-semibold text-ink">{p.done}</span>
          <span className="text-muted">закрыто</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className="h-0.5 w-3 rounded-full" style={{ background: CREATED }} />
          <span className="font-semibold text-ink">{p.created}</span>
          <span className="text-muted">создано</span>
        </div>
      </>,
    );
  };

  return (
    <div>
      <Legend
        items={[
          { label: "Закрыто", color: DONE, line: true },
          { label: "Создано", color: CREATED, line: true },
        ]}
      />
      <div ref={ref} className="relative mt-3" style={{ height }}>
        {width > 0 && n > 0 && (
          <svg width={width} height={height} role="img" aria-label="Задачи по дням: создано и закрыто">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--line-2)" : "var(--line)"} />
                <text x={m.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11.5" fill="var(--muted)" className="tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {points.map(
              (p, i) =>
                (n - 1 - i) % every === 0 && (
                  <text
                    key={p.ts}
                    x={x(i)}
                    y={height - 7}
                    textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"}
                    fontSize="11.5"
                    fill="var(--muted)"
                  >
                    {p.label}
                  </text>
                ),
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + plotH} stroke="var(--line-2)" />}
            <path d={path("created")} fill="none" stroke={CREATED} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={path("done")} fill="none" stroke={DONE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {[hover ?? n - 1].map((i) => (
              <g key="dots">
                <circle cx={x(i)} cy={y(points[i].created)} r="4" fill={CREATED} stroke="var(--panel)" strokeWidth="2" />
                <circle cx={x(i)} cy={y(points[i].done)} r="4" fill={DONE} stroke="var(--panel)" strokeWidth="2" />
              </g>
            ))}
            <rect
              x={m.l}
              y={m.t}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => {
                setHover(null);
                tip.hide();
              }}
            />
          </svg>
        )}
        {max === 0 && <ChartEmpty>Появится, когда начнёте добавлять и закрывать задачи</ChartEmpty>}
      </div>
      {tip.node}
    </div>
  );
}

/** Таблица-близнец графика по дням: те же числа без наведения. */
export function DaysTable({ buckets }: { buckets: DayBucket[] }) {
  const rows = [...buckets].reverse().filter((b) => b.total > 0);
  if (!rows.length) return <p className="py-6 text-center text-[13.5px] text-muted">За этот период действий пока нет</p>;
  return (
    <div className="max-h-[300px] overflow-auto">
      <table className="w-full text-left text-[13.5px] tabular-nums">
        <thead className="eyebrow sticky top-0 bg-panel">
          <tr>
            <th className="py-1.5 pr-3 font-normal">День</th>
            {SERIES.map((s) => (
              <th key={s} className="px-2 py-1.5 text-right font-normal">
                {seriesName(s)}
              </th>
            ))}
            <th className="py-1.5 pl-2 text-right font-normal">Всего</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key} className="border-t border-line">
              <td className="py-1.5 pr-3 text-ink-2">{b.label}</td>
              {SERIES.map((s) => (
                <td key={s} className={cx("px-2 py-1.5 text-right", b.by[s] ? "text-ink" : "text-muted")}>
                  {b.by[s]}
                </td>
              ))}
              <td className="py-1.5 pl-2 text-right font-semibold text-ink">{b.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
