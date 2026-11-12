import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import { THEME_STORAGE_KEY } from "@/components/theme-storage";
import "./globals.css";

/** next/font's size-adjusted local fallback keeps the swap from shifting layout. */
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Yitra",
  description: "לוח בקרה פיננסי אישי",
};

/**
 * Runs synchronously in <head> before first paint: stamp data-theme on <html>
 * from the stored preference, falling back to the OS `prefers-color-scheme`.
 * Doing this in a mount effect instead would paint light first and flash on a
 * dark load, and diverge from SSR markup (hydration mismatch) — #109 line-item
 * 4.
 */
const themeScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${rubik.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
