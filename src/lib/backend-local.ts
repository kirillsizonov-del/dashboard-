import type { Backend } from "./backend";
import { dbToRows } from "./backend";
import type { DB, Row } from "./types";

const DB_KEY = "qcai:v4:db";

function read(): Row[] {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Row[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Хранит всё в localStorage этого браузера. Между вкладками синхронизируется само. */
export function localBackend(): Backend {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: DB | null = null;
  const flush = () => {
    timer = null;
    if (!pending) return;
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(dbToRows(pending)));
    } catch (e) {
      console.error("Не удалось сохранить данные в localStorage", e);
    }
    pending = null;
  };
  if (typeof window !== "undefined") window.addEventListener("pagehide", flush);

  return {
    kind: "local",
    async load() {
      return read();
    },
    async save(_rows, db) {
      pending = db;
      if (!timer) timer = setTimeout(flush, 120);
    },
    subscribe(_onRows, onReplace) {
      const handler = (e: StorageEvent) => {
        if (e.key === DB_KEY) onReplace(read());
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
  };
}
