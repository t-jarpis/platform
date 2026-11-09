export { createRng } from "./rng.js";
export type { Rng, Seed } from "./rng.js";

export { boxFor } from "./sudoku/grid.js";
export type { Box, SudokuSize } from "./sudoku/grid.js";
export { countSolutions, solveSudoku } from "./sudoku/solver.js";
export { gradeSudoku, SINGLES, TECHNIQUE_WEIGHTS, TECHNIQUES } from "./sudoku/logic.js";
export type { Grade, GradeOptions, Technique } from "./sudoku/logic.js";
export { generateSudoku, GIVENS_RANGE, SUDOKU_LEVELS } from "./sudoku/generate.js";
export type { Sudoku, SudokuDifficulty, SudokuLevel, SudokuOptions } from "./sudoku/generate.js";
export { conflicts, validateSudokuEntry } from "./sudoku/validate.js";
export type { SudokuEntryCheck } from "./sudoku/validate.js";

export { generateMaze, solveMaze, Wall } from "./maze.js";
export type { Maze, MazeAlgorithm, MazeOptions, MazeShape, Point, WallBit } from "./maze.js";

export { assertLevel, PUZZLE_LEVELS } from "./level.js";
export type { PuzzleLevel } from "./level.js";

export {
  checkWordSearchFind, countWordOccurrences, DEFAULT_ALPHABET, FORWARD_DIRECTIONS, generateWordSearch, normalizeWord, WORD_DIRECTIONS, WORD_SEARCH_LEVELS,
} from "./wordsearch.js";
export type { WordDirection, WordPlacement, WordSearch, WordSearchFind, WordSearchOptions } from "./wordsearch.js";

export { checkSleuthAnswer, checkSleuthSolution, countSleuthSolutions, generateSleuth, SLEUTH_CLUE_TYPES, SLEUTH_LEVELS, solveSleuth } from "./sleuth.js";
export type { SleuthCheck, SleuthClue, SleuthClueType, SleuthFeature, SleuthLayout, SleuthOptions, SleuthPuzzle } from "./sleuth.js";

export { checkNumberPyramid, generateNumberPyramid, NUMBER_PYRAMID_LEVELS, solveNumberPyramid } from "./arithmetic/pyramid.js";
export type { NumberPyramid, NumberPyramidCheck, NumberPyramidOptions } from "./arithmetic/pyramid.js";
export { checkMathGrid, countMathGridSolutions, generateMathGrid, MATH_GRID_LEVELS, solveMathGrid } from "./arithmetic/mathgrid.js";
export type { MathGrid, MathGridCheck, MathGridOptions, MathOperator } from "./arithmetic/mathgrid.js";
export { checkMagicSquare, generateMagicSquare, isMagicSquare, MAGIC_SQUARE_LEVELS, solveMagicSquare } from "./arithmetic/magic.js";
export type { MagicSquare, MagicSquareCheck, MagicSquareOptions, MagicSquareSize } from "./arithmetic/magic.js";

export { checkNonogram, createNonogram, generateRandomNonogram, isLineSolvable, nonogramClues, solveNonogramLines } from "./nonogram.js";
export type { Nonogram, NonogramCell, NonogramCheck, NonogramClues, NonogramSolve, RandomNonogramOptions } from "./nonogram.js";

export {
  BINARY_BASIC, BINARY_LEVELS, BINARY_SIZES, BINARY_TECHNIQUE_WEIGHTS, BINARY_TECHNIQUES, binaryConflicts, countBinarySolutions, generateBinary, gradeBinary,
  isValidBinary, solveBinary, validateBinaryEntry,
} from "./binary.js";
export type { BinaryCell, BinaryEntryCheck, BinaryGrade, BinaryOptions, BinaryPuzzle, BinarySize, BinaryTechnique, BinaryValue } from "./binary.js";
