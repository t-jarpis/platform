import type { ComponentType, ReactNode } from "react";

/** Is `href` de huidige sectie? `/` alleen op `/` zelf; anders ook op subpagina's. */
export function isActive(href: string, currentPath: string): boolean {
  const path = currentPath.split(/[?#]/)[0] || "/";
  if (href === "/") return path === "/";
  const base = href.replace(/\/$/, "");
  return path === base || path.startsWith(`${base}/`);
}

/** Wat een eigen linkcomponent (bijvoorbeeld `next/link`) krijgt. */
export interface LinkProps { href: string; className?: string; "aria-current"?: "page"; children: ReactNode }

/**
 * Link in het zijmenu, met `aria-current="page"` voor de huidige sectie. Geef `link` mee om de router van de
 * site te gebruiken (bijvoorbeeld `next/link`); standaard een gewone `<a>`.
 */
export function NavLink({ href, currentPath, icon, link: Link, children }: {
  href: string;
  currentPath: string;
  icon?: ReactNode;
  link?: ComponentType<LinkProps>;
  children: ReactNode;
}) {
  const props = { href, className: "ui-navlink", ...(isActive(href, currentPath) ? { "aria-current": "page" as const } : {}) };
  const content = <>{icon && <span className="ui-navlink-icon" aria-hidden="true">{icon}</span>}<span>{children}</span></>;
  return Link ? <Link {...props}>{content}</Link> : <a {...props}>{content}</a>;
}
