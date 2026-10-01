"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export default function ProductsDropdown({ onNavigate }: { onNavigate: () => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const triggerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  return (
    <details
      className="products-menu"
      ref={detailsRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          event.currentTarget.open = false;
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          triggerRef.current?.focus();
        }
      }}
    >
      <summary ref={triggerRef}>
        Products
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </summary>
      <div className="products-dropdown">
        <Link
          href="/#home"
          onClick={() => {
            if (detailsRef.current) detailsRef.current.open = false;
            onNavigate();
          }}
        >
          <strong>openWorkBot</strong>
          <span>Your AI team, in one chat.</span>
        </Link>
      </div>
    </details>
  );
}
