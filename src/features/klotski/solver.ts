/**
 * 华容道最短步求解器。
 *
 * 核心思路：
 * - 经典关卡保留紧凑的 BigInt 状态编码和同形规范化，避免影响已确认的 90 步结果与性能。
 * - 含异形块的关卡使用通用状态编码，把半圆、3/4 圆和听筒朝向纳入状态，并复用引擎判定。
 * - 搜索：BFS。一次单轴滑动任意距离或一次 90° 旋转都计为一步，每个合法落点均生成后继。
 * - 回溯：parent 链 + 逐步 move 记录，反向拼出解序列。
 *
 * 计数口径说明：华容道不同资料对「步」定义不一（移动一格 / 滑动任意距离 / 滑到底）。
 * 本实现采用「一块棋子沿一个方向滑动任意距离 = 一步」这一主流口径。
 */

import {
  computeRange,
  getHandsetOrientation,
  getOrientation,
  getSize,
  getThreeQuarterOrientation,
  isWin,
  movePiece,
  rotatePiece,
  turnHandset,
} from './engine';
import {
  PieceType,
  type HandsetOrientation,
  type HandsetPivot,
  type Orientation,
  type Piece,
  type RotationDirection,
  type ThreeQuarterOrientation,
} from './types';

/** 单步移动记录，用于回溯回放。 */
export interface SolverMove {
  kind: 'move';
  w: number;
  h: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface SolverRotation {
  kind: 'rotate';
  pieceType: typeof PieceType.HALF_DISC | typeof PieceType.THREE_QUARTER_DISC;
  from: { x: number; y: number };
  orientation: Orientation | ThreeQuarterOrientation;
  direction: RotationDirection;
}

export interface SolverCornerTurn {
  kind: 'corner-turn';
  from: { x: number; y: number };
  orientation: HandsetOrientation;
  pivot: HandsetPivot;
  direction: RotationDirection;
}

export type SolverAction = SolverMove | SolverRotation | SolverCornerTurn;

interface SolverPiece {
  w: number;
  h: number;
  x: number;
  y: number;
}

const COLS = 4;
const ROWS = 5;
const POS_BITS = 5n;
const POS_MASK = 31n;

/**
 * 分组定义：每类同形棋子的位偏移（单位 bit）与数量。
 * 位布局（低位→高位）：曹操(0) → 横将(5) → 竖将(10..25) → 小卒(30..45)。
 */
const GROUPS = [
  { w: 2, h: 2, count: 1, offset: 0n },
  { w: 2, h: 1, count: 1, offset: 5n },
  { w: 1, h: 2, count: 4, offset: 10n },
  { w: 1, h: 1, count: 4, offset: 30n },
] as const;

/** 紧凑编码只适用于一横将、四竖将、四卒的传统棋子组合。 */
function supportsCompactEncoding(pieces: Piece[]): boolean {
  if (
    pieces.some(
      (piece) =>
        piece.type === PieceType.HALF_DISC ||
        piece.type === PieceType.THREE_QUARTER_DISC ||
        piece.type === PieceType.HANDSET,
    )
  ) {
    return false;
  }
  if (pieces.length !== GROUPS.reduce((total, group) => total + group.count, 0)) return false;
  return GROUPS.every(
    (group) =>
      pieces.filter((piece) => {
        const size = getSize(piece);
        return size.w === group.w && size.h === group.h;
      }).length === group.count,
  );
}

/** 曹操左上角应到达 (1,3) 时的位置值。 */
const CAO_POS_VALUE = 3 * COLS + 1;
/** 曹操块占位的最低 offset 值，胜利判定只比较这一块。 */
const CAO_WIN_BITS = BigInt(CAO_POS_VALUE) << GROUPS[0].offset;

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function posValue(x: number, y: number): number {
  return y * COLS + x;
}

/** 同形棋子排序后按固定位偏移写入，保证等价局面共享同一键。 */
function encode(pieces: SolverPiece[]): bigint {
  let state = 0n;
  for (const g of GROUPS) {
    const vals = pieces
      .filter((p) => p.w === g.w && p.h === g.h)
      .map((p) => posValue(p.x, p.y))
      .sort((a, b) => a - b);
    for (let i = 0; i < vals.length; i++) {
      state |= BigInt(vals[i]) << (g.offset + BigInt(i) * POS_BITS);
    }
  }
  return state;
}

function decode(state: bigint): SolverPiece[] {
  const pieces: SolverPiece[] = [];
  for (const g of GROUPS) {
    for (let i = 0; i < g.count; i++) {
      const shift = g.offset + BigInt(i) * POS_BITS;
      const v = Number((state >> shift) & POS_MASK);
      pieces.push({ w: g.w, h: g.h, x: v % COLS, y: Math.floor(v / COLS) });
    }
  }
  return pieces;
}

function rectOverlap(a: SolverPiece, b: SolverPiece): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function isSolved(state: bigint): boolean {
  return (state & (POS_MASK << GROUPS[0].offset)) === CAO_WIN_BITS;
}

function expand(state: bigint): { next: bigint; move: SolverMove }[] {
  const pieces = decode(state);
  const out: { next: bigint; move: SolverMove }[] = [];

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    for (const [dx, dy] of DIRS) {
      // 一步 = 该棋子沿此方向滑动任意格数（1..max，不限滑到底），
      // 每个可达落点都算一条后继，保证覆盖真正的最短块移动序列。
      let step = 1;
      while (true) {
        const nx = piece.x + dx * step;
        const ny = piece.y + dy * step;
        if (nx < 0 || ny < 0 || nx + piece.w > COLS || ny + piece.h > ROWS) break;

        const moved: SolverPiece = { ...piece, x: nx, y: ny };
        let clash = false;
        for (let j = 0; j < pieces.length; j++) {
          if (j === i) continue;
          if (rectOverlap(moved, pieces[j])) {
            clash = true;
            break;
          }
        }
        if (clash) break;

        const nextPieces = [...pieces];
        nextPieces[i] = moved;
        out.push({
          next: encode(nextPieces),
          move: {
            kind: 'move',
            w: piece.w,
            h: piece.h,
            from: { x: piece.x, y: piece.y },
            to: { x: nx, y: ny },
          },
        });

        step++;
      }
    }
  }
  return out;
}

