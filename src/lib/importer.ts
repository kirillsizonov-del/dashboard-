/**
 * Импорт базы: CSV и TSV из таблиц, TXT, JSON, выгрузки чатов, просто вставленный текст.
 * Канал определяется по ссылке, дубли отсекаются по нормализованной ссылке или нику.
 */
import type { TargetInput } from "./store";
import type { ChannelId, DB } from "./types";

export interface ImportItem extends TargetInput {
  channelId: ChannelId;
  key: string;
  duplicate: boolean;
}

const HOSTS: [RegExp, ChannelId][] = [
  [/^(?:x\.com|twitter\.com|mobile\.twitter\.com)$/i, "x"],
  [/^(?:threads\.net|threads\.com)$/i, "threads"],
  [/^(?:discord\.gg|discord\.com|discordapp\.com)$/i, "discord"],
  [/^(?:reddit\.com|old\.reddit\.com|new\.reddit\.com|redd\.it)$/i, "reddit"],
];

const LINK_RE = /(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com|mobile\.twitter\.com|threads\.net|threads\.com|discord\.gg|discord\.com|discordapp\.com|reddit\.com|old\.reddit\.com|new\.reddit\.com|redd\.it)\/[^\s,;"'<>)\]]+|https?:\/\/[^\s,;"'<>)\]]+/giu;
const HANDLE_RE = /(?:^|[\s,;(])@([A-Za-z0-9_.]{3,40})(?=$|[\s,;:)!?])/gu;

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
}

function channelOfUrl(url: string): ChannelId | null {
  const host = hostOf(url);
  for (const [re, id] of HOSTS) if (re.test(host)) return id;
  return null;
}

