# @t-jarpis/puzzles

## 0.1.0

### Minor Changes

- 794cfb1: Vijf nieuwe puzzelsoorten, elk deterministisch vanuit een seed, met niveaus (`PuzzleLevel`: `starter`, `advanced`, `expert`, `large-print`), oplosser of teller en controle op de spelregels: woordzoeker (`generateWordSearch`, `checkWordSearchFind`; elk woord precies één keer), speurpuzzel (`generateSleuth`; kamers, obstakels, gestructureerde aanwijzingen, precies één opstelling), rekenpuzzels (`generateNumberPyramid`, `generateMathGrid` met `evaluation: "left-to-right"`, `generateMagicSquare`), nonogram (`createNonogram`, `isLineSolvable`, `generateRandomNonogram`) en binaire puzzel 6×6 t/m 14×14 (`generateBinary` met beoordeling door een menselijke oplosser).
- 0630f04: Nieuw pakket: deterministische puzzelgeneratoren voor de server. Sudoku 4×4, 6×6 en 9×9 met precies één oplossing en beoordeling door een menselijke oplosser (niveaus `starter`, `advanced`, `expert`, `large-print`), oplosser en teller, `conflicts`/`validateSudokuEntry` om antwoorden te controleren, en perfecte doolhoven (backtracker of Wilson) met `solveMaze`. Alles vanuit een seed (`createRng`).
