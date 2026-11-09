# 0005 · Meer puzzelsoorten in `@t-jarpis/puzzles`

- Status: aangenomen
- Datum: 2026-11-09

## Context
ADR 0004 maakte `@t-jarpis/puzzles` met sudoku en doolhoven, en zei dat nieuwe puzzelsoorten in hetzelfde pakket komen. Een puzzelsite heeft er meer nodig: woordzoekers, logische plaatsingspuzzels, rekenpuzzels, nonogrammen en binaire puzzels. Ook die zijn niet gebonden aan het onderwerp van een site.

## Besluit
- Het pakket krijgt vijf soorten erbij: woordzoeker, speurpuzzel (eigen logische plaatsingspuzzel), rekenpuzzels (rekenpiramide, rekenrooster, magisch vierkant), nonogram en binaire puzzel. Elke soort heeft een generator, een oplosser of teller, een controle op de spelregels en eigen tests.
- Eén gedeeld niveautype `PuzzleLevel` (`starter | advanced | expert | large-print`). Per soort staat in een constante wat een niveau betekent. `SudokuLevel` blijft zoals het is.
- Het pakket bevat **geen inhoud en geen teksten**: woordenlijsten en pixeltekeningen levert de site; de speurpuzzel geeft aanwijzingen als data (type + parameters), de site maakt er zinnen en een verhaal van. Zo blijft het pakket los van elke site (ADR 0001).
- Eén oplossing is steeds hard: of een logische oplosser lost de puzzel stap voor stap op (rekenpiramide, magisch vierkant, nonogram, binaire puzzel; elke stap is een gevolg, dus uniek), of een teller telt alle oplossingen (speurpuzzel, rekenrooster). Tests controleren dat over tientallen seeds, waar mogelijk met een tweede, onafhankelijke methode (rang van het stelsel, brute force).
- Rekenregels die een site moet uitleggen staan in de puzzeldata, zoals `evaluation: "left-to-right"` bij het rekenrooster.
- Deterministisch zoals in ADR 0004: een andere uitkomst bij een bestaande seed is een major-versie; vaste uitkomsten in de tests bewaken dat.

## Gevolgen
- Een site die een van deze puzzels gebruikt, levert zelf woorden, tekeningen en teksten.
- Het pakket wordt groter, maar blijft zonder afhankelijkheden en zonder Node-API's.
- Snelheid is gemeten en staat in de README; de traagste is de 8×8 speurpuzzel (gemiddeld ≈ 90 ms, gemeten maximum ≈ 250 ms).
