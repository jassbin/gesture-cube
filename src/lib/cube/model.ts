// 3x3 Rubik's cube logic model.
// Facelet representation: 6 faces (U R F D L B), each 9 stickers indexed 0..8.
// Colors: 0..5 map to U R F D L B solved state.

export type Face = "U" | "R" | "F" | "D" | "L" | "B";
export const FACES: Face[] = ["U", "R", "F", "D", "L", "B"];

export type CubeState = Record<Face, number[]>;

export type Move = {
  face: Face;
  // true = clockwise (as seen looking at that face), false = counter-clockwise
  cw: boolean;
};

export const MOVE_LIST: Face[] = ["U", "R", "F", "D", "L", "B"];

export function solvedState(): CubeState {
  const s = {} as CubeState;
  FACES.forEach((f, i) => {
    s[f] = Array(9).fill(i);
  });
  return s;
}

export function cloneState(state: CubeState): CubeState {
  const s = {} as CubeState;
  FACES.forEach((f) => {
    s[f] = state[f].slice();
  });
  return s;
}

function rotateFaceCW(face: number[]): number[] {
  // indices: 0 1 2 / 3 4 5 / 6 7 8
  return [
    face[6], face[3], face[0],
    face[7], face[4], face[1],
    face[8], face[5], face[2],
  ];
}
function rotateFaceCCW(face: number[]): number[] {
  return [
    face[2], face[5], face[8],
    face[1], face[4], face[7],
    face[0], face[3], face[6],
  ];
}

// Adjacency cycles for each face turn (clockwise). Each entry is [face, [i0,i1,i2]]
// in the order they receive stickers from the previous entry.
const CYCLES: Record<Face, [Face, number[]][]> = {
  U: [
    ["B", [2, 1, 0]],
    ["R", [2, 1, 0]],
    ["F", [2, 1, 0]],
    ["L", [2, 1, 0]],
  ],
  D: [
    ["F", [6, 7, 8]],
    ["R", [6, 7, 8]],
    ["B", [6, 7, 8]],
    ["L", [6, 7, 8]],
  ],
  F: [
    ["U", [6, 7, 8]],
    ["R", [0, 3, 6]],
    ["D", [2, 1, 0]],
    ["L", [8, 5, 2]],
  ],
  B: [
    ["U", [2, 1, 0]],
    ["L", [0, 3, 6]],
    ["D", [6, 7, 8]],
    ["R", [8, 5, 2]],
  ],
  R: [
    ["U", [8, 5, 2]],
    ["B", [0, 3, 6]],
    ["D", [8, 5, 2]],
    ["F", [8, 5, 2]],
  ],
  L: [
    ["U", [0, 3, 6]],
    ["F", [0, 3, 6]],
    ["D", [0, 3, 6]],
    ["B", [8, 5, 2]],
  ],
};

export function applyMove(state: CubeState, move: Move): CubeState {
  const s = cloneState(state);
  const { face, cw } = move;
  s[face] = cw ? rotateFaceCW(state[face]) : rotateFaceCCW(state[face]);

  const cyc = CYCLES[face];
  const order = cw ? cyc : [...cyc].reverse();
  // grab source strips
  const strips = order.map(([f, idx]) => idx.map((i) => state[f][i]));
  // shift by one
  order.forEach(([f, idx], k) => {
    const src = strips[(k - 1 + order.length) % order.length];
    idx.forEach((i, j) => {
      s[f][i] = src[j];
    });
  });
  return s;
}

export function isSolved(state: CubeState): boolean {
  return FACES.every((f) => state[f].every((c) => c === state[f][0]));
}

export function scramble(
  state: CubeState,
  count = 25,
): { state: CubeState; moves: Move[] } {
  let s = cloneState(state);
  const moves: Move[] = [];
  let last: Face | null = null;
  for (let i = 0; i < count; i++) {
    let face: Face;
    do {
      face = MOVE_LIST[Math.floor(Math.random() * MOVE_LIST.length)];
    } while (face === last);
    last = face;
    const cw = Math.random() < 0.5;
    const m = { face, cw };
    s = applyMove(s, m);
    moves.push(m);
  }
  return { state: s, moves };
}

export function moveLabel(m: Move): string {
  return `${m.face}${m.cw ? "" : "'"}`;
}