/** 含可旋转棋块的状态键；同类型、同朝向棋块交换位置视为同一局面。 */
function genericStateKey(pieces: Piece[]): string {
  const groups = new Map<string, number[]>();
  for (const piece of pieces) {
    const orientation =
      piece.type === PieceType.HALF_DISC
        ? `:${getOrientation(piece)}`
        : piece.type === PieceType.THREE_QUARTER_DISC
          ? `:${getThreeQuarterOrientation(piece)}`
          : piece.type === PieceType.HANDSET
            ? `:${getHandsetOrientation(piece)}`
            : '';
    const group = `${piece.type}${orientation}`;
    const positions = groups.get(group) ?? [];
    positions.push(posValue(piece.x, piece.y));
    groups.set(group, positions);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, positions]) => `${group}=${positions.sort((a, b) => a - b).join(',')}`)
    .join('|');
}

function expandGeneric(pieces: Piece[]): { next: Piece[]; action: SolverAction }[] {
  const out: { next: Piece[]; action: SolverAction }[] = [];

  for (const piece of pieces) {
    const size = getSize(piece);
    for (const axis of ['x', 'y'] as const) {
      const range = computeRange(pieces, piece, axis);
      const start = axis === 'x' ? piece.x : piece.y;
      for (let target = range.min; target <= range.max; target++) {
        if (target === start) continue;
        const next = movePiece(pieces, piece.id, axis, target);
        const moved = next.find((candidate) => candidate.id === piece.id)!;
        out.push({
          next,
          action: {
            kind: 'move',
            w: size.w,
            h: size.h,
            from: { x: piece.x, y: piece.y },
            to: { x: moved.x, y: moved.y },
          },
        });
      }
    }

    if (piece.type !== PieceType.HALF_DISC && piece.type !== PieceType.THREE_QUARTER_DISC) {
      continue;
    }
    for (const direction of ['clockwise', 'counterclockwise'] as const) {
      const next = rotatePiece(pieces, piece.id, direction);
      if (!next) continue;
      out.push({
        next,
        action: {
          kind: 'rotate',
          pieceType: piece.type,
          from: { x: piece.x, y: piece.y },
          orientation:
            piece.type === PieceType.HALF_DISC
              ? getOrientation(piece)
              : getThreeQuarterOrientation(piece),
          direction,
        },
      });
    }
  }

  for (const piece of pieces) {
    if (piece.type !== PieceType.HANDSET) continue;
    for (const pivot of ['start', 'end'] as const) {
      for (const direction of ['clockwise', 'counterclockwise'] as const) {
        const next = turnHandset(pieces, piece.id, pivot, direction);
        if (!next) continue;
        out.push({
          next,
          action: {
            kind: 'corner-turn',
            from: { x: piece.x, y: piece.y },
            orientation: getHandsetOrientation(piece),
            pivot,
            direction,
          },
        });
      }
    }
  }

  return out;
}

function solveGeneric(input: Piece[]): SolverAction[] | null {
  const startPieces = input.map((piece) => ({ ...piece }));
  const startKey = genericStateKey(startPieces);
  const queue: { key: string; pieces: Piece[] }[] = [{ key: startKey, pieces: startPieces }];
  const visited = new Set<string>([startKey]);
  const parent = new Map<string, { previous: string; action: SolverAction }>();
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const { next, action } of expandGeneric(current.pieces)) {
      const key = genericStateKey(next);
      if (visited.has(key)) continue;
      visited.add(key);
      parent.set(key, { previous: current.key, action });

      if (isWin(next)) {
        const actions: SolverAction[] = [];
        let node = key;
        while (node !== startKey) {
          const entry = parent.get(node)!;
          actions.push(entry.action);
          node = entry.previous;
        }
        return actions.reverse();
      }

      queue.push({ key, pieces: next });
    }
  }

  return null;
}

/** 求华容道最短解；旋转/转角与沿单轴滑动任意距离均各算一步。 */
export function solveKlotski(input: Piece[]): SolverAction[] | null {
  if (isWin(input)) return [];
  if (!supportsCompactEncoding(input)) {
    return solveGeneric(input);
  }

  const start = encode(input.map((p) => ({ ...getSize(p), x: p.x, y: p.y })));
  const queue: bigint[] = [start];
  const parent = new Map<bigint, bigint>();
  const moveTo = new Map<bigint, SolverMove>();
  let head = 0;

  while (head < queue.length) {
    const current = queue[head++];
    for (const { next, move } of expand(current)) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      moveTo.set(next, move);

      if (isSolved(next)) {
        const moves: SolverAction[] = [];
        let node = next;
        while (node !== start) {
          moves.push(moveTo.get(node)!);
          node = parent.get(node)!;
        }
        return moves.reverse();
      }

      queue.push(next);
    }
  }

  return null;
}
