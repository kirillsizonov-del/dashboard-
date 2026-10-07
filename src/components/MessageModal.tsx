"use client";

import { Check, Copy, ExternalLink, Send } from "lucide-react";
import { useState } from "react";
import { accountsOf } from "@/lib/meta";
import { setVia, touchTarget, updateTarget, useApp } from "@/lib/store";
import type { ChannelId } from "@/lib/types";
import { Button, Modal, cx, fieldClass } from "./ui";

// Подсказка к первому сообщению и кнопка ссылки: у каждой площадки свои правила и свой объект
const FIRST_HINT: Partial<Record<ChannelId, string>> = {
  x: "Без ссылки в теле поста: ссылка и оффер только в реплае",
  reddit: "Сначала правила саба. Без ссылок в первом посте, саморекламу режут",
  discord: "Пиши в канал для шоукейсов, не в general. Без инвайтов и ссылок",
};
const OPEN_LABEL: Partial<Record<ChannelId, string>> = {
  x: "Открыть в X",
  discord: "Открыть сервер",
  reddit: "Открыть сабреддит",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
      disabled={!text.trim()}
    >
      {done ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
      {done ? "Скопировано" : label}
    </Button>
  );
}

/** Тексты для конкретной цели: копировать, открыть чат или профиль, отметить отправку. */
export function MessageModal({ targetId, onClose }: { targetId: string | null; onClose: () => void }) {
  const { db } = useApp();
  const t = targetId ? db.targets[targetId] : undefined;
  if (!t) return null;
  const sent = t.touches > 0;
  const accounts = accountsOf(db.channels[t.channelId]).map((a) => a.handle);

  const field = (key: "message" | "followUp", label: string, hint: string, rows: number) => (
    <section>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">{label}</div>
          <div className="mt-1 text-[12.5px] text-muted">{hint}</div>
        </div>
        <CopyButton text={t[key] ?? ""} label="Копировать" />
      </div>
      <textarea
        key={`${t.id}:${key}`}
        defaultValue={t[key] ?? ""}
        rows={rows}
        placeholder="Текст пока не написан"
        onBlur={(e) => {
          if (e.target.value !== (t[key] ?? "")) updateTarget(t.id, { [key]: e.target.value });
        }}
        className={cx(fieldClass, "resize-y text-[14.5px] leading-relaxed")}
      />
    </section>
  );

  return (
    <Modal open onClose={onClose} title={t.title} wide>
      {t.note && <p className="-mt-2 mb-4 text-[13.5px] text-muted">{t.note}</p>}
      {accounts.length >= 2 && (
        <label className="mb-4 flex flex-wrap items-center gap-2 text-[13.5px] text-ink-2">
          <span className="eyebrow">Пишем с аккаунта</span>
          <select
            value={t.via ?? ""}
            onChange={(e) => setVia(t.id, e.target.value)}
            className="h-9 rounded-[10px] border border-white/12 bg-field px-2.5 text-[14px] outline-none focus:border-accent/60"
          >
            <option value="">не выбран</option>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="space-y-5">
        {field("message", "Первое сообщение", FIRST_HINT[t.channelId] ?? "Без ссылок и цены", 6)}
        {field("followUp", "Когда ответил", "Кейсы со ссылками, уходят вторым сообщением", 12)}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        {t.url ? (
          <a
            href={t.url}
            target="_blank"
            rel="noreferrer"
            className="press inline-flex h-10 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 text-[14px] font-medium hover:border-white/25 hover:bg-white/[0.08]"
          >
            <ExternalLink size={15} />
            {OPEN_LABEL[t.channelId] ?? "Открыть профиль"}
          </a>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          disabled={sent}
          onClick={() => {
            touchTarget(t.id);
            onClose();
          }}
        >
          <Send size={15} />
          {sent ? `Уже отправлено ×${t.touches}` : "Отправил, отметить"}
        </Button>
      </div>
    </Modal>
  );
}
