---
"@t-jarpis/auth": minor
---

Sessies groter dan één cookie worden verdeeld over maximaal vier cookies (echte Zitadel-tokens passen niet in 4 KB). Let op: `SessionResult.setCookie` is nu `setCookies: string[]`; zet ze allemaal op het antwoord.
