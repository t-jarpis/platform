import * as oidc from "openid-client";
import { readCookie, seal, serializeCookie, sessionKey, unseal, type Session } from "./session.js";

/**
 * Inloggen via Zitadel volgens het BFF-patroon: de server doet de OIDC-flow (authorization code + PKCE),
 * houdt de tokens en geeft de browser alleen een versleutelde HttpOnly-cookie.
 */
export interface BffOptions {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  /** Volledige URL van de callback, bijvoorbeeld `https://www.example.com/auth/callback`. */
  redirectUri: string;
  /** Waarheen na uitloggen. */
  postLogoutRedirectUri: string;
  /** Project-ID in Zitadel: het access token krijgt dit als publiek (de API). */
  projectId?: string;
  /** Alleen gebruikers van deze organisatie mogen inloggen (een site of de beheerorganisatie). */
  organizationId?: string;
  extraScopes?: string[];
  /** Minstens 32 tekens; wisselen = iedereen uitgelogd. */
  sessionSecret: string;
  cookieName?: string;
  /** Hoe lang iemand ingelogd blijft zonder activiteit (de refresh token verlengt). Standaard 30 dagen. */
  sessionMaxAgeSeconds?: number;
  /** Alleen voor tests en lokaal: HTTP-uitgever toestaan en cookies zonder Secure. */
  insecureDevelopment?: boolean;
}

export type SessionResult = { session: Session | null; setCookie?: string };

const ORG_CLAIM = "urn:zitadel:iam:user:resourceowner:id";

/** Alleen interne paden als bestemming na inloggen: voorkomt open redirects. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export function createBff(options: BffOptions) {
  const key = sessionKey(options.sessionSecret);
  const secure = !options.insecureDevelopment;
  const name = options.cookieName ?? "session";
  const txName = `${name}_tx`;
  const maxAge = options.sessionMaxAgeSeconds ?? 30 * 86_400;
  let config: Promise<oidc.Configuration> | null = null;

  const configuration = () => (config ??= oidc.discovery(
    new URL(options.issuer), options.clientId, undefined,
    options.clientSecret ? oidc.ClientSecretBasic(options.clientSecret) : oidc.None(),
    options.insecureDevelopment ? { execute: [oidc.allowInsecureRequests] } : undefined,
  ).catch((e) => { config = null; throw e; }));

  const scopes = () => [
    "openid", "profile", "email", "offline_access",
    ...(options.projectId ? [`urn:zitadel:iam:org:project:id:${options.projectId}:aud`] : []),
    ...(options.organizationId ? [`urn:zitadel:iam:org:id:${options.organizationId}`] : []),
    ...(options.extraScopes ?? []),
  ].join(" ");

  const clear = (n: string) => serializeCookie({ name: n, value: "", maxAge: 0, secure });

  async function toSession(tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers, previous?: Session): Promise<Session> {
    const claims = tokens.claims();
    const sub = claims?.sub ?? previous?.subject;
    if (!sub) throw new Error("Geen gebruiker in het token");
    const org = claims?.[ORG_CLAIM];
    const session: Session = {
      subject: sub,
      idToken: tokens.id_token ?? previous?.idToken ?? "",
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expiresIn() ?? 300) * 1000,
    };
    const orgId = typeof org === "string" ? org : previous?.organizationId;
    if (orgId) session.organizationId = orgId;
    const nm = typeof claims?.name === "string" ? claims.name : previous?.name;
    if (nm) session.name = nm;
    const em = typeof claims?.email === "string" ? claims.email : previous?.email;
    if (em) session.email = em;
    const rt = tokens.refresh_token ?? previous?.refreshToken;
    if (rt) session.refreshToken = rt;
    return session;
  }

  return {
    /** Start het inloggen: redirect naar Zitadel. */
    async login(request: Request): Promise<Response> {
      const cfg = await configuration();
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
      const url = oidc.buildAuthorizationUrl(cfg, {
        redirect_uri: options.redirectUri, scope: scopes(), state,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256",
      });
      const tx = await seal({ state, verifier, returnTo }, key, 600);
      return new Response(null, { status: 302, headers: { location: url.href, "set-cookie": serializeCookie({ name: txName, value: tx, maxAge: 600, secure }), "cache-control": "no-store" } });
    },

    /** Verwerkt de terugkeer van Zitadel en zet de sessiecookie. */
    async callback(request: Request): Promise<Response> {
      const cfg = await configuration();
      const tx = await unseal<{ state: string; verifier: string; returnTo: string }>(readCookie(request.headers.get("cookie"), txName, secure) ?? "", key);
      if (!tx) return new Response("Inloggen is verlopen. Probeer het opnieuw.", { status: 400 });
      let session: Session;
      try {
        const callbackUrl = new URL(request.url);
        const current = new URL(options.redirectUri);
        current.search = callbackUrl.search;
        const tokens = await oidc.authorizationCodeGrant(cfg, current, { pkceCodeVerifier: tx.verifier, expectedState: tx.state, idTokenExpected: true });
        session = await toSession(tokens);
      } catch {
        return new Response("Inloggen is mislukt.", { status: 400 });
      }
      if (options.organizationId && session.organizationId !== options.organizationId) {
        return new Response("Dit account heeft hier geen toegang.", { status: 403 });
      }
      const headers = new Headers({ location: tx.returnTo, "cache-control": "no-store" });
      headers.append("set-cookie", serializeCookie({ name, value: await seal(session, key, maxAge), maxAge, secure }));
      headers.append("set-cookie", clear(txName));
      return new Response(null, { status: 302, headers });
    },

    /** Leest de sessie en ververst het access token als het bijna verloopt. */
    async session(cookieHeader: string | null | undefined): Promise<SessionResult> {
      const raw = readCookie(cookieHeader, name, secure);
      if (!raw) return { session: null };
      const session = await unseal<Session>(raw, key);
      if (!session) return { session: null, setCookie: clear(name) };
      if (session.expiresAt - Date.now() > 60_000) return { session };
      if (!session.refreshToken) return { session: null, setCookie: clear(name) };
      try {
        const tokens = await oidc.refreshTokenGrant(await configuration(), session.refreshToken);
        const next = await toSession(tokens, session);
        return { session: next, setCookie: serializeCookie({ name, value: await seal(next, key, maxAge), maxAge, secure }) };
      } catch {
        return { session: null, setCookie: clear(name) };
      }
    },

    /** Uitloggen: cookie weg en ook bij Zitadel uitloggen. */
    async logout(request: Request): Promise<Response> {
      const { session } = await this.session(request.headers.get("cookie"));
      const headers = new Headers({ "cache-control": "no-store" });
      headers.append("set-cookie", clear(name));
      let location = options.postLogoutRedirectUri;
      if (session?.idToken) {
        location = oidc.buildEndSessionUrl(await configuration(), { id_token_hint: session.idToken, post_logout_redirect_uri: options.postLogoutRedirectUri }).href;
      }
      headers.set("location", location);
      return new Response(null, { status: 302, headers });
    },
  };
}

export type Bff = ReturnType<typeof createBff>;
