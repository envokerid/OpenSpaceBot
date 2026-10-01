import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteShell from "./site-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "openWorkOS — Meet openWorkBot",
  description:
    "Meet openWorkBot, the first product from openWorkOS. Bring your AI agents together in one chat to plan, build, and get work done. You stay in control.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><SiteShell>{children}</SiteShell></body>
    </html>
  );
}
