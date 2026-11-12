import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ActivityHeatmap, AdminShell, BarList, NavLink, PageHeader, Panel, SideNav, StatCard, TimeChart, isActive, type LinkProps } from "./index.js";

const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("TimeChart", () => {
  it("tekent lijnen met legenda, themakleuren en een tabel", () => {
    const out = html(<TimeChart title="Bezoekers" bucket="day" dates={["2026-11-02", "2026-11-03"]}
      series={[{ key: "v", label: "Bezoekers", values: [3, 1] }, { key: "p", label: "Weergaven", values: [4, null], color: "var(--chart-3)" }]} />);
    expect(out).toContain("<h3");
    expect(out).toContain("ui-legend");
    expect(out).toContain('stroke="var(--chart-1)"');
    expect(out).toContain('stroke="var(--chart-3)"');
    expect(out).toContain("Maandag 2 nov");
    expect(out).toContain("<td class=\"num\">–</td>");
    expect(out).toContain("Toon als tabel");
  });

  it("tekent staven en laat lege waarden weg", () => {
    const out = html(<TimeChart title="Per week" bucket="week" kind="bar" dates={["2026-10-26", "2026-11-02"]} series={[{ key: "a", label: "A", values: [0, 5] }]} tableLabel="Als tabel" />);
    expect(out.match(/class="ui-chart-bar"/g)).toHaveLength(1);
    expect(out).toContain("Week van 2 nov");
    expect(out).not.toContain("ui-legend");
    expect(out).toContain("Als tabel");
  });
});

describe("BarList", () => {
  it("toont hooguit tien regels met percentages", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ label: `item ${i}`, value: 12 - i }));
    const out = html(<BarList items={items} />);
    expect(out.match(/<li>/g)).toHaveLength(10);
    expect(out).toContain("Overig");
    expect(out).toContain("<small>15%</small>");
    expect(html(<BarList items={[]} empty="Leeg" />)).toContain("Leeg");
  });
});

describe("StatCard", () => {
  it("toont de richting in tekst en de kleur volgens upIsGood", () => {
    expect(html(<StatCard label="Bezoekers" value={120} before={100} period="vorige week" />)).toContain('data-dir="good"><b>▲ +20%</b><span> t.o.v. vorige week</span>');
    expect(html(<StatCard label="Fouten" value={120} before={100} upIsGood={false} />)).toContain('data-dir="bad"');
    expect(html(<StatCard label="Nieuw" value={5} before={0} />)).toContain("nieuw");
  });
  it("tekent een sparkline vanaf twee punten", () => {
    expect(html(<StatCard label="Bezoekers" value={10} trend={[2, 8]} />)).toContain('class="ui-stat-spark"');
    expect(html(<StatCard label="Bezoekers" value={10} trend={[2, 8]} />)).toContain('aria-label="Per periode: van 2 naar 8, hoogste 8"');
    expect(html(<StatCard label="Bezoekers" value={10} trend={[2]} />)).not.toContain("ui-stat-spark");
    expect(html(<StatCard label="Leeg" value={0} trend={[0, 0]} />)).toContain('d="M0.0 36.0 L100.0 36.0"');
    expect(html(<StatCard label="Zonder" value={12345} />)).toContain("12,3K");
  });
});

describe("ActivityHeatmap", () => {
  it("zet een intensiteit per cel en een label voor schermlezers", () => {
    const out = html(<ActivityHeatmap caption="Wanneer" grid={[{ weekday: 1, hour: 9, count: 4 }, { weekday: 7, hour: 23, count: 2 }]} />);
    expect(out).toContain("--heat:1.00");
    expect(out).toContain("--heat:0.50");
    expect(out).toContain("maandag 9:00–10:00: 4");
    expect(out.match(/data-zero/g)).toHaveLength(7 * 24 - 2);
    expect(html(<ActivityHeatmap caption="x" grid={[]} empty="Niets" />)).toContain("Niets");
  });
});

describe("navigatie", () => {
  it("bepaalt de actieve sectie", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/analytics")).toBe(false);
    expect(isActive("/analytics", "/analytics/sources?x=1")).toBe(true);
    expect(isActive("/analytics", "/analyticsx")).toBe(false);
  });

  it("rendert het menu met de huidige pagina en een eigen linkcomponent", () => {
    const RouterLink = ({ children, ...p }: LinkProps) => <a data-router="" {...p}>{children}</a>;
    const out = html(
      <AdminShell nav={
        <SideNav brand={<b>Beheer</b>} currentPath="/releases" footer={<span>ingelogd</span>}>
          <NavLink href="/" currentPath="/releases">Dashboard</NavLink>
          <NavLink href="/releases" currentPath="/releases" icon={<svg />} link={RouterLink}>Releases</NavLink>
        </SideNav>
      }>
        <PageHeader title="Releases" lead="Per omgeving" />
        <Panel title="Laatste"><p>inhoud</p></Panel>
      </AdminShell>,
    );
    expect(out).toContain('aria-label="Beheer"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('<a data-router="" href="/releases" class="ui-navlink" aria-current="page">');
    expect(out).toContain('<a href="/" class="ui-navlink"><span>Dashboard</span></a>');
    expect(out).toContain('<main class="ui-main" id="main">');
    expect(out).toContain("ui-side-footer");
  });
});
