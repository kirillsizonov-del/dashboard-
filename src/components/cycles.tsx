"use client";

import { Save } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CycleCfg } from "@/lib/cycles";
import { CYCLE_HOURS, CYCLE_TZ, boundaries, countdown, cycleAt, cycleCfg, cyclesOn, minutesWords } from "@/lib/cycles";
import { useNow } from "@/lib/hooks";
import { CHANNELS } from "@/lib/meta";
import { updateChannel, useApp } from "@/lib/store";
import { CHANNEL_IDS } from "@/lib/types";
import type { ChannelId } from "@/lib/types";
import { Button, Modal, Pills, cx, toast } from "./ui";

const QUARTER = 15 * 60_000;
const R = 11.5;
const C = 2 * Math.PI * R;

/**
 * Обратный отсчёт до нового круга: кольцо убывает за круг, под пилюлей «Круг 12:00-16:00, отмечено N из M».
 * Меньше 15 минут: жёлтый цвет и мягкая пульсация. Обновляется раз в секунду.
 */
export function CycleTimer({
  cfg,
  marked,
  total,
  className,
}: {
  cfg: Pick<CycleCfg, "hours" | "tz">;
  marked: number;
  total: number;
  className?: string;
}) {
  const at = useNow(1000);
  const ringId = `ring-${useId().replace(/:/g, "")}`;
  const c = cycleAt(at, cfg);
  const left = Math.max(0, c.end - at);
  const frac = Math.min(1, left / Math.max(1, c.end - c.start));
  const soon = left < QUARTER;
  // Скрытое объявление меняется раз в 15 минут: «До нового круга 3 часа 30 минут»
  const quarter = Math.ceil(left / QUARTER) * 15;
  return (
    <div className={cx("min-w-0", className)}>
      <div
        role="timer"
        aria-live="off"
        className={cx(
          "flex h-11 items-center gap-3 rounded-full border bg-white/[0.03] pl-2 pr-4 transition-colors duration-300 sm:w-fit",
          soon ? "border-warn/40" : "border-line",
        )}
      >
        <svg
          viewBox="0 0 28 28"
          width={28}
          height={28}
          aria-hidden
          className={cx("shrink-0 -rotate-90 transition-colors duration-300", soon ? "pulse-soft text-warn" : "text-accent")}
        >
          {/* Кольцо идёт градиентом темы: мятным днём, оранжевым ночью. Меньше 15 минут: жёлтое */}
          <defs>
            <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--grad-a)" />
              <stop offset="100%" stopColor="var(--grad-b)" />
            </linearGradient>
          </defs>
          <circle cx={14} cy={14} r={R} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={3} />
          <circle
            cx={14}
            cy={14}
            r={R}
            fill="none"
            stroke={soon ? "currentColor" : `url(#${ringId})`}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            className="cycle-ring"
          />
        </svg>
        <div className="min-w-0 leading-none">
          <div className="text-[11px] text-muted">Новый круг через</div>
          <div
            data-countdown
            className={cx(
              "font-mono mt-1 text-[20px] font-medium tabular-nums tracking-tight transition-colors duration-300",
              soon ? "pulse-soft text-warn" : "text-ink",
            )}
          >
            {countdown(left)}
          </div>
        </div>
      </div>
      {/* С sm подпись не расширяет блок: ширину задаёт пилюля, а подпись спокойно выходит вправо под кнопки */}
      <div data-cycle-line className="mt-1.5 truncate px-1 text-[12px] text-muted sm:w-0 sm:min-w-full sm:overflow-visible">
        Круг {c.label}, отмечено <span className="font-medium tabular-nums text-ink-2">{marked}</span> из {total}
      </div>
      <span className="sr-only" aria-live="polite">
        {quarter > 0 ? `До нового круга ${minutesWords(quarter)}` : ""}
      </span>
    </div>
  );
}

/**
 * Следит за кругами всех каналов, пока вкладка открыта: на границе круга тост,
 * а если браузер разрешил, системное уведомление. Ничего не рисует.
 */
export function CycleWatch() {
  const { db, ready } = useApp();
  // Границы кругов всегда на целой минуте, поэтому хватает минутного шага
  const at = useNow();
  const seen = useRef<Record<string, { cfg: string; start: number }>>({});
  useEffect(() => {
    if (!ready || !at) return;
    const fresh: ChannelId[] = [];
    const next: Record<string, { cfg: string; start: number }> = {};
    for (const id of CHANNEL_IDS) {
      const ch = db.channels[id];
      if (!cyclesOn(id, ch)) continue;
      const cfg = cycleCfg(ch);
      const key = `${cfg.hours}:${cfg.tz}`;
      const start = cycleAt(at, cfg).start;
      const was = seen.current[id];
      // Только настоящий переход вперёд: смена настроек или сдвиг часов назад тост не дают
      if (cfg.notify && was && was.cfg === key && start > was.start) fresh.push(id);
      next[id] = { cfg: key, start };
    }
    seen.current = next;
    if (!fresh.length) return;
    toast("Новый круг: можно снова постить", 3000, { top: true });
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted" && (document.hidden || !document.hasFocus())) {
        new Notification("Новый круг", {
          body: `Можно снова постить: ${fresh.map((id) => CHANNELS[id].name).join(", ")}`,
          tag: "qcai-cycle",
        });
      }
    } catch {}
  }, [at, db.channels, ready]);
  return null;
}

