"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, RefObject } from "react";
import { now } from "./clock";

// Одни часы на всё приложение: тик ровно на границе секунды и сразу при возврате на вкладку
const tickSubs = new Set<() => void>();
let tickAt = 0;
let tickTimer = 0;

function tick() {
  tickAt = now();
  tickSubs.forEach((cb) => cb());
}

function schedule() {
  window.clearTimeout(tickTimer);
  tickTimer = window.setTimeout(() => {
    tick();
    schedule();
  }, 1000 - (now() % 1000) + 5);
}

function onVisible() {
  if (document.visibilityState !== "hidden") {
    tick();
    schedule();
  }
}

function subscribeTick(cb: () => void) {
  if (!tickSubs.size) {
    tickAt = now();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
  }
  tickSubs.add(cb);
  return () => {
    tickSubs.delete(cb);
    if (!tickSubs.size) {
      window.clearTimeout(tickTimer);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/**
 * Текущее время с шагом step: по умолчанию раз в минуту, для таймера раз в секунду.
 * Компонент перерисовывается только когда меняется шаг. При возврате на вкладку время сразу верное.
 */
export function useNow(step = 60_000): number {
  return useSyncExternalStore(
    subscribeTick,
    () => Math.floor(lastTick() / step) * step,
    () => 0,
  );
}

function lastTick(): number {
  if (!tickAt) tickAt = now();
  return tickAt;
}

/** Совпадает ли media query, например "(min-width: 1024px)". На сервере false. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// Своя вкладка не получает событие storage, поэтому зовём подписчиков сами
const storedSubs = new Set<() => void>();

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Строка из localStorage этого браузера. Хранилище недоступно: живёт до перезагрузки. */
export function useStored(key: string): [string | null, (v: string) => void] {
  const subscribe = useCallback((cb: () => void) => {
    storedSubs.add(cb);
    window.addEventListener("storage", cb);
    return () => {
      storedSubs.delete(cb);
      window.removeEventListener("storage", cb);
    };
  }, []);
  const [fallback, setFallback] = useState<Record<string, string>>({});
  const stored = useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null,
  );
  const write = useCallback(
    (v: string) => {
      try {
        localStorage.setItem(key, v);
        // Запись прошла: память больше не нужна, иначе она перекроет новое значение
        setFallback((f) => {
          if (!(key in f)) return f;
          const rest = { ...f };
          delete rest[key];
          return rest;
        });
      } catch {
        setFallback((f) => ({ ...f, [key]: v }));
      }
      storedSubs.forEach((cb) => cb());
    },
    [key],
  );
  // Хранилище не приняло запись (например, переполнено), а старое значение в нём осталось: верим памяти
  return [fallback[key] ?? stored ?? null, write];
}

/**
 * Мягкое затухание у края прокрутки: маска только с той стороны, где ещё есть что листать.
 * content: от чего зависит содержимое (например, число строк), чтобы пересчитать без прокрутки.
 */
export function useEdgeFade<T extends HTMLElement>(axis: "x" | "y", content?: unknown, size = 28): [RefObject<T | null>, CSSProperties | undefined] {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const pos = axis === "x" ? el.scrollLeft : el.scrollTop;
      const max = axis === "x" ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
      const start = pos > 1;
      const end = pos < max - 1;
      setEdges((p) => (p.start === start && p.end === end ? p : { start, end }));
    };
    const raf = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [axis, content]);
  if (!edges.start && !edges.end) return [ref, undefined];
  const dir = axis === "x" ? "to right" : "to bottom";
  const mask = `linear-gradient(${dir}, ${edges.start ? "transparent" : "#000"} 0, #000 ${size}px, #000 calc(100% - ${size}px), ${edges.end ? "transparent" : "#000"} 100%)`;
  return [ref, { maskImage: mask, WebkitMaskImage: mask }];
}

/**
 * FLIP-анимация порядка строк: строка с data-flip плавно переезжает на новое место, а не прыгает.
 * Позиции считаем от начала содержимого контейнера, поэтому прокрутка не даёт ложных сдвигов.
 * key: подпись порядка (например, id строк через запятую), анимируем только когда она меняется.
 */
export function useFlip(ref: RefObject<HTMLElement | null>, key: string, ms = 280): void {
  const prev = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const base = box.getBoundingClientRect().top - box.scrollTop;
    const next = new Map<string, number>();
    const moved: HTMLElement[] = [];
    box.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      const id = el.dataset.flip;
      if (!id) return;
      const top = el.getBoundingClientRect().top - base;
      next.set(id, top);
      const old = prev.current.get(id);
      if (reduce || old === undefined || Math.abs(old - top) < 1) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${old - top}px)`;
      moved.push(el);
    });
    prev.current = next;
    if (!moved.length) return;
    const raf = requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = `transform ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = "";
      }
    });
    const done = window.setTimeout(() => {
      for (const el of moved) el.style.transition = "";
    }, ms + 40);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
      // Порядок сменился раньше, чем доиграла анимация: снимаем сдвиг, следующий проход начнёт с чистого места
      for (const el of moved) {
        el.style.transition = "";
        el.style.transform = "";
      }
    };
  }, [ref, key, ms]);
}
