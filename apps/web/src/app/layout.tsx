import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "DataOps Reliability Cloud",
    template: "%s · DataOps Reliability Cloud",
  },
  description: "A clear operating view for data reliability, incident response, and downstream impact.",
  applicationName: "DataOps Reliability Cloud",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#080b11" },
  ],
};

const themeBootstrap = `(function(){try{var pref=localStorage.getItem("dataops_theme")||"system";var dark=pref==="dark"||(pref==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var el=document.documentElement;el.dataset.theme=dark?"dark":"light";el.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${inter.variable} ${jetbrains.variable}`}>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
