"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Arrow, BrandMark } from "./icons";
import ProductsDropdown from "./products-dropdown";

const dialogCopy: Record<string, { title: string; description: string }> = {
  "Pricing": { title: "Find your way to work.", description: "Pricing for openWorkBot, the first product from openWorkOS, will be shared here soon." },
  "Blog": { title: "Notes on a new way to work.", description: "Product updates, practical guides, and ideas for working with AI teams. Coming soon from openWorkOS." },
  "Log in": { title: "Welcome back to openWorkOS.", description: "Account sign-in isn't available in this preview. We're building a place for you and your AI team to get to work." },
  "Sign up": { title: "Meet openWorkBot.", description: "The first product from openWorkOS brings your AI agents together in one chat. Give your team a goal, follow their progress, and stay in control. Account registration isn't available in this preview." },
};

const DialogContext = createContext<((name: string) => void) | null>(null);

export function ProductButton() {
  const showDialog = useContext(DialogContext);
  return (
    <button className="button button-dark button-primary" type="button" onClick={() => showDialog?.("Sign up")}>
      Meet openWorkBot
    </button>
  );
}

export default function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState(dialogCopy["Sign up"]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function showDialog(name: string) {
    setDialogContent(dialogCopy[name]);
    setMenuOpen(false);
    dialogRef.current?.showModal();
  }

  return (
    <DialogContext.Provider value={showDialog}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="openWorkOS home" onClick={() => setMenuOpen(false)}><span>openWorkOS</span></Link>
        <nav className={`navigation ${menuOpen ? "is-open" : ""}`} id="main-navigation" aria-label="Main navigation">
          <ProductsDropdown onNavigate={() => setMenuOpen(false)} />
          <Link href="/solutions" aria-current={pathname === "/solutions" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Solutions</Link>
          {["Pricing", "Blog"].map((item) => <button key={item} type="button" onClick={() => showDialog(item)}>{item}</button>)}
        </nav>
        <div className="header-actions"><button className="button button-light" type="button" onClick={() => showDialog("Log in")}>Log in</button><button className="button button-dark button-small" type="button" onClick={() => showDialog("Sign up")}>Sign up</button></div>
        <button className="menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}><span /><span /></button>
      </header>

      {children}
      <dialog ref={dialogRef} className="info-dialog" aria-labelledby="dialog-title" onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}><button className="dialog-close" type="button" aria-label="Close dialog" onClick={() => dialogRef.current?.close()}>×</button><BrandMark /><h2 id="dialog-title">{dialogContent.title}</h2><p>{dialogContent.description}</p><button className="button button-dark" type="button" onClick={() => dialogRef.current?.close()}>Back to openWorkOS <Arrow /></button></dialog>
    </DialogContext.Provider>
  );
}
