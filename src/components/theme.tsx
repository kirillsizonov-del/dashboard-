"use client";

import { Check, Clock3, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNow, useStored } from "@/lib/hooks";
import type { ThemeMode } from "@/lib/theme";
import { NIGHT_FROM, NIGHT_TO, THEME_KEY, applyTheme, isMode, resolveTheme } from "@/lib/theme";
import { cx } from "./ui";

const OPTIONS: { value: ThemeMode; label: string; hint?: string }[] = [
  { value: "default", label: "Обычная" },
  { value: "night", label: "Ночная" },
  { value: "auto", label: "Авто", hint: `ночная с ${NIGHT_FROM}:00 до 0${NIGHT_TO}:00` },
];

/**
 * Переключатель темы в шапке. Клик: обычная ⇄ ночная. Правый клик или долгое нажатие: меню с «Авто».
 * Выбор у каждого свой, в этом браузере.
 */
export function ThemeToggle() {
  const [stored, setStored] = useStored(THEME_KEY);
  const mode: ThemeMode = isMode(stored) ? stored : "default";
  // Для «Авто» достаточно проверять раз в минуту: смена в 20:00 и 08:00 без перезагрузки
  const now = useNow();
  const theme = now ? resolveTheme(mode, now) : null;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<number | null>(null);
  const longFired = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    if (!theme) return;
    // Первый раз тему уже поставил скрипт в <head>, без анимации. Дальше цвета перетекают
    applyTheme(theme, !first.current);
    first.current = false;
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const night = theme === "night";
  const pick = (m: ThemeMode) => {
    setStored(m);
    setOpen(false);
  };
  const clearPress = () => {
    if (press.current !== null) window.clearTimeout(press.current);
    press.current = null;
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={night ? "Включить обычную тему" : "Включить ночную тему"}
        aria-haspopup="menu"
        aria-expanded={open}
        title={mode === "auto" ? "Тема: авто. Правый клик: выбрать режим" : "Тема. Правый клик: обычная, ночная или авто"}
        onClick={() => {
          if (longFired.current) {
            longFired.current = false;
            return;
          }
          // Из «Авто» клик фиксирует противоположную текущей
          pick(night ? "default" : "night");
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          longFired.current = false;
          clearPress();
          press.current = window.setTimeout(() => {
            longFired.current = true;
            setOpen(true);
          }, 450);
        }}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onPointerCancel={clearPress}
        className={cx(
          "press relative inline-flex size-10 items-center justify-center rounded-full border transition-colors",
          night ? "border-accent/40 bg-accent/[0.1] text-accent-soft hover:bg-accent/[0.16]" : "border-white/10 bg-white/[0.04] text-muted hover:text-ink",
        )}
      >
        {night ? <Moon size={17} /> : <Sun size={17} />}
        {mode === "auto" && (
          <span className="absolute -bottom-0.5 -right-0.5 inline-flex size-4 items-center justify-center rounded-full border border-line bg-panel text-muted" aria-hidden>
            <Clock3 size={10} />
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Тема"
          className="pop-in absolute right-0 top-12 z-50 w-56 rounded-2xl border border-white/12 bg-menu p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
        >
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === o.value}
              onClick={() => pick(o.value)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-white/[0.06]"
            >
              {o.value === "default" ? <Sun size={15} /> : o.value === "night" ? <Moon size={15} /> : <Clock3 size={15} />}
              <span className="min-w-0 flex-1">
                {o.label}
                {o.hint && <span className="block text-[12px] text-muted">{o.hint}</span>}
              </span>
              {mode === o.value && <Check size={15} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
