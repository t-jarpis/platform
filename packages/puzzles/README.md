# @t-jarpis/puzzles

Puzzelgeneratoren en -oplossers voor de server: sudoku (4×4, 6×6, 9×9), doolhoven, woordzoekers, speurpuzzels, rekenpuzzels (rekenpiramide, rekenrooster, magisch vierkant), nonogrammen en binaire puzzels. Alles is deterministisch: dezelfde seed geeft altijd dezelfde puzzel, op elke machine.

## Alleen op de server
De generatoren draaien op de server; de generator gaat nooit naar de browser. Of een site de oplossing met de puzzel meestuurt (zodat de browser zonder serververzoek kan controleren), kiest de site zelf. Het pakket is puur TypeScript zonder Node-API's (het bouwt tegen `ES2023` zonder `@types/node`), dus het werkt ook in een edge- of worker-omgeving. Alleen `conflicts` en `validateSudokuEntry` zijn bedoeld om later eventueel ook in de browser te draaien: die kennen alleen de spelregels.

## Seeds
```ts
import { createRng } from "@t-jarpis/puzzles";

const rng = createRng("2026-11-08");   // tekst of getal; 42 en "42" zijn gelijk
rng.next();                            // [0, 1)
rng.int(6);                            // 0 tot en met 5
rng.pick(["a", "b"]);
rng.shuffle([1, 2, 3]);                // nieuwe, geschudde kopie
```
sfc32, geseed via xmur3. Alleen 32-bits integer-rekenwerk, dus overal dezelfde reeks.

**Let op:** een site kan alleen de seed bewaren en de puzzel opnieuw maken. Daarom is elke wijziging die bij een bestaande seed een andere puzzel of doolhof geeft een **major-versie**. De tests zetten een paar vaste uitkomsten vast om dat te bewaken.

## Sudoku
```ts
import { generateSudoku, countSolutions, solveSudoku, gradeSudoku } from "@t-jarpis/puzzles";

const p = generateSudoku({ size: 9, level: "expert", seed: "2026-11-08" });
// p.givens:   number[81], rij voor rij, 0 = leeg
// p.solution: number[81]
// p.box:      { rows: 3, cols: 3 }   (6×6: { rows: 2, cols: 3 })
// p.difficulty: { score: 96, techniques: ["hidden-single", "naked-single", "pointing-pair"] }

countSolutions(p.givens, 9);        // 1 (telt standaard tot 2)
solveSudoku(p.givens, 9);           // oplossing of null
gradeSudoku(p.givens, 9);           // { solved, score, techniques, grid }
```
Formaat en niveau tellen mee in de seed: dezelfde seed op een ander niveau geeft een andere puzzel.

### Niveaus en beoordeling
Elke puzzel heeft precies één oplossing. De generator vult een willekeurig rooster en haalt in willekeurige volgorde cijfers weg, zolang een menselijke oplosser de puzzel nog kan oplossen met de technieken die bij het niveau horen. Omdat elke stap van die oplosser een logisch gevolg is, betekent "oplosbaar" ook "één oplossing". Een backtracking-teller controleert dat daarna nog eens onafhankelijk.

De menselijke oplosser neemt telkens de makkelijkste techniek die iets oplevert:

| Techniek | Wat | Punten |
| --- | --- | --- |
| `hidden-single` | Een cijfer kan in een rij, kolom of vak nog maar op één plek | 1 |
| `naked-single` | Een vakje heeft nog maar één mogelijk cijfer | 2 |
| `pointing-pair` | In een vak staat een cijfer alleen in één rij/kolom; elders in die lijn valt het af | 10 |
| `box-line` | In een rij/kolom staat een cijfer alleen in één vak; elders in dat vak valt het af | 10 |
| `naked-pair` | Twee vakjes met dezelfde twee kandidaten | 15 |
| `hidden-pair` | Twee cijfers die maar in dezelfde twee vakjes passen | 20 |

`difficulty.score` is de som van de punten over alle stappen; `difficulty.techniques` zijn de gebruikte technieken.

