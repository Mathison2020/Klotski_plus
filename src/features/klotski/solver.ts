/**
 * 华容道最短步求解器。
 *
 * 核心思路：
 * - 经典关卡保留紧凑的 BigInt 状态编码和同形规范化，避免影响已确认的 90 步结果与性能。
 * - 含异形块的关卡使用紧凑 BigInt 状态编码，把半圆、3/4 圆和听筒朝向纳入状态。
 * - 搜索：经典布局使用 BFS；通用布局使用保持最短解的 A*，优先探索更接近出口的状态。
 * - 回溯：parent 链 + 逐步 move 记录，反向拼出解序列。
 *
 * 计数口径说明：华容道不同资料对「步」定义不一（移动一格 / 滑动任意距离 / 滑到底）。
 * 本实现采用「一块棋子沿一个方向滑动任意距离 = 一步」这一主流口径。
 */

import {
  getHandsetOrientation,
  getOccupiedCells,
  getOrientation,
  getSize,
  getThreeQuarterOrientation,
  handsetTurnDirection,
  isWin,
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

const GENERIC_TOKEN_BITS = 10n;
const PIECE_TYPE_INDEX = new Map(
  Object.values(PieceType).map((pieceType, index) => [pieceType, index] as const),
);
const HALF_ORIENTATIONS = ['right', 'down', 'left', 'up'] as const;
const THREE_QUARTER_ORIENTATIONS = [
  'top-right',
  'bottom-right',
  'bottom-left',
  'top-left',
] as const;
const HANDSET_ORIENTATIONS = ['up', 'right', 'down', 'left'] as const;

/** 含可旋转棋块的紧凑状态键；同类型、同朝向棋块交换位置视为同一局面。 */
function genericStateKey(pieces: Piece[]): bigint {
  const tokens: number[] = [];
  for (const piece of pieces) {
    const orientationIndex =
      piece.type === PieceType.HALF_DISC
        ? HALF_ORIENTATIONS.indexOf(getOrientation(piece))
        : piece.type === PieceType.THREE_QUARTER_DISC
          ? THREE_QUARTER_ORIENTATIONS.indexOf(getThreeQuarterOrientation(piece))
          : piece.type === PieceType.HANDSET
            ? HANDSET_ORIENTATIONS.indexOf(getHandsetOrientation(piece))
            : 0;
    const typeIndex = PIECE_TYPE_INDEX.get(piece.type)!;
    const group = typeIndex * 4 + orientationIndex;
    tokens.push(group * (COLS * ROWS) + posValue(piece.x, piece.y));
  }

  tokens.sort((a, b) => a - b);
  let key = 0n;
  for (const token of tokens) key = (key << GENERIC_TOKEN_BITS) | BigInt(token + 1);
  return key;
}

function occupiedMask(piece: Piece): number {
  let mask = 0;
  for (const cell of getOccupiedCells(piece)) mask |= 1 << posValue(cell.x, cell.y);
  return mask;
}

interface CachedShapeTransition {
  target: Piece;
  blockingMask: number;
}

const halfRotationCache = new Map<string, CachedShapeTransition | null>();
const handsetTurnCache = new Map<string, CachedShapeTransition | null>();

/**
 * 旋转扫掠与其它棋块的具体 id 无关，只取决于被占用的单位格。
 * 棋盘仅 20 格，因此首次遇到一种姿态时用单格阻挡物求出扫掠遮罩，后续 O(1) 判定。
 */
function cachedHalfRotation(
  piece: Piece,
  direction: RotationDirection,
): CachedShapeTransition | null {
  const key = `${piece.x},${piece.y},${getOrientation(piece)},${direction}`;
  const cached = halfRotationCache.get(key);
  if (cached !== undefined) return cached;

  const source: Piece = { ...piece, id: '__solver-moving-half' };
  const alone = rotatePiece([source], source.id, direction);
  const target = alone?.[0];
  if (!target) {
    halfRotationCache.set(key, null);
    return null;
  }

  let blockingMask = 0;
  for (let position = 0; position < COLS * ROWS; position++) {
    const blocker: Piece = {
      id: '__solver-blocker',
      type: PieceType.SOLDIER,
      x: position % COLS,
      y: Math.floor(position / COLS),
    };
    if (!rotatePiece([source, blocker], source.id, direction)) blockingMask |= 1 << position;
  }
  const transition = { target, blockingMask };
  halfRotationCache.set(key, transition);
  return transition;
}

function cachedHandsetTurn(piece: Piece, pivot: HandsetPivot): CachedShapeTransition | null {
  const direction = handsetTurnDirection(piece, pivot);
  const key = `${piece.x},${piece.y},${getHandsetOrientation(piece)},${pivot}`;
  const cached = handsetTurnCache.get(key);
  if (cached !== undefined) return cached;

  const source: Piece = { ...piece, id: '__solver-moving-handset' };
  const alone = turnHandset([source], source.id, pivot, direction);
  const target = alone?.[0];
  if (!target) {
    handsetTurnCache.set(key, null);
    return null;
  }

  let blockingMask = 0;
  for (let position = 0; position < COLS * ROWS; position++) {
    const blocker: Piece = {
      id: '__solver-blocker',
      type: PieceType.SOLDIER,
      x: position % COLS,
      y: Math.floor(position / COLS),
    };
    if (!turnHandset([source, blocker], source.id, pivot, direction)) blockingMask |= 1 << position;
  }
  const transition = { target, blockingMask };
  handsetTurnCache.set(key, transition);
  return transition;
}

function expandGeneric(pieces: Piece[]): { next: Piece[]; action: SolverAction }[] {
  const out: { next: Piece[]; action: SolverAction }[] = [];
  const masks = pieces.map(occupiedMask);
  const allOccupied = masks.reduce((mask, pieceMask) => mask | pieceMask, 0);

  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    const size = getSize(piece);
    const otherOccupied = allOccupied ^ masks[index];
    for (const [dx, dy] of DIRS) {
      for (let distance = 1; ; distance++) {
        const x = piece.x + dx * distance;
        const y = piece.y + dy * distance;
        if (x < 0 || y < 0 || x + size.w > COLS || y + size.h > ROWS) break;
        const moved = { ...piece, x, y };
        if ((occupiedMask(moved) & otherOccupied) !== 0) break;
        const next = [...pieces];
        next[index] = moved;
        out.push({
          next,
          action: {
            kind: 'move',
            w: size.w,
            h: size.h,
            from: { x: piece.x, y: piece.y },
            to: { x, y },
          },
        });
      }
    }

    if (piece.type !== PieceType.HALF_DISC && piece.type !== PieceType.THREE_QUARTER_DISC) {
      continue;
    }
    for (const direction of ['clockwise', 'counterclockwise'] as const) {
      let next: Piece[] | null;
      if (piece.type === PieceType.HALF_DISC) {
        const transition = cachedHalfRotation(piece, direction);
        if (!transition || (transition.blockingMask & otherOccupied) !== 0) continue;
        next = [...pieces];
        next[index] = { ...piece, ...transition.target, id: piece.id };
      } else {
        next = rotatePiece(pieces, piece.id, direction);
        if (!next) continue;
      }
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

  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    if (piece.type !== PieceType.HANDSET) continue;
    const otherOccupied = allOccupied ^ masks[index];
    for (const pivot of ['start', 'end'] as const) {
      const direction = handsetTurnDirection(piece, pivot);
      const transition = cachedHandsetTurn(piece, pivot);
      if (!transition || (transition.blockingMask & otherOccupied) !== 0) continue;
      const next = [...pieces];
      next[index] = { ...piece, ...transition.target, id: piece.id };
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

  return out;
}

interface GenericSearchNode {
  key: bigint;
  pieces: Piece[];
  distance: number;
  estimate: number;
  order: number;
}

/** 二叉最小堆；同一估值下优先更深的节点，尽早在当前最优层内找到出口。 */
class GenericMinHeap {
  private readonly values: GenericSearchNode[] = [];

  get size(): number {
    return this.values.length;
  }

  private before(a: GenericSearchNode, b: GenericSearchNode): boolean {
    if (a.estimate !== b.estimate) return a.estimate < b.estimate;
    if (a.distance !== b.distance) return a.distance > b.distance;
    return a.order < b.order;
  }

  push(node: GenericSearchNode): void {
    const values = this.values;
    values.push(node);
    let index = values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.before(values[parent], node)) break;
      values[index] = values[parent];
      index = parent;
    }
    values[index] = node;
  }

  pop(): GenericSearchNode {
    const values = this.values;
    const root = values[0];
    const tail = values.pop()!;
    if (values.length === 0) return root;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= values.length) break;
      const right = left + 1;
      const child =
        right < values.length && this.before(values[right], values[left]) ? right : left;
      if (this.before(tail, values[child])) break;
      values[index] = values[child];
      index = child;
    }
    values[index] = tail;
    return root;
  }
}

