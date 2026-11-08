# 0004 · Puzzelgeneratoren als platformpakket

- Status: aangenomen
- Datum: 2026-11-08

## Context
Een puzzelsite heeft sudoku's en doolhoven nodig die op de server gemaakt worden, met een vaste moeilijkheid en precies één oplossing. Die generatoren zijn niet gebonden aan het onderwerp van een site: elke site met puzzels kan ze gebruiken.

## Besluit
- Nieuw pakket `@t-jarpis/puzzles`: sudoku (4×4, 6×6, 9×9) met generator, oplosser, teller en beoordeling door een menselijke oplosser; perfecte doolhoven met oplosser; controle van antwoorden op de spelregels.
- Alles is deterministisch vanuit een seed (sfc32 via xmur3). Een site mag alleen de seed bewaren. Een wijziging die bij een bestaande seed een andere uitkomst geeft, is daarom een major-versie; tests zetten vaste uitkomsten vast.
- Generatoren draaien alleen op de server en gaan niet mee naar de browser. Het pakket gebruikt geen Node-API's (bouwt zonder `@types/node`), zodat het ook in een edge- of worker-omgeving draait.
- Niveaus worden bepaald door de technieken die de menselijke oplosser nodig heeft, niet alleen door het aantal gegeven cijfers (zie README van het pakket).

## Verhouding tot ADR 0001
ADR 0001 zegt dat code pas naar het platform komt als een tweede site hem nodig heeft. Dat is hier het geval: de nieuwe puzzelsite en de bestaande kleurplatensite (die al sudoku's aanbiedt) gebruiken allebei dezelfde generatoren. Thijs koos er bij het plan voor de puzzelsite (8 november 2026) voor om de puzzel-engine meteen gedeeld te bouwen, zodat elke site los verkoopbaar blijft zonder eigen kopie van de logica.

## Gevolgen
- Sites die puzzels tonen, nemen dit pakket op als tarball (ADR 0002).
- Nieuwe puzzelsoorten komen in hetzelfde pakket, elk met eigen tests en vaste uitkomsten.
