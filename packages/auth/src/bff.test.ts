import { afterEach, describe, expect, it } from "vitest";
import { createBff, safeReturnTo, type BffOptions } from "./bff.js";
import { createTokenVerifier } from "./verify.js";
import { startMockOidc } from "./testing.js";

const SITE = "http://site.test";
let mocks: { close(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(mocks.map((m) => m.close())); mocks = []; });

async function setup(over: Partial<BffOptions> = {}, ttl = 300, org = "org-site") {
  const mock = await startMockOidc({ clientId: "web", clientSecret: "geheim", audience: "project-1", user: { sub: "u-1", name: "Sam", email: "sam@example.test", organizationId: org }, accessTokenTtl: ttl });
  mocks.push(mock);
  const bff = createBff({
    issuer: mock.issuer, clientId: "web", clientSecret: "geheim", redirectUri: `${SITE}/auth/callback`, postLogoutRedirectUri: `${SITE}/`,
    projectId: "project-1", sessionSecret: "s".repeat(40), insecureDevelopment: true, ...over,
  });
  return { mock, bff };
}

/** Speelt de browser: login → Zitadel → callback, en geeft de sessiecookie terug. */
async function signIn(bff: ReturnType<typeof createBff>, returnTo = "/nl-nl/account") {
  const start = await bff.login(new Request(`${SITE}/auth/login?returnTo=${encodeURIComponent(returnTo)}`));
  const tx = start.headers.get("set-cookie")!.split(";")[0]!;
  const authorize = await fetch(start.headers.get("location")!, { redirect: "manual" });
  const done = await bff.callback(new Request(authorize.headers.get("location")!, { headers: { cookie: tx } }));
  const cookie = done.headers.getSetCookie().find((c) => c.startsWith("session="))?.split(";")[0] ?? "";
  return { start, authorize, done, cookie };
}

describe("inloggen via de BFF", () => {
  it("doorloopt de flow met PKCE en zet alleen een versleutelde HttpOnly-cookie", async () => {
    const { bff } = await setup();
    const { start, authorize, done, cookie } = await signIn(bff);
    const auth = new URL(start.headers.get("location")!);
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.headers.get("x-scope")).toContain("urn:zitadel:iam:org:project:id:project-1:aud");
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toBe("/nl-nl/account");
    expect(done.headers.getSetCookie().find((c) => c.startsWith("session="))).toMatch(/HttpOnly; SameSite=Lax/);
    expect(cookie).not.toContain("sam@example.test");
    const { session } = await bff.session(cookie);
    expect(session).toMatchObject({ subject: "u-1", name: "Sam", organizationId: "org-site" });
  });

  it("geeft een access token dat de API accepteert", async () => {
    const { mock, bff } = await setup();
    const { session } = await bff.session((await signIn(bff)).cookie);
    const verify = createTokenVerifier({ issuer: mock.issuer, audience: "project-1" });
    await expect(verify(session!.accessToken)).resolves.toMatchObject({ subject: "u-1", organizationId: "org-site" });
  });

  it("ververst het access token als het bijna verloopt, en logt uit als dat niet meer mag", async () => {
    const { mock, bff } = await setup({}, 30);
    const { cookie } = await signIn(bff);
    const refreshed = await bff.session(cookie);
    expect(refreshed.session?.subject).toBe("u-1");
    expect(refreshed.setCookie).toMatch(/^session=/);
    expect(mock.state.refreshes).toBe(1);
    mock.state.revoked = true;
    const gone = await bff.session(refreshed.setCookie!.split(";")[0]);
    expect(gone.session).toBeNull();
    expect(gone.setCookie).toMatch(/Max-Age=0/);
  });

  it("weigert een gebruiker van een andere organisatie", async () => {
    const { bff } = await setup({ organizationId: "org-beheer" });
    const { done } = await signIn(bff);
    expect(done.status).toBe(403);
    expect(done.headers.getSetCookie().some((c) => c.startsWith("session=") && !c.includes("Max-Age=0"))).toBe(false);
  });

  it("weigert een callback zonder geldige transactie of met een vervalste cookie", async () => {
    const { bff } = await setup();
    expect((await bff.callback(new Request(`${SITE}/auth/callback?code=x&state=y`))).status).toBe(400);
    const { cookie } = await signIn(bff);
    expect((await bff.session(cookie.slice(0, -4) + "AAAA")).session).toBeNull();
  });

  it("logt ook bij Zitadel uit", async () => {
    const { mock, bff } = await setup();
    const { cookie } = await signIn(bff);
    const out = await bff.logout(new Request(`${SITE}/auth/logout`, { headers: { cookie } }));
    expect(out.headers.get("location")).toContain(`${mock.issuer}/oidc/v1/end_session`);
    expect(out.headers.get("location")).toContain("id_token_hint=");
    expect(out.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
  });
});

describe("safeReturnTo", () => {
  it("staat alleen interne paden toe", () => {
    expect(safeReturnTo("/nl-nl")).toBe("/nl-nl");
    expect(safeReturnTo("//evil.test")).toBe("/");
    expect(safeReturnTo("https://evil.test")).toBe("/");
    expect(safeReturnTo("/\\evil.test")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
  });
});

describe("nep-Zitadel", () => {
  it("geeft userinfo voor uitgegeven tokens en tokens voor andere gebruikers", async () => {
    const op = await startMockOidc({ clientId: "c", audience: "p", user: { sub: "u1", name: "Een" } });
    try {
      const other = await op.accessToken(60, { sub: "u2", name: "Twee", organizationId: "org-2" });
      const info = await fetch(`${op.issuer}/oidc/v1/userinfo`, { headers: { authorization: `Bearer ${other}` } });
      expect(await info.json()).toMatchObject({ sub: "u2", name: "Twee" });
      expect((await fetch(`${op.issuer}/oidc/v1/userinfo`, { headers: { authorization: "Bearer nep" } })).status).toBe(401);
    } finally { await op.close(); }
  });
});

describe("fetchUserInfo", () => {
  it("haalt het profiel op en geeft null bij een ongeldig token", async () => {
    const { fetchUserInfo } = await import("./verify.js");
    const op = await startMockOidc({ clientId: "c", user: { sub: "u9", name: "Negen", email: "n@example.test", locale: "nl" } });
    try {
      expect(await fetchUserInfo(op.issuer, await op.accessToken())).toEqual({ sub: "u9", name: "Negen", email: "n@example.test", locale: "nl" });
      expect(await fetchUserInfo(op.issuer, "nep")).toBeNull();
    } finally { await op.close(); }
  });
});
