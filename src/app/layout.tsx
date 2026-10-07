import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Jost, League_Spartan } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { THEME_BOOT } from "@/lib/theme";
import "./globals.css";

/** Шрифт бренда по гайдбуку Quadcode. В нём нет кириллицы */
// Без авто-фолбэка Arial: иначе русские буквы рисуются им, а не Jost
const spartan = League_Spartan({
  variable: "--font-spartan",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  adjustFontFallback: false,
  fallback: [],
});
/** Кириллица: геометрический гротеск той же футуристичной школы, браузер берёт его только для русских букв */
const jost = Jost({ variable: "--font-jost", subsets: ["cyrillic"], weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin", "cyrillic"] });
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500"],
  style: ["italic"],
});
export const metadata: Metadata = {
  title: "Quadcode AI · Content",
  description: "Контент-дашборд Quadcode AI: план постов, задачи, каналы и аналитика",
  icons: { icon: "/brand/qcai.png", apple: "/brand/qcai.png" },
};

export const viewport: Viewport = { themeColor: "#08080B" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${spartan.variable} ${jost.variable} ${jetbrains.variable} ${cormorant.variable} h-full`}
      // Тему ставит скрипт ниже до гидратации, поэтому data-theme на сервере и в браузере может отличаться
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full">
        <div className="ambient" aria-hidden />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
