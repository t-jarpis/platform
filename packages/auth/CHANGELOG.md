# @t-jarpis/auth

## 0.2.0

### Minor Changes

- 072f107: BFF-inloggen via Zitadel: authorization code met PKCE, versleutelde HttpOnly-sessiecookie, automatisch verversen, uitloggen bij Zitadel, beperking tot één organisatie. Nep-Zitadel voor tests via `@t-jarpis/auth/testing`.
- d6114c5: `isLocalUrl()`; `insecureDevelopment` werkt alleen nog als site en uitgever op localhost draaien.
- e931c57: `fetchUserInfo()` voor just-in-time gebruikers. Nep-Zitadel: userinfo-endpoint en `accessToken(ttl, user)` voor tokens van andere gebruikers.

### Patch Changes

- 799f6a8: Ook bruikbaar vanuit CommonJS (`require`) op Node 22.12 en nieuwer.