| Niveau | Regel | Gegeven cijfers 4×4 / 6×6 / 9×9 |
| --- | --- | --- |
| `starter` | Alleen singles | 8–9 / 18–20 / 36–40 |
| `advanced` | Alleen singles, minder hulp | 6–7 / 13–15 / 28–31 |
| `expert` | Zo weinig mogelijk cijfers; minstens één techniek voorbij singles | minimaal (≈ 4 / 9 / 21–27) |
| `large-print` | Altijd 9×9, zelfde regels als `starter` 9×9 | – / – / 36–40 |

Expert: de generator haalt cijfers weg tot er niets meer af kan (met alle technieken). Vraagt het resultaat alleen singles, dan probeert hij een nieuw rooster (6 pogingen bij 4×4, anders 12). Lukt het niet, dan wint de poging met de minste gegeven cijfers ("minste cijfers"-regel). Bij 9×9 is vrijwel elke expert voorbij singles; bij 4×4 en 6×6 bestaat dat nauwelijks, daar is expert dus "minste cijfers". Expertpuzzels zijn altijd op te lossen met de technieken hierboven, nooit alleen met gokken.

Snelheid (Node 22): 9×9 starter ≈ 3 ms, advanced ≈ 5 ms, expert ≈ 35 ms per puzzel.

### Antwoord controleren
```ts
import { conflicts, validateSudokuEntry } from "@t-jarpis/puzzles";

conflicts(grid, 9);                        // indexen van botsende vakjes
validateSudokuEntry(p.givens, entry, 9);   // { conflicts, changedGivens, complete, solved }
```
`solved` is waar als alles is ingevuld, niets botst en de gegeven cijfers onveranderd zijn. Omdat de puzzel één oplossing heeft, is dat dé oplossing; de controle heeft de oplossing zelf dus niet nodig.

## Doolhof
```ts
import { generateMaze, solveMaze, Wall } from "@t-jarpis/puzzles";

const m = generateMaze({ width: 12, height: 8, seed: "abc" });   // shape: "rect", algorithm: "backtracker"
m.cells[y * m.width + x] & Wall.N;   // muur aan de noordkant?
solveMaze(m);                        // [{ x: 0, y: 0 }, …, { x: 11, y: 7 }]
solveMaze(m, { x: 3, y: 2 }, { x: 0, y: 7 });
```
- Perfect doolhof: tussen elk paar vakjes precies één pad.
- `algorithm: "backtracker"` (standaard) geeft lange, kronkelende gangen; `"wilson"` kiest elk doolhof even waarschijnlijk en geeft meer korte doodlopende gangen.
- Start linksboven, eind rechtsonder. De buitenmuur is overal dicht; de tekening maakt zelf een opening bij start en eind.
- Breedte en hoogte: 1 tot en met 500. Voorlopig alleen `shape: "rect"`.

## Niveaus van de andere puzzels
Alle puzzels hieronder gebruiken `PuzzleLevel`: `starter | advanced | expert | large-print` (`PUZZLE_LEVELS`). `large-print` is steeds een makkelijke variant die geschikt is om groot af te drukken. De instellingen per niveau staan als constante in het pakket (`WORD_SEARCH_LEVELS`, `SLEUTH_LEVELS`, …), zodat een site ze kan tonen. Niveau en opties tellen mee in de seed. Voor alles geldt: dezelfde seed en opties geven exact dezelfde puzzel, en een wijziging daarin is een major-versie (de tests zetten vaste uitkomsten vast).

Elke puzzel heeft een controlefunctie die alleen de spelregels gebruikt. Omdat elke puzzel precies één oplossing heeft, betekent "klopt volgens de regels" ook "dé oplossing".

