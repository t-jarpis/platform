# @t-jarpis/puzzles

Puzzelgeneratoren en -oplossers voor de server: sudoku (4×4, 6×6, 9×9) en doolhoven. Alles is deterministisch: dezelfde seed geeft altijd dezelfde puzzel, op elke machine.

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
