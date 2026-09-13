import { describe, expect, test } from 'vitest';
import {
  DOUBLE_MOON_SPIN,
  EMPTY_BLUSTER,
  FOUR_MOON_GATE,
  HENG_DAO_LI_MA,
  LAYOUTS,
  THREE_QUARTER_SANDBOX,
} from '../layouts';
import { solveKlotski, type SolverAction } from '../solver';
import {
  getHandsetOrientation,
  getOccupiedArea,
  getOrientation,
  getSize,
  getThreeQuarterOrientation,
  isWin,
  overlaps,
  rotatePiece,
  turnHandset,
} from '../engine';
import { BOARD_COLS, BOARD_ROWS } from '../constants';
import {
  HandsetOrientation,
  Orientation,
  PieceType,
  ThreeQuarterOrientation,
  type Piece,
} from '../types';

/** 回放求解动作，并逐步校验平移路径和旋转是否合法。 */
function applyMoves(pieces: Piece[], moves: SolverAction[]): Piece[] {
  let state = pieces.map((p) => ({ ...p }));

  for (const m of moves) {
    if (m.kind === 'rotate') {
      const piece = state.find(
        (candidate) =>
          candidate.type === m.pieceType &&
          candidate.x === m.from.x &&
          candidate.y === m.from.y &&
          (candidate.type === PieceType.HALF_DISC
            ? getOrientation(candidate)
            : getThreeQuarterOrientation(candidate)) === m.orientation,
      );
      expect(piece, '旋转来源棋块必须存在').toBeDefined();
      const rotated = rotatePiece(state, piece!.id, m.direction);
      expect(rotated, '旋转动作必须满足边界与碰撞约束').not.toBeNull();
      state = rotated!;
      continue;
    }

    if (m.kind === 'corner-turn') {
      const piece = state.find(
        (candidate) =>
          candidate.type === PieceType.HANDSET &&
          candidate.x === m.from.x &&
          candidate.y === m.from.y &&
          getHandsetOrientation(candidate) === m.orientation,
      );
      expect(piece, '转角来源听筒块必须存在').toBeDefined();
      const turned = turnHandset(state, piece!.id, m.pivot, m.direction);
      expect(turned, '转角动作必须满足边界与碰撞约束').not.toBeNull();
      state = turned!;
      continue;
    }

    const index = state.findIndex((p) => {
      const size = getSize(p);
      return size.w === m.w && size.h === m.h && p.x === m.from.x && p.y === m.from.y;
    });
    expect(index, '移动来源棋块必须存在').toBeGreaterThanOrEqual(0);

    const dx = Math.sign(m.to.x - m.from.x);
    const dy = Math.sign(m.to.y - m.from.y);
    // 单轴直线移动
    expect((dx === 0) !== (dy === 0)).toBe(true);

    // 从 from 沿方向逐格走到 to，每步都不越界、不与其他块重叠
    let x = m.from.x;
    let y = m.from.y;
    const size = getSize(state[index]);
    while (x !== m.to.x || y !== m.to.y) {
      x += dx;
      y += dy;
      const mid: Piece = { ...state[index], x, y };
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + size.w).toBeLessThanOrEqual(BOARD_COLS);
      expect(y + size.h).toBeLessThanOrEqual(BOARD_ROWS);
      const others = state.filter((_, j) => j !== index);
      expect(others.every((o) => !overlaps(mid, o))).toBe(true);
    }

    state[index] = { ...state[index], x: m.to.x, y: m.to.y };
  }

  return state;
}