## Woordzoeker
```ts
import { generateWordSearch, checkWordSearchFind } from "@t-jarpis/puzzles";

const w = generateWordSearch({ seed: "abc", level: "advanced", words: ["appel", "peer", "banaan"] });
// w.grid:       string[] (rij voor rij, w.width × w.height), één letter per vakje
// w.placements: [{ word: "APPEL", input: "appel", start: { x, y }, end: { x, y }, direction: "SE" }, …]
checkWordSearchFind(w, { x: 2, y: 0 }, { x: 6, y: 4 });   // { found: true, word: "APPEL", index: 0 } of { found: false }
```
- Het pakket bevat geen woordenlijsten: de site levert de woorden. Woorden worden hoofdletters; spaties, streepjes, punten en apostroffen gaan eruit. Elke letter moet in het alfabet zitten.
- Opties: `size` (getal of `{ width, height }`, 2–50), `directions` (windrichtingen `E S SE NE` vooruit, `W N NW SW` achterstevoren), `alphabet` (standaard A–Z, voor de vulletters).
- Elk woord staat er **precies één keer** in, geteld in alle acht richtingen, ook richtingen die het niveau niet gebruikt. Vulletters vormen dus nooit per ongeluk een tweede exemplaar.
- Geweigerd (`RangeError`): dubbele woorden, en woorden die in een ander woord (of het omgekeerde ervan) zitten, zoals "kat" naast "katten". Die zouden altijd twee keer te vinden zijn.
- Zonder `size` groeit het rooster mee als een woord langer is of de woorden niet passen; met `size` volgt een `RangeError`.

| Niveau | Rooster | Richtingen |
| --- | --- | --- |
| `starter` | 8×8 | horizontaal en verticaal, niet achterstevoren |
| `advanced` | 12×12 | plus schuin (beide diagonalen vooruit), niet achterstevoren |
| `expert` | 15×15 | alle 8 richtingen, ook achterstevoren |
| `large-print` | 8×8 | zoals `starter` |

## Speurpuzzel
Een logische plaatsingspuzzel (eigen variant). Een N×N-rooster is verdeeld in kamers; sommige vakjes zijn bezet (obstakel) en sommige randvakjes hebben een raam. Er staan figuren in het rooster: **nooit twee in dezelfde rij of kolom** (zoals torens) en nooit op een obstakel. Met de aanwijzingen is precies één opstelling mogelijk. De vraag is "wie staat in kamer K?"; de site maakt daar een verhaal van.

```ts
import { generateSleuth, countSleuthSolutions, solveSleuth, checkSleuthSolution, checkSleuthAnswer } from "@t-jarpis/puzzles";

const p = generateSleuth({ seed: "abc", level: "expert" });
// p.size, p.figureCount, p.roomCount
// p.rooms:     kamer per vakje (rij voor rij, kamers genummerd in leesvolgorde)
// p.obstacles, p.windows: vakje-indexen
// p.clues:     [{ type: "touching", figure: 2, other: 5 }, { type: "not-in-room", figure: 0, room: 3 }, …]
// p.question:  { room: 4 }     p.answer: { figure: 1 }     p.solution: vakje per figuur
checkSleuthSolution(p, cells);   // { ruleConflicts, brokenClues, solved }
checkSleuthAnswer(p, 1);         // true
```
Figuren, kamers, rijen en kolommen zijn nummers vanaf 0. Het pakket bevat **geen teksten**: de site kiest de namen en formuleert de aanwijzingen.

| Aanwijzing | Betekenis (voorbeeldtekst voor de site) |
| --- | --- |
| `in-room` `{ figure, room }` | X staat in kamer K |
| `not-in-room` `{ figure, room }` | X staat niet in kamer K |
| `in-row` `{ figure, row }` / `in-column` `{ figure, column }` | X staat in rij/kolom r |
| `touching` `{ figure, other }` | X raakt Y (ook schuin). Omdat figuren nooit in dezelfde rij of kolom staan, is dat altijd schuin |
| `left-of` `{ figure, other }` | X staat ergens links van Y (in een kolom verder naar links) |
| `above` `{ figure, other }` | X staat ergens boven Y (in een rij hoger) |
| `on-feature` / `not-on-feature` `{ figure, feature }` | X staat (niet) bij het raam (`window`) of aan de rand (`edge`) |

De generator maakt eerst een geldige opstelling, voegt dan aanwijzingen toe tot de oplosser (backtracking die telt) er nog één opstelling vindt, en haalt daarna elke overbodige aanwijzing weer weg. Elke aanwijzing in de puzzel is dus nodig. Over de vraagkamer komt nooit een `in-room`-aanwijzing.

