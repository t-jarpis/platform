import { createServer, type Server } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";

/**
 * Nep-Zitadel voor tests: discovery, JWKS, authorize (keurt direct goed), token (code + PKCE, refresh)
 * en end_session. Niet voor productie.
 */
export interface MockUser { sub: string; name?: string; email?: string; organizationId?: string }

export async function startMockOidc(opts: { clientId: string; clientSecret?: string; audience?: string; user: MockUser; accessTokenTtl?: number }) {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "mock-1", alg: "RS256", use: "sig" };
  const codes = new Map<string, { challenge: string; redirectUri: string; scope: string }>();
  const refreshTokens = new Set<string>();
  const state = { user: opts.user, logins: 0, refreshes: 0, revoked: false };
  let issuer = "";

  const sign = (claims: Record<string, unknown>, aud: string | string[], ttl: number, key: CryptoKey = privateKey) =>
    new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "mock-1" }).setIssuer(issuer).setAudience(aud)
      .setSubject(state.user.sub).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttl).sign(key);

  async function tokens(scope: string) {
    const org = state.user.organizationId ? { "urn:zitadel:iam:user:resourceowner:id": state.user.organizationId } : {};
    const ttl = opts.accessTokenTtl ?? 300;
    const refresh = randomBytes(16).toString("hex");
    if (scope.includes("offline_access")) refreshTokens.add(refresh);
    return {
      token_type: "Bearer", expires_in: ttl,
      access_token: await sign({ ...org }, opts.audience ?? opts.clientId, ttl),
      id_token: await sign({ ...org, name: state.user.name, email: state.user.email }, opts.clientId, 3600),
      ...(scope.includes("offline_access") ? { refresh_token: refresh } : {}),
    };
  }

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", issuer);
    const json = (status: number, body: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (url.pathname === "/.well-known/openid-configuration") return json(200, {
      issuer, authorization_endpoint: `${issuer}/oauth/v2/authorize`, token_endpoint: `${issuer}/oauth/v2/token`,
      jwks_uri: `${issuer}/oauth/v2/keys`, end_session_endpoint: `${issuer}/oidc/v1/end_session`,
      response_types_supported: ["code"], subject_types_supported: ["public"], id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["client_secret_basic", "none"],
    });
    if (url.pathname === "/oauth/v2/keys") return json(200, { keys: [jwk] });
    if (url.pathname === "/oauth/v2/authorize") {
      const p = url.searchParams;
      if (p.get("client_id") !== opts.clientId || p.get("code_challenge_method") !== "S256") return json(400, { error: "invalid_request" });
      const code = randomBytes(12).toString("hex");
      const redirectUri = p.get("redirect_uri") ?? "";
      codes.set(code, { challenge: p.get("code_challenge") ?? "", redirectUri, scope: p.get("scope") ?? "" });
      state.logins++;
      const back = new URL(redirectUri);
      back.searchParams.set("code", code); back.searchParams.set("state", p.get("state") ?? ""); back.searchParams.set("iss", issuer);
      res.writeHead(302, { location: back.href, "x-scope": p.get("scope") ?? "" }); return res.end();
    }
    if (url.pathname === "/oauth/v2/token" && req.method === "POST") {
      const auth = req.headers.authorization ?? "";
      if (opts.clientSecret && auth !== `Basic ${Buffer.from(`${encodeURIComponent(opts.clientId)}:${encodeURIComponent(opts.clientSecret)}`).toString("base64")}`) return json(401, { error: "invalid_client" });
      let raw = ""; for await (const chunk of req) raw += chunk;
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") === "authorization_code") {
        const c = codes.get(form.get("code") ?? "");
        codes.delete(form.get("code") ?? "");
        const challenge = createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
        if (!c || c.challenge !== challenge || c.redirectUri !== form.get("redirect_uri")) return json(400, { error: "invalid_grant" });
        return json(200, await tokens(c.scope));
      }
      if (form.get("grant_type") === "refresh_token") {
        const rt = form.get("refresh_token") ?? "";
        if (state.revoked || !refreshTokens.has(rt)) return json(400, { error: "invalid_grant" });
        refreshTokens.delete(rt); state.refreshes++;
        return json(200, await tokens("offline_access"));
      }
      return json(400, { error: "unsupported_grant_type" });
    }
    if (url.pathname === "/oidc/v1/end_session") { res.writeHead(302, { location: url.searchParams.get("post_logout_redirect_uri") ?? "/" }); return res.end(); }
    json(404, { error: "not_found" });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  issuer = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  return {
    issuer, state,
    /** Een geldig access token zoals de API het zou krijgen. */
    accessToken: (ttl = 300) => sign(state.user.organizationId ? { "urn:zitadel:iam:user:resourceowner:id": state.user.organizationId } : {}, opts.audience ?? opts.clientId, ttl),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
