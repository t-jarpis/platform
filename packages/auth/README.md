# @t-jarpis/auth

Controle van Zitadel-access tokens voor de API van een site.

```ts
import { bearerToken, createTokenVerifier } from "@t-jarpis/auth";

const verify = createTokenVerifier({ issuer: "https://login.example.com", audience: "<project-id>" });
const identity = await verify(bearerToken(req.headers.authorization) ?? "");
```

Het token zegt alleen *wie* iemand is. *Wat* iemand mag, bepaalt de site uit de eigen database
(zie `@t-jarpis/access`, volgt). BFF-helpers voor Next.js volgen in fase 1.