| Niveau | Rooster | Figuren | Kamers | Obstakels | Aanwijzingen |
| --- | --- | --- | --- | --- | --- |
| `starter` | 4×4 | 3 | 4 | 2 | kamer, niet-in-kamer, rij, kolom |
| `advanced` | 6×6 | 5 | 6 | 4 | plus raken, links van, boven, raam/rand |
| `expert` | 8×8 | 7 of 8 | 8 | 6 | alles; voorkeur voor relaties, rij en kolom als laatste redmiddel |
| `large-print` | 5×5 | 4 | 5 | 3 | zoals `starter` |

Snelheid: 8×8 expert gemiddeld ≈ 90 ms, langzaamste gemeten ≈ 250 ms.

## Rekenpuzzels
### Rekenpiramide
```ts
const p = generateNumberPyramid({ seed: "golden", level: "advanced" });   // optie rows: 2–8
// p.givens:   [[null], [null, 15], [4, 8, null], [null, 2, null, null]]   (van boven naar onder)
// p.solution: [[27], [12, 15], [4, 8, 7], [2, 2, 6, 1]]
solveNumberPyramid(p.givens);           // { solved, grid, steps }
checkNumberPyramid(p.givens, entry);    // { changedGivens, wrongSums, complete, solved }
```
Elk vakje is de som van de twee eronder. De onderste rij is altijd **deels** gegeven. De puzzel is stap voor stap op te lossen met optellen en aftrekken (steeds een driehoekje met twee bekende vakjes), en heeft dus precies één oplossing.

| Niveau | Rijen | Onderste rij | Gegeven vakjes |
| --- | --- | --- | --- |
| `starter` | 3 | 1–10 | minimaal + 1 |
| `advanced` | 4 | 1–20 | minimaal |
| `expert` | 5 | 1–25 | minimaal, minstens 2 lege vakjes onderaan |
| `large-print` | 4 | 1–6 | minimaal + 2 |

### Rekenrooster
```ts
const g = generateMathGrid({ seed: "abc", level: "advanced" });
// g.evaluation: "left-to-right"
// g.rowOperators: [["+", "-"], …]   g.columnOperators: …   ("*" tekent de site als ×)
// g.rowResults, g.columnResults, g.givens (9 vakjes, null = leeg), g.solution
countMathGridSolutions(g);   // 1
checkMathGrid(g, entry);     // { changedGivens, invalidCells, wrongRows, wrongColumns, complete, solved }
```
3×3 vakjes met verschillende getallen uit 1–`max` (bij `max` 9: elk getal precies één keer). Er wordt **van links naar rechts en van boven naar onder gerekend, zonder voorrang voor ×** (`evaluation: "left-to-right"`); de site legt dat uit. Tussenuitkomsten zijn nooit negatief. De teller probeert alle invullingen (ook met negatieve tussenuitkomsten), dus "één oplossing" geldt voor iedereen.

| Niveau | Getallen | Tekens | Grootste uitkomst | Gegeven vakjes |
| --- | --- | --- | --- | --- |
| `starter` | 1–9 | + − | 30 | minstens 4 |
| `advanced` | 1–9 | + − × | 100 | minstens 2 |
| `expert` | 1–15 | + − × | 200 | zo weinig mogelijk (soms 0) |
| `large-print` | 1–9 | + − | 30 | minstens 4 |

### Magisch vierkant
```ts
const m = generateMagicSquare({ seed: 1, level: "expert" });   // optie size: 3 | 4
// m.magicSum: 84   m.start: 6   m.step: 2   m.givens (null = leeg)   m.solution
solveMagicSquare(m.givens, m.size, m.magicSum);   // { solved, grid, steps }
checkMagicSquare(m, entry);                        // { changedGivens, wrongLines, complete, solved }
```
Rijen, kolommen en beide diagonalen tellen op tot `magicSum` (wordt getoond). De getallen zijn `start, start + step, …`. De puzzel is stap voor stap op te lossen (telkens een lijn met nog één leeg vakje), en heeft dus precies één invulling, ook zonder de regel dat getallen verschillend zijn. Vierkanten komen uit vaste magische vierkanten (Lo Shu; voor 4×4 Dürer en een pandiagonaal vierkant) met draaien, spiegelen, complement en rij/kolomwissels die magisch blijven.

