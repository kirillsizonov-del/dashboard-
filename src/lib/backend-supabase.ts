import type { Backend } from "./backend";
import type { Kind, Row } from "./types";

interface ItemRow {
  kind: Kind;
  id: string;
  data: unknown;
  deleted: boolean;
}

const toRow = (r: ItemRow): Row => ({ kind: r.kind, id: r.id, data: r.deleted ? null : r.data });

/**
 * Общее хранилище в Supabase: одна таблица items (см. supabase/schema.sql).
 * Включается переменными NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export async function supabaseBackend(url: string, anonKey: string, workspace: string): Promise<Backend> {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, anonKey);

  return {
    kind: "supabase",
    async load() {
      const rows: Row[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await sb
          .from("items")
          .select("kind,id,data,deleted")
          .eq("workspace", workspace)
          .order("kind")
          .order("id")
          .range(from, from + page - 1);
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as ItemRow[]) if (!r.deleted) rows.push(toRow(r));
        if (!data || data.length < page) break;
      }
      return rows;
    },
    async save(rows) {
      if (!rows.length) return;
      const now = new Date().toISOString();
      const payload = rows.map((r) => ({
        workspace,
        kind: r.kind,
        id: r.id,
        data: r.data ?? {},
        deleted: r.data === null,
        updated_at: now,
      }));
      const { error } = await sb.from("items").upsert(payload, { onConflict: "workspace,kind,id" });
      if (error) throw new Error(error.message);
    },
    subscribe(onRows) {
      const channel = sb
        .channel(`items:${workspace}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "items", filter: `workspace=eq.${workspace}` },
          (payload) => {
            const r = payload.new as ItemRow | undefined;
            if (r && r.kind && r.id) onRows([toRow(r)]);
          },
        )
        .subscribe();
      return () => {
        sb.removeChannel(channel);
      };
    },
  };
}
