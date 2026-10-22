# @t-jarpis/auth

Inloggen via Zitadel voor alle sites.

## Website of admin panel (BFF)
```ts
import { createBff } from "@t-jarpis/auth";

export const auth = createBff({
  issuer: "https://login.example.com", clientId: "...", clientSecret: "...",
  redirectUri: "https://www.example.com/auth/callback", postLogoutRedirectUri: "https://www.example.com/",
  projectId: "<project-id>",          // access token krijgt de API als publiek
  organizationId: "<org-id>",         // alleen gebruikers van deze organisatie
  sessionSecret: process.env.SESSION_SECRET!,  // minstens 32 tekens
});

// Route handlers: GET /auth/login → auth.login(req), GET /auth/callback → auth.callback(req), GET /auth/logout → auth.logout(req)
const { session, setCookie } = await auth.session(request.headers.get("cookie"));
```
De browser krijgt alleen een versleutelde `HttpOnly`-cookie (A256GCM, `__Host-`-prefix). Tokens zijn nooit leesbaar in JavaScript. Zonder activiteit verloopt de sessie na 30 dagen; het access token wordt ververst als het bijna verloopt.

## API
```ts
import { bearerToken, createTokenVerifier } from "@t-jarpis/auth";
const verify = createTokenVerifier({ issuer: "https://login.example.com", audience: "<project-id>" });
const identity = await verify(bearerToken(req.headers.authorization) ?? "");
```
Het token zegt alleen *wie* iemand is; *wat* iemand mag, bepaalt de site uit de eigen database.

## Tests
`import { startMockOidc } from "@t-jarpis/auth/testing"` start een nep-Zitadel met discovery, PKCE, refresh en uitloggen.