type Perm = NotificationPermission | "none";

const PERM_TEXT: Record<Perm, string> = {
  granted: "Системные уведомления разрешены",
  denied: "Браузер запретил уведомления, будет только тост",
  default: "Системные уведомления пока не разрешены",
  none: "Браузер не умеет уведомления, будет только тост",
};

const field = "h-11 w-full rounded-xl border border-line bg-field px-3 text-[15px] text-ink outline-none transition-colors hover:border-line-2 focus:border-accent/60";

/** Настройки кругов канала: вкл/выкл, длина круга, часовой пояс, уведомления. */
export function CyclesModal({ id, onClose }: { id: ChannelId; onClose: () => void }) {
  const { db } = useApp();
  const ch = db.channels[id];
  const [cfg0] = useState(() => cycleCfg(ch));
  const [on, setOn] = useState(() => cyclesOn(id, ch));
  const [hours, setHours] = useState(cfg0.hours);
  const [tz, setTz] = useState(cfg0.tz);
  const [notify, setNotify] = useState(cfg0.notify);
  const [perm, setPerm] = useState<Perm>(() => (typeof Notification === "undefined" ? "none" : Notification.permission));
  const zones = useMemo(() => {
    let list: string[] = [];
    try {
      list = Intl.supportedValuesOf("timeZone");
    } catch {}
    return [...new Set([cfg0.tz, CYCLE_TZ, ...list])];
  }, [cfg0.tz]);

  // Разрешение спрашиваем только по действию человека: при включении уведомлений или по кнопке
  const ask = async () => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    try {
      setPerm(await Notification.requestPermission());
    } catch {}
  };

  const save = () => {
    updateChannel(id, { cyclesEnabled: on, cycleHours: hours, cycleTz: tz, cycleNotify: notify });
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Круги рассылки">
      <p className="-mt-2 mb-5 text-[13.5px] text-muted">
        Галочка значит «уже писали в этом круге». В новый круг кружки пустеют сами, этап и счётчик ×N остаются.
      </p>
      <div className="space-y-4">
        <Row label={`Круги в канале ${CHANNELS[id].name}`}>
          <Pills
            label="Круги в канале"
            value={on ? "on" : "off"}
            onChange={(v) => setOn(v === "on")}
            options={[
              { value: "on", label: "Вкл" },
              { value: "off", label: "Выкл" },
            ]}
          />
        </Row>
        {/* Круги выключены: блок виден приглушённым, но недоступен ни мышью, ни с клавиатуры */}
        <div className={cx("space-y-4 transition-opacity duration-300", !on && "opacity-40")} inert={!on}>
          <Row label="Длительность круга" hint={`Новый круг в ${boundaries(hours).join(", ")}`}>
            <Pills
              label="Длительность круга"
              value={String(hours)}
              onChange={(v) => setHours(Number(v))}
              options={(CYCLE_HOURS.includes(hours) ? CYCLE_HOURS : [...CYCLE_HOURS, hours].sort((a, b) => a - b)).map((h) => ({
                value: String(h),
                label: `${h} ч`,
              }))}
            />
          </Row>
          <Row label="Часовой пояс" hint="По нему идут круги и считается плитка «Сегодня»">
            <select value={tz} onChange={(e) => setTz(e.target.value)} aria-label="Часовой пояс" className={field}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Row>
          <Row
            label="Уведомлять о новом круге"
            hint={
              notify ? (
                <>
                  {PERM_TEXT[perm]}
                  {perm === "default" && (
                    <>
                      {". "}
                      <button
                        type="button"
                        onClick={ask}
                        className="font-medium text-accent-soft underline decoration-accent/40 underline-offset-[3px] transition-colors hover:decoration-accent"
                      >
                        Разрешить
                      </button>
                    </>
                  )}
                </>
              ) : (
                "Без тоста и уведомлений"
              )
            }
          >
            <Pills
              label="Уведомлять о новом круге"
              value={notify ? "on" : "off"}
              onChange={(v) => {
                setNotify(v === "on");
                if (v === "on") ask();
              }}
              options={[
                { value: "on", label: "Вкл" },
                { value: "off", label: "Выкл" },
              ]}
            />
          </Row>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onClose}>
          Отмена
        </Button>
        <Button variant="primary" onClick={save}>
          <Save size={15} />
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      {children}
      {hint && <div className="mt-1.5 text-[12.5px] text-muted">{hint}</div>}
    </div>
  );
}
