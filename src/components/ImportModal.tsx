"use client";

import { FileUp, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { ImportItem } from "@/lib/importer";
import { parseImport } from "@/lib/importer";
import { CHANNELS, plural } from "@/lib/meta";
import { importTargets, useApp } from "@/lib/store";
import { CHANNEL_IDS } from "@/lib/types";
import type { ChannelId } from "@/lib/types";
import { Button, Modal, Pills, cx, fieldClass } from "./ui";

const ACCEPT = ".csv,.tsv,.txt,.md,.json,text/csv,text/plain,application/json";
const MAX_FILE = 5_000_000;

/**
 * Импорт базы чатов и аккаунтов. Файл или вставленный текст разбирается сам:
 * канал определяется по ссылке, дубли с уже добавленными отсекаются.
 */
export function ImportModal({ open, onClose, fallback }: { open: boolean; onClose: () => void; fallback: ChannelId }) {
  const { db } = useApp();
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [channel, setChannel] = useState<ChannelId>(fallback);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const items = useMemo(() => parseImport(text, channel, db), [text, channel, db]);
  const fresh = items.filter((i) => !i.duplicate);
  const dupes = items.length - fresh.length;
  const byChannel = CHANNEL_IDS.map((id) => ({ id, n: fresh.filter((i) => i.channelId === id).length })).filter((x) => x.n);

  const close = () => {
    setText("");
    setSource("");
    setError(null);
    onClose();
  };

  const load = async (f: File) => {
    setError(null);
    if (/\.xlsx?$/i.test(f.name)) {
      setError("Excel напрямую не читается. Сохраните таблицу как CSV: Файл, Скачать, CSV.");
      return;
    }
    if (f.size > MAX_FILE) {
      setError("Файл больше 5 МБ. Разбейте его на части.");
      return;
    }
    setText(await f.text());
    setSource(f.name);
  };

  return (
    <Modal open={open} onClose={close} title="Импорт базы" wide>
      <p className="mb-4 text-[13.5px] leading-relaxed text-muted">
        Перетащите файл или вставьте текст. Подходят CSV из Google Таблиц и Excel, TXT, JSON и выгрузки чатов. Канал определяется по
        ссылке сам, повторы и уже добавленные пропускаются.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) load(f);
        }}
        className={cx(
          "rounded-2xl border border-dashed p-1 transition-colors duration-200",
          drag ? "border-accent bg-accent/[0.06]" : "border-white/15",
        )}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSource("");
          }}
          data-autofocus=""
          rows={6}
          placeholder={"https://x.com/account/status/…\nt.me/chat_name - рабочая группа\nhttps://youtube.com/@channel"}
          className={cx(fieldClass, "resize-y border-transparent bg-transparent font-mono text-[13px] hover:border-transparent")}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
          <span className="text-[12.5px] text-muted">{source ? `Файл: ${source}` : "Можно перетащить файл сюда"}</span>
          <Button onClick={() => file.current?.click()}>
            <FileUp size={15} />
            Выбрать файл
          </Button>
        </div>
        <input
          ref={file}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) load(f);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13.5px] text-crit">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="eyebrow">Без ссылки: в канал</span>
        <Pills
          label="Канал по умолчанию"
          value={channel}
          onChange={setChannel}
          options={CHANNEL_IDS.map((id) => ({
            value: id,
            label: (
              <>
                <span className="size-2 rounded-[3px]" style={{ background: CHANNELS[id].color }} />
                {CHANNELS[id].name}
              </>
            ),
          }))}
        />
      </div>

      {items.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-white/[0.02] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
            {byChannel.map(({ id, n }) => (
              <span key={id} className="inline-flex items-center gap-1.5 text-ink-2">
                <span className="size-2 rounded-[3px]" style={{ background: CHANNELS[id].color }} />
                {CHANNELS[id].name}: <b className="font-semibold text-ink">{n}</b>
              </span>
            ))}
            {dupes > 0 && <span className="text-muted">пропущено повторов: {dupes}</span>}
          </div>
          <ul className="max-h-[28vh] space-y-0.5 overflow-y-auto pr-1 text-[13px]">
            {items.slice(0, 200).map((i: ImportItem, n) => (
              <li key={`${i.key}-${n}`} className={cx("flex gap-2 rounded-lg px-1.5 py-1", i.duplicate && "opacity-45")}>
                <span className="size-2 shrink-0 translate-y-1.5 rounded-[3px]" style={{ background: CHANNELS[i.channelId].color }} />
                <span className={cx("shrink-0", i.duplicate ? "text-muted line-through" : "text-ink")}>
                  {i.starred && "★ "}
                  {i.title}
                </span>
                {i.note && <span className="truncate text-muted">{i.note}</span>}
              </li>
            ))}
          </ul>
          {items.length > 200 && <p className="mt-1 px-1.5 text-[12.5px] text-muted">и ещё {items.length - 200}</p>}
        </div>
      )}

      {text.trim() && items.length === 0 && (
        <p className="mt-3 text-[13.5px] text-muted">Не нашёл ни ссылок, ни ников. Проверьте, что в тексте есть t.me/…, @ник или ссылка.</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>
          Отмена
        </Button>
        <Button
          variant="primary"
          disabled={!fresh.length}
          onClick={() => {
            importTargets(fresh, source);
            close();
          }}
        >
          <Upload size={15} />
          {fresh.length ? `Импортировать ${fresh.length} ${plural(fresh.length, ["запись", "записи", "записей"])}` : "Импортировать"}
        </Button>
      </div>
    </Modal>
  );
}
