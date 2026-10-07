/**
 * Тема оформления. У каждого участника своя, хранится в браузере.
 * «Авто»: ночная с 20:00 до 08:00 по Тбилиси, переключается без перезагрузки.
 */

export type ThemeMode = "default" | "night" | "auto";
export type Theme = "default" | "night";

export const THEME_KEY = "qcai.theme";
export const THEME_TZ = "Asia/Tbilisi";
export const NIGHT_FROM = 20;
export const NIGHT_TO = 8;

/** Цвет полосы браузера на телефоне под каждую тему */
export const THEME_COLOR: Record<Theme, string> = { default: "#121217", night: "#0a0807" };

export function isMode(v: unknown): v is ThemeMode {
  return v === "default" || v === "night" || v === "auto";
}

/** Час по Тбилиси, пояс браузера не важен */
export function hourIn(ts: number, tz = THEME_TZ): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(ts);
  return Number(h) % 24;
}

export function isNight(ts: number): boolean {
  const h = hourIn(ts);
  return h >= NIGHT_FROM || h < NIGHT_TO;
}

export function resolveTheme(mode: ThemeMode, ts: number): Theme {
  if (mode === "auto") return isNight(ts) ? "night" : "default";
  return mode;
}

/** Ставит тему на <html>. fade: плавный переход цветов 200 мс */
export function applyTheme(theme: Theme, fade = false): void {
  const root = document.documentElement;
  if ((root.dataset.theme ?? "default") === theme) return;
  if (fade) {
    root.classList.add("theme-fade");
    window.setTimeout(() => root.classList.remove("theme-fade"), 260);
  }
  if (theme === "night") root.dataset.theme = "night";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

/**
 * Скрипт до первой отрисовки: тема ставится раньше, чем появится страница, без вспышки светлой темы.
 * Держим его коротким и без зависимостей.
 */
export const THEME_BOOT = `(function(){try{var m=localStorage.getItem("${THEME_KEY}");var n=m==="night";if(m==="auto"){var h=Number(new Intl.DateTimeFormat("en-US",{timeZone:"${THEME_TZ}",hour:"numeric",hourCycle:"h23"}).format(Date.now()))%24;n=h>=${NIGHT_FROM}||h<${NIGHT_TO};}if(n)document.documentElement.dataset.theme="night";}catch(e){}})();`;
