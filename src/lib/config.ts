/**
 * Своя база Quadcode задаётся через env (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
 * Без env дашборд работает локально, в localStorage браузера: чужую базу исходного репо не трогаем.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "off";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const WORKSPACE = process.env.NEXT_PUBLIC_WORKSPACE || "quadcode";
export const SUPABASE_ENABLED = SUPABASE_URL !== "off" && SUPABASE_KEY !== "";
