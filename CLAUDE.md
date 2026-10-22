# Platform – werkafspraken

- Dit is de gedeelde platform-repo voor alle sites van Thijs. Communiceer in het Nederlands; code, identifiers en commits in het Engels, documentatie in het Nederlands.
- **Het platform weet niets van sites** (ADR 0001). Geen sitenamen, domeinbegrippen of site-imports. `pnpm guard` moet slagen. Nieuwe site → scope en naam toevoegen aan `guard.config.json`.
- Code komt pas hierheen als een tweede site hem nodig heeft. Kleurhoek-code blijft in `t-jarpis/kleurhoek`.
- Elke publieke wijziging aan een pakket krijgt een changeset (`pnpm changeset`). Semver strikt.
- **Architectuur bijhouden:** bij elke architectuurwijziging het architectuurdocument én de diagrammen bijwerken (https://claude.ai/artifact/NmTKCWCDF31b6H4RY4XcEQ) en een ADR toevoegen in `docs/adr/`.
- Voor een commit: `pnpm check` groen.
- Geen geheimen, `.env`-bestanden of klantdata in deze repo.