/** 忽略碰撞后，曹操抵达出口至少需要分别修正横、纵坐标；该启发值可采纳且一致。 */
function genericHeuristic(pieces: Piece[]): number {
  const caocao = pieces.find((piece) => piece.type === PieceType.CAOCAO);
  if (!caocao) return 0;
  return Number(caocao.x !== 1) + Number(caocao.y !== 3);
}

function solveGeneric(input: Piece[]): SolverAction[] | null {
  const startPieces = input.map((piece) => ({ ...piece }));
  const startKey = genericStateKey(startPieces);
  const queue = new GenericMinHeap();
  queue.push({
    key: startKey,
    pieces: startPieces,
    distance: 0,
    estimate: genericHeuristic(startPieces),
    order: 0,
  });
  const bestDistance = new Map<bigint, number>([[startKey, 0]]);
  const parent = new Map<bigint, { previous: bigint; action: SolverAction }>();
  let order = 1;

  while (queue.size > 0) {
    const current = queue.pop();
    if (bestDistance.get(current.key) !== current.distance) continue;
    if (isWin(current.pieces)) {
      const actions: SolverAction[] = [];
      let node = current.key;
      while (node !== startKey) {
        const entry = parent.get(node)!;
        actions.push(entry.action);
        node = entry.previous;
      }
      return actions.reverse();
    }

    for (const { next, action } of expandGeneric(current.pieces)) {
      const key = genericStateKey(next);
      const distance = current.distance + 1;
      if ((bestDistance.get(key) ?? Number.POSITIVE_INFINITY) <= distance) continue;
      bestDistance.set(key, distance);
      parent.set(key, { previous: current.key, action });
      queue.push({
        key,
        pieces: next,
        distance,
        estimate: distance + genericHeuristic(next),
        order: order++,
      });
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