| Niveau | Formaat | Getallen | Gegeven vakjes |
| --- | --- | --- | --- |
| `starter` | 3×3 | 1–9 | minimaal + 1 |
| `advanced` | 3×3 | start 2–20, stap 1–3 | minimaal |
| `expert` | 4×4 | start 1–10, stap 1–2 | minimaal |
| `large-print` | 3×3 | 1–9 | minimaal + 2 |

## Nonogram
```ts
import { createNonogram, isLineSolvable, nonogramClues, solveNonogramLines, generateRandomNonogram, checkNonogram } from "@t-jarpis/puzzles";

const image = [[false, true, true], [true, true, true]];   // eigen pixeltekening van de site, image[y][x]
isLineSolvable(image);              // uniek én zonder gokken op te lossen?
const n = createNonogram(image);    // { width, height, rows, columns, solution, difficulty: { lineSteps } }; RangeError als niet lijn-oplosbaar
nonogramClues(image);               // { rows: [[2], [3]], columns: [[1], [2], [2]] }  (lege lijn: [])
generateRandomNonogram({ seed: "abc", width: 10, height: 10, density: 0.55 });
checkNonogram(n, grid);             // { wrongRows, wrongColumns, solved }
```
De lijn-oplosser kijkt per rij of kolom welke vakjes in **elke** plaatsing van de blokken gevuld (of leeg) zijn, en herhaalt dat tot er niets meer verandert. Lukt het zo helemaal, dan is de tekening uniek en zonder gokken op te lossen. `generateRandomNonogram` probeert willekeurige tekeningen (kans `density` per vakje, standaard 0,55) tot er een lijn-oplosbare is. Geen niveaus: de moeilijkheid volgt uit formaat en tekening (`difficulty.lineSteps`).

Snelheid: willekeurig 10×10 ≈ 1 ms, 20×20 ≈ 5 ms.

## Binaire puzzel
```ts
import { generateBinary, gradeBinary, countBinarySolutions, solveBinary, validateBinaryEntry } from "@t-jarpis/puzzles";

const b = generateBinary({ seed: "abc", level: "expert", size: 12 });   // size: 6, 8, 10, 12, 14
// b.givens: (0 | 1 | null)[] rij voor rij    b.solution    b.difficulty: { score, techniques }
validateBinaryEntry(b.givens, entry, 12);   // { conflicts, changedGivens, complete, solved }
```
Regels: nooit meer dan twee gelijke naast of onder elkaar, evenveel nullen als enen per rij en kolom, en geen twee gelijke rijen of kolommen. Net als bij sudoku bepaalt een menselijke oplosser het niveau:

| Techniek | Wat | Punten per vakje |
| --- | --- | --- |
| `pair` | Twee gelijke naast elkaar: ervoor en erna het andere cijfer | 1 |
| `gap` | Twee gelijke met één vakje ertussen: daar het andere cijfer | 1 |
| `count` | De helft van een lijn is al één cijfer: de rest is het andere | 2 |
| `line` | Alle geldige afmakingen van een lijn zijn het eens over een vakje | 8 |
| `unique` | Zoals `line`, maar een afmaking mag niet gelijk zijn aan een volle lijn | 15 |

| Niveau | Standaardformaat | Technieken | Gegeven vakjes |
| --- | --- | --- | --- |
| `starter` | 6×6 | alleen `pair`, `gap`, `count` | ongeveer de helft |
| `advanced` | 8×8 | alleen `pair`, `gap`, `count` | zo weinig mogelijk |
| `expert` | 10×10 | alle; minstens één voorbij de basis | zo weinig mogelijk |
| `large-print` | 8×8 | zoals `starter` | ongeveer de helft |

Een onafhankelijke teller (backtracking met logica) controleert dat er precies één oplossing is. Snelheid: 10×10 expert ≈ 10–30 ms, 14×14 expert ≈ 40 ms.
