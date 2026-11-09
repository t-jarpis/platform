---
"@t-jarpis/puzzles": minor
---

Vijf nieuwe puzzelsoorten, elk deterministisch vanuit een seed, met niveaus (`PuzzleLevel`: `starter`, `advanced`, `expert`, `large-print`), oplosser of teller en controle op de spelregels: woordzoeker (`generateWordSearch`, `checkWordSearchFind`; elk woord precies één keer), speurpuzzel (`generateSleuth`; kamers, obstakels, gestructureerde aanwijzingen, precies één opstelling), rekenpuzzels (`generateNumberPyramid`, `generateMathGrid` met `evaluation: "left-to-right"`, `generateMagicSquare`), nonogram (`createNonogram`, `isLineSolvable`, `generateRandomNonogram`) en binaire puzzel 6×6 t/m 14×14 (`generateBinary` met beoordeling door een menselijke oplosser).