describe('solveKlotski', () => {
  test('横刀立马返回最短解（滑动任意距离 = 一步）', () => {
    const moves = solveKlotski(HENG_DAO_LI_MA.pieces);
    expect(moves).not.toBeNull();
    // 本实现口径：一块棋子沿一个方向滑动任意距离 = 一步。
    // 该口径下横刀立马的最短解为 90 步（经三个相互独立的 BFS 实现交叉验证一致）。
    expect(moves!.length).toBe(90);
  });

  test('解序列逐步回放合法且最终获胜', () => {
    const moves = solveKlotski(HENG_DAO_LI_MA.pieces);
    expect(moves).not.toBeNull();
    const solved = applyMoves(HENG_DAO_LI_MA.pieces, moves!);
    expect(isWin(solved)).toBe(true);
  });

  test('已获胜局面返回空序列', () => {
    const wonPiece: Piece = { id: 'caocao', type: PieceType.CAOCAO, x: 1, y: 3 };
    expect(solveKlotski([wonPiece])).toEqual([]);
  });

  test('含3/4圆块的盘面使用通用求解器并可正确回放', () => {
    const pieces: Piece[] = [
      { id: 'caocao', type: PieceType.CAOCAO, x: 1, y: 2 },
      {
        id: 'three-quarter',
        type: PieceType.THREE_QUARTER_DISC,
        x: 0,
        y: 0,
        threeQuarterOrientation: ThreeQuarterOrientation.TOP_RIGHT,
      },
    ];

    const moves = solveKlotski(pieces);
    expect(moves).not.toBeNull();
    expect(isWin(applyMoves(pieces, moves!))).toBe(true);
  });

  test('多异形块且有五个空位的局面可以快速求出最短解', () => {
    const pieces: Piece[] = [
      { id: 'cao', type: PieceType.CAOCAO, x: 0, y: 0 },
      {
        id: 'quarter',
        type: PieceType.THREE_QUARTER_DISC,
        x: 2,
        y: 0,
        threeQuarterOrientation: ThreeQuarterOrientation.TOP_LEFT,
      },
      { id: 'half-a', type: PieceType.HALF_DISC, x: 0, y: 2, orientation: Orientation.DOWN },
      { id: 'half-b', type: PieceType.HALF_DISC, x: 2, y: 2, orientation: Orientation.DOWN },
      {
        id: 'handset',
        type: PieceType.HANDSET,
        x: 0,
        y: 3,
        handsetOrientation: HandsetOrientation.UP,
      },
      { id: 'soldier', type: PieceType.SOLDIER, x: 3, y: 3 },
    ];

    const started = performance.now();
    const moves = solveKlotski(pieces);
    const elapsed = performance.now() - started;

    expect(moves).toHaveLength(11);
    expect(isWin(applyMoves(pieces, moves!))).toBe(true);
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe('预设关卡', () => {
  test('双月回旋只留两格空位且最短解为 51 步', () => {
    const occupiedArea = DOUBLE_MOON_SPIN.pieces.reduce(
      (area, piece) => area + getOccupiedArea(piece),
      0,
    );
    const moves = solveKlotski(DOUBLE_MOON_SPIN.pieces);

    expect(occupiedArea).toBe(BOARD_COLS * BOARD_ROWS - 2);
    expect(moves).toHaveLength(51);
    expect(isWin(applyMoves(DOUBLE_MOON_SPIN.pieces, moves!))).toBe(true);
  });

  test('缺月重围只留两格空位且需要旋转3/4圆才能以最短路径通关', () => {
    const occupiedArea = THREE_QUARTER_SANDBOX.pieces.reduce(
      (area, piece) => area + getOccupiedArea(piece),
      0,
    );
    const moves = solveKlotski(THREE_QUARTER_SANDBOX.pieces);

    expect(occupiedArea).toBe(BOARD_COLS * BOARD_ROWS - 2);
    expect(moves).not.toBeNull();
    expect(moves).toHaveLength(59);
    expect(
      moves!.some(
        (move) => move.kind === 'rotate' && move.pieceType === PieceType.THREE_QUARTER_DISC,
      ),
    ).toBe(true);
    expect(isWin(applyMoves(THREE_QUARTER_SANDBOX.pieces, moves!))).toBe(true);
  });

  test.each([
    { layout: FOUR_MOON_GATE, shortest: 41 },
    { layout: EMPTY_BLUSTER, shortest: 27 },
  ])('新增预设「$layout.name」只留两格且最短解为 $shortest 步', ({ layout, shortest }) => {
    const occupiedArea = layout.pieces.reduce((area, piece) => area + getOccupiedArea(piece), 0);
    const moves = solveKlotski(layout.pieces);

    expect(occupiedArea).toBe(BOARD_COLS * BOARD_ROWS - 2);
    expect(moves).toHaveLength(shortest);
    expect(isWin(applyMoves(layout.pieces, moves!))).toBe(true);
  });

  test('所有预设关卡都只留下两格自由空间', () => {
    for (const layout of LAYOUTS) {
      const occupiedArea = layout.pieces.reduce((area, piece) => {
        const size = getSize(piece);
        expect(piece.x, `关卡「${layout.name}」棋块不得越过左边界`).toBeGreaterThanOrEqual(0);
        expect(piece.y, `关卡「${layout.name}」棋块不得越过上边界`).toBeGreaterThanOrEqual(0);
        expect(piece.x + size.w, `关卡「${layout.name}」棋块不得越过右边界`).toBeLessThanOrEqual(
          BOARD_COLS,
        );
        expect(piece.y + size.h, `关卡「${layout.name}」棋块不得越过下边界`).toBeLessThanOrEqual(
          BOARD_ROWS,
        );
        return area + getOccupiedArea(piece);
      }, 0);
      expect(occupiedArea, `关卡「${layout.name}」应占用 18 格`).toBe(BOARD_COLS * BOARD_ROWS - 2);
      for (let index = 0; index < layout.pieces.length; index++) {
        for (let other = index + 1; other < layout.pieces.length; other++) {
          expect(
            overlaps(layout.pieces[index], layout.pieces[other]),
            `关卡「${layout.name}」初始棋块不得重叠`,
          ).toBe(false);
        }
      }
    }
  });

  test('所有预设关卡均可解且解序列可以合法回放', () => {
    for (const layout of LAYOUTS) {
      const moves = solveKlotski(layout.pieces);
      expect(moves, `关卡「${layout.name}」应可解`).not.toBeNull();
      expect(moves!.length, `关卡「${layout.name}」步数应大于 0`).toBeGreaterThan(0);
      if (
        layout.pieces.some(
          (piece) =>
            piece.type === PieceType.HALF_DISC ||
            piece.type === PieceType.THREE_QUARTER_DISC ||
            piece.type === PieceType.HANDSET,
        )
      ) {
        expect(moves!.length, `关卡「${layout.name}」应具有足够的解题深度`).toBeGreaterThanOrEqual(
          20,
        );
      }
      expect(isWin(applyMoves(layout.pieces, moves!)), `关卡「${layout.name}」应正确通关`).toBe(
        true,
      );
      if (layout.pieces.some((piece) => piece.type === PieceType.HALF_DISC)) {
        expect(
          moves!.some((move) => move.kind === 'rotate'),
          `关卡「${layout.name}」应使用半圆旋转动作`,
        ).toBe(true);
      }
      if (layout.pieces.some((piece) => piece.type === PieceType.THREE_QUARTER_DISC)) {
        expect(
          moves!.some(
            (move) => move.kind === 'rotate' && move.pieceType === PieceType.THREE_QUARTER_DISC,
          ),
          `关卡「${layout.name}」应使用3/4圆旋转动作`,
        ).toBe(true);
      }
      if (layout.pieces.some((piece) => piece.type === PieceType.HANDSET)) {
        expect(
          moves!.some((move) => move.kind === 'corner-turn'),
          `关卡「${layout.name}」应使用听筒转角动作`,
        ).toBe(true);
      }
    }
  });
});
