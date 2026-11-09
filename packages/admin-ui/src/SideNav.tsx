"use client";
import { useEffect, useState, type ReactNode } from "react";

export interface SideNavLabels {
  /** Naam van het menu voor schermlezers. */
  nav: string;
  menu: string;
  close: string;
}
const LABELS: SideNavLabels = { nav: "Beheer", menu: "Menu", close: "Sluiten" };

/**
 * Zijmenu. Op een breed scherm altijd zichtbaar; op een telefoon een balk met het merk en een knop Menu die de
 * lijst opent. Gaat weer dicht als `currentPath` verandert (een pagina gekozen) of met Escape. De site geeft het
 * pad door (bijvoorbeeld uit `usePathname()`), zodat dit pakket geen router nodig heeft.
 */
export function SideNav({ brand, currentPath, footer, labels, children }: {
  brand: ReactNode;
  currentPath: string;
  /** Onderaan, bijvoorbeeld wie er ingelogd is en Uitloggen. */
  footer?: ReactNode;
  labels?: Partial<SideNavLabels>;
  children: ReactNode;
}) {
  const l = { ...LABELS, ...labels };
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [currentPath]);
  useEffect(() => {
    if (!open) return;
    // Open menu op een telefoon: de pagina erachter schuift niet mee (zie admin.css, html[data-nav-open]).
    document.documentElement.dataset.navOpen = "";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); delete document.documentElement.dataset.navOpen; };
  }, [open]);
  return (
    <nav className="ui-side" aria-label={l.nav} data-open={open || undefined}>
      <div className="ui-side-top">
        <div className="ui-side-brand">{brand}</div>
        <button type="button" className="ui-side-toggle" aria-expanded={open} aria-controls="ui-side-items" onClick={() => setOpen((o) => !o)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
          {open ? l.close : l.menu}
        </button>
      </div>
      <div className="ui-side-items" id="ui-side-items">
        {children}
        {footer && <div className="ui-side-footer">{footer}</div>}
      </div>
    </nav>
  );
}
