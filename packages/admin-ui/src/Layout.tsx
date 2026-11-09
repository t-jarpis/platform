import type { ReactNode } from "react";

/** Basis van een admin panel: zijmenu links (op een telefoon een balk bovenaan) en de inhoud ernaast. */
export function AdminShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="ui-shell">
      {nav}
      <main className="ui-main" id="main">{children}</main>
    </div>
  );
}

/** Kop van een pagina met uitleg en ruimte voor knoppen of tabbladen. */
export function PageHeader({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ui-page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p className="ui-muted">{lead}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}

/** Paneel met een optionele kop. Brede tabellen schuiven binnen het paneel, niet de hele pagina. */
export function Panel({ title, lead, actions, children }: { title?: ReactNode; lead?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="ui-panel">
      {(title || actions) && (
        <div className="ui-panel-head">
          <div>{title && <h2>{title}</h2>}{lead && <p className="ui-muted">{lead}</p>}</div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Rij kerncijfers (StatCard) die meeschuift met de breedte. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="ui-stats">{children}</div>;
}

/** Panelen naast elkaar op brede schermen, onder elkaar op een telefoon. */
export function PanelGrid({ children }: { children: ReactNode }) {
  return <div className="ui-panel-grid">{children}</div>;
}