/** Ключ для поиска дублей: хост и путь без протокола, www, параметров и регистра. */
export function targetKey(url: string, title: string): string {
  if (url) {
    const clean = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[?#]/)[0].replace(/\/+$/, "").toLowerCase();
    return clean
      .replace(/^(?:mobile\.)?twitter\.com\//, "x.com/")
      .replace(/^threads\.com\//, "threads.net/")
      .replace(/^(?:old|new)\.reddit\.com\//, "reddit.com/")
      .replace(/^discord\.com\/invite\//, "discord.gg/")
      .replace(/^discordapp\.com\//, "discord.com/");
  }
  return title.replace(/^@/, "").trim().toLowerCase();
}

function fromLink(raw: string, fallback: ChannelId): Omit<ImportItem, "key" | "duplicate"> | null {
  const url = (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).replace(/[.,!?]+$/, "");
  const channelId = channelOfUrl(url) ?? fallback;
  const path = url.replace(/^https?:\/\/[^/]+\/?/i, "");
  const first = decodeURIComponent(path.split(/[/?#]/)[0] || "");
  // Сабреддит: ссылка на пост тоже сводится к сабу, reddit.com/r/unity3d/comments/… → r/unity3d
  if (channelId === "reddit" && channelOfUrl(url) === "reddit") {
    const sub = path.match(/^(r|u|user)\/([A-Za-z0-9_]+)/i);
    if (!sub) return null;
    const kind = sub[1].toLowerCase() === "r" ? "r" : "u";
    return { channelId, title: `${kind}/${sub[2]}`, url: `https://www.reddit.com/${kind}/${sub[2]}`, note: "", starred: false };
  }
  // Discord: инвайт discord.gg/code или discord.com/invite/code
  if (channelId === "discord" && channelOfUrl(url) === "discord") {
    const code = hostOf(url) === "discord.gg" ? first : path.match(/^invite\/([^/?#]+)/i)?.[1];
    if (code) return { channelId, title: code, url: `https://discord.gg/${code}`, note: "", starred: false };
  }
  // Аккаунт X: ссылка на твит тоже сводится к автору, x.com/user/status/123 → @user
  if (channelId === "x" && channelOfUrl(url) === "x") {
    if (!first || /^(?:i|home|search|explore|hashtag|intent|share)$/i.test(first)) return null;
    return { channelId, title: `@${first}`, url: `https://x.com/${first}`, note: "", starred: false };
  }
  if (channelId === "threads" && /^@[A-Za-z0-9_.]+$/.test(first)) {
    return { channelId, title: first, url: `https://www.threads.net/${first}`, note: "", starred: false };
  }
  const title = url.replace(/^https?:\/\/(?:www\.)?/i, "").replace(/\/$/, "");
  return { channelId, title, url, note: "", starred: false };
}

function fromHandle(handle: string, channelId: ChannelId): Omit<ImportItem, "key" | "duplicate"> {
  if (channelId === "reddit") return { channelId, title: `r/${handle}`, url: `https://www.reddit.com/r/${handle}`, note: "", starred: false };
  if (channelId === "discord") return { channelId, title: handle, url: "", note: "", starred: false };
  if (channelId === "x") return { channelId, title: `@${handle}`, url: `https://x.com/${handle}`, note: "", starred: false };
  return { channelId, title: `@${handle}`, url: "", note: "", starred: false };
}

// ───────────── CSV ─────────────

/** Ячейка из нашей же выгрузки: апостроф перед = + - @ ставит выгрузка, чтобы Excel не считал текст формулой. */
const unguard = (cell: string) => cell.trim().replace(/^'(?=[=+\-@])/, "");

export function splitCSV(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(unguard(cell));
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(unguard(cell));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(unguard(cell));
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c));
}

const COL = {
  url: /^(?:url|link|ссылка|ссылки|линк|профиль|profile|адрес)$/i,
  title: /^(?:name|title|название|имя|чат|аккаунт|группа|канал|ник|username|handle|chat)$/i,
  note: /^(?:note|notes|заметка|заметки|ниша|описание|правило|правила|комментарий|comment|description)$/i,
  offer: /^(?:offer|оффер)$/i,
  channel: /^(?:platform|платформа|соцсеть|source|источник)$/i,
  star: /^(?:★|star|приоритет|priority|важно)$/i,
};

export function detectDelimiter(lines: string[]): string | null {
  for (const d of ["\t", ";", ","]) {
    const counts = lines.slice(0, 5).map((l) => l.split(d).length - 1);
    if (counts.length >= 1 && counts[0] >= 1 && counts.every((c) => c === counts[0])) return d;
  }
  return null;
}

const CHANNEL_WORDS: [RegExp, ChannelId][] = [
  [/twitter|твиттер|^x$|^х$/i, "x"],
  [/threads|тредс/i, "threads"],
  [/discord|дискорд|^дс$|^ds$/i, "discord"],
  [/reddit|реддит|^рд$|^rd$/i, "reddit"],
];

function parseTable(rows: string[][], fallback: ChannelId): Omit<ImportItem, "key" | "duplicate">[] | null {
  const header = rows[0].map((h) => h.replace(/^﻿/, "").trim());
  const idx = (re: RegExp) => header.findIndex((h) => re.test(h));
  const col = { url: idx(COL.url), title: idx(COL.title), note: idx(COL.note), offer: idx(COL.offer), channel: idx(COL.channel), star: idx(COL.star) };
  if (col.url < 0 && col.title < 0) return null;
  const out: Omit<ImportItem, "key" | "duplicate">[] = [];
  for (const r of rows.slice(1)) {
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    let ch: ChannelId = fallback;
    const chWord = cell(col.channel);
    for (const [re, id] of CHANNEL_WORDS) if (chWord && re.test(chWord)) ch = id;

    const linkCell = cell(col.url) || r.find((c) => LINK_RE.test(c)) || "";
    LINK_RE.lastIndex = 0;
    const link = linkCell.match(LINK_RE)?.[0];
    LINK_RE.lastIndex = 0;
    let item: Omit<ImportItem, "key" | "duplicate"> | null = null;
    if (link) item = fromLink(link, ch);
    else {
      const name = cell(col.title) || linkCell;
      const handle = name.match(/^@?([A-Za-z0-9_.]{3,40})$/)?.[1];
      if (handle) item = fromHandle(handle, ch);
      else if (name) item = { channelId: ch, title: name, url: "", note: "", starred: false };
    }
    if (!item) continue;
    if (col.title >= 0 && link && cell(col.title) && !/^@?[A-Za-z0-9_.]+$/.test(cell(col.title))) item.title = cell(col.title);
    const notes = [cell(col.note)].filter(Boolean);
    if (col.note < 0) {
      const used = new Set([col.url, col.title, col.offer, col.channel, col.star]);
      r.forEach((c, i) => {
        if (!used.has(i) && c && c !== linkCell && !/^(?:[✓✔☑x]|true|false|да|нет)$/i.test(c)) notes.push(c);
      });
    }
    item.note = notes.join(" · ");
    item.offer = cell(col.offer);
    item.starred = /★|⭐|^(?:да|yes|true|1|high|высокий)$/iu.test(cell(col.star));
    out.push(item);
  }
  return out;
}

// ───────────── Текст ─────────────

function parseText(text: string, fallback: ChannelId): Omit<ImportItem, "key" | "duplicate">[] {
  const out: Omit<ImportItem, "key" | "duplicate">[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•–—▪◦]|\d+[.)])\s*/u, "").trim();
    if (!line) continue;
    const starred = /★|⭐/u.test(line);
    const links = [...line.matchAll(LINK_RE)].map((m) => m[0]);
    const handles = [...line.matchAll(HANDLE_RE)].map((m) => m[1]);
    const found: Omit<ImportItem, "key" | "duplicate">[] = [];
    for (const l of links) {
      const it = fromLink(l, fallback);
      if (it) found.push(it);
    }
    if (!links.length) for (const h of handles) found.push(fromHandle(h, fallback));
    // Строка из одного ника без @: так часто выглядят списки чатов.
    if (!found.length) {
      const bare = line.replace(/★|⭐/gu, "").trim().match(/^([A-Za-z0-9_.]{4,40})(?:\s+[-–—|:]\s+(.*))?$/);
      if (bare) found.push({ ...fromHandle(bare[1], fallback) });
    }
    let note = line;
    for (const l of links) note = note.replace(l, "");
    for (const h of handles) note = note.replace(`@${h}`, "");
    note = note.replace(/★|⭐/gu, "").replace(/^[\s\-–—|:;,]+|[\s\-–—|:;,]+$/g, "").replace(/\s{2,}/g, " ");
    for (const it of found) {
      if (found.length === 1 && note && note.toLowerCase() !== it.title.replace(/^@/, "").toLowerCase()) it.note = note;
      it.starred = starred;
      out.push(it);
    }
  }
  return out;
}

function parseJSON(text: string, fallback: ChannelId): Omit<ImportItem, "key" | "duplicate">[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : null;
  if (!list || !list.every((x) => x && typeof x === "object" && !Array.isArray(x))) return null;
  const keys = [...new Set(list.flatMap((o) => Object.keys(o as object)))];
  const rows = [keys, ...list.map((o) => keys.map((k) => String((o as Record<string, unknown>)[k] ?? "")))];
  return parseTable(rows, fallback);
}

/** Разбирает текст любого формата и помечает то, что уже есть в базе или повторяется в файле. */
export function parseImport(text: string, fallback: ChannelId, db: DB): ImportItem[] {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return [];
  let items: Omit<ImportItem, "key" | "duplicate">[] | null = null;

  if (/^[[{]/.test(trimmed)) items = parseJSON(trimmed, fallback);
  if (!items) {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    const delim = lines.length > 1 ? detectDelimiter(lines) : null;
    if (delim) items = parseTable(splitCSV(trimmed, delim), fallback);
  }
  // Для JSON-выгрузок чатов и любого текста: ищем ссылки и ники построчно.
  if (!items) items = parseText(/^[[{]/.test(trimmed) ? trimmed.replace(/\\\//g, "/").replace(/[{}[\]"]/g, "\n") : trimmed, fallback);

  const existing = new Set(Object.values(db.targets).map((t) => targetKey(t.url, t.title)));
  const seen = new Set<string>();
  return items.map((it) => {
    const key = targetKey(it.url ?? "", it.title);
    const duplicate = existing.has(key) || seen.has(key);
    seen.add(key);
    return { ...it, key, duplicate };
  });
}
