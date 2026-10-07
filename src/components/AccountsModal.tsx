"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { accountsOf, cleanHandle } from "@/lib/meta";
import { setChannelAccounts, useApp } from "@/lib/store";
import type { ChannelAccount, ChannelId } from "@/lib/types";
import { Avatar, Button, IconButton, Modal, cx, fieldClass } from "./ui";

type Draft = ChannelAccount & { key: string; from?: string };

const small = "py-2 text-[14px]";

/** Справочник аккаунтов канала: ник, кто ведёт, подпись. Сохраняется одной кнопкой. */
export function AccountsModal({ id, onClose }: { id: ChannelId; onClose: () => void }) {
  const { db } = useApp();
  const members = Object.values(db.members);
  const next = useRef(0);
  const [rows, setRows] = useState<Draft[]>(() => {
    const list = accountsOf(db.channels[id]).map((a) => ({ ...a, key: a.handle, from: a.handle }));
    return list.length ? list : [{ handle: "", memberId: "", label: "", key: "new-0" }];
  });

  const patch = (key: string, p: Partial<ChannelAccount>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = () => setRows((rs) => [...rs, { handle: "", memberId: "", label: "", key: `new-${++next.current}` }]);
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const handles = rows.map((r) => cleanHandle(r.handle)).filter(Boolean);
  const dupe = handles.find((h, i) => handles.indexOf(h) !== i);

  const save = () => {
    if (dupe) return;
    // Переименованный ник: закреплённые за ним цели переезжают на новый
    const renames: Record<string, string> = {};
    for (const r of rows) {
      const h = cleanHandle(r.handle);
      if (r.from && h && h !== r.from) renames[r.from] = h;
    }
    setChannelAccounts(id, rows, renames);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Аккаунты канала" wide>
      <p className="-mt-2 mb-4 text-[13.5px] text-muted">
        С каких аккаунтов пишем. Если их два и больше, список делится на столбцы, а на обзоре каждый видит свой счёт.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-line bg-white/[0.03] p-2.5 sm:grid-cols-[minmax(0,0.9fr)_150px_minmax(0,1.3fr)_auto]"
          >
            {/* На телефоне: ник и корзина сверху, ниже владелец и подпись, каждый на всю ширину, чтобы подпись не обрезалась */}
            <input
              value={r.handle}
              onChange={(e) => patch(r.key, { handle: e.target.value })}
              placeholder="@ник"
              aria-label="Ник"
              data-autofocus={r.key === rows[0].key ? true : undefined}
              className={cx(fieldClass, small, dupe && cleanHandle(r.handle) === dupe && "border-crit/60")}
            />
            <label className="relative col-span-2 flex items-center sm:col-span-1">
              <span className="pointer-events-none absolute left-2.5">
                <Avatar member={db.members[r.memberId]} size={20} />
              </span>
              <select
                value={db.members[r.memberId] ? r.memberId : ""}
                onChange={(e) => patch(r.key, { memberId: e.target.value })}
                aria-label="Кто ведёт"
                className="h-[42px] w-full rounded-xl border border-line bg-field pl-9 pr-2 text-[14px] text-ink-2 outline-none transition-colors hover:border-line-2 focus:border-accent/60"
              >
                <option value="">кто ведёт?</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              value={r.label}
              onChange={(e) => patch(r.key, { label: e.target.value })}
              placeholder="Подпись: имя · роль"
              aria-label="Подпись"
              className={cx(fieldClass, small, "col-span-2 sm:col-span-1")}
            />
            <IconButton label="Убрать аккаунт" onClick={() => remove(r.key)} className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto">
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      <Button variant="ghost" className="mt-2 h-9 px-3 text-[13.5px]" onClick={add}>
        <Plus size={15} />
        Аккаунт
      </Button>

      {/* Подсказка своей строкой на телефоне, кнопки всегда справа, как в других окнах */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className={cx("w-full text-[12.5px] sm:w-auto", dupe ? "text-crit" : "text-muted")}>
          {dupe ? `Ник ${dupe} указан дважды` : "Переименовали ник: его записи переедут следом"}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="primary" onClick={save} disabled={!!dupe}>
            <Save size={15} />
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
