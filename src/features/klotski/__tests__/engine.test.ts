import { describe, expect, test } from 'vitest';
import { PieceType } from '../types';
import type { Piece } from '../types';
import { computeRange, getSize, isWin, movePiece, overlaps } from '../engine';

function piece(id: string, type: Piece['type'], x: number, y: number): Piece {
  return { id, type, x, y };
}

describe('getSize', () => {
  test('返回各棋块的占用尺寸', () => {
    expect(getSize(piece('a', PieceType.CAOCAO, 0, 0))).toEqual({ w: 2, h: 2 });
    expect(getSize(piece('b', PieceType.GENERAL_H, 0, 0))).toEqual({ w: 2, h: 1 });
    expect(getSize(piece('c', PieceType.GENERAL_V, 0, 0))).toEqual({ w: 1, h: 2 });
    expect(getSize(piece('d', PieceType.SOLDIER, 0, 0))).toEqual({ w: 1, h: 1 });
  });
});

describe('overlaps', () => {
  test('两块占据同一格时重叠', () => {
    expect(overlaps(piece('a', PieceType.SOLDIER, 1, 1), piece('b', PieceType.SOLDIER, 1, 1))).toBe(
      true,
    );
  });

  test('沿边界相触不视为重叠', () => {
    expect(
      overlaps(piece('a', PieceType.SOLDIER, 1, 1), piece('b', PieceType.GENERAL_H, 1, 2)),
    ).toBe(false);
  });

  test('水平分离不重叠', () => {
    expect(overlaps(piece('a', PieceType.SOLDIER, 0, 0), piece('b', PieceType.SOLDIER, 3, 0))).toBe(
      false,
    );
  });

  test('大块覆盖小块时重叠', () => {
    expect(
      overlaps(piece('cao', PieceType.CAOCAO, 0, 0), piece('s', PieceType.SOLDIER, 1, 1)),
    ).toBe(true);
  });
});

describe('computeRange', () => {
  test('空棋盘上单块可沿整条轴线移动', () => {
    const pieces = [piece('s', PieceType.SOLDIER, 0, 0)];
    expect(computeRange(pieces, pieces[0], 'x')).toEqual({ min: 0, max: 3 });
    expect(computeRange(pieces, pieces[0], 'y')).toEqual({ min: 0, max: 4 });
  });

  test('竖块挡在左侧时水平范围被压缩', () => {
    // 竖块占 (0,0)-(0,1)，目标块在 (3,1)：向左最远只能到 x=1
    const blocker = piece('v', PieceType.GENERAL_V, 0, 0);
    const target = piece('s', PieceType.SOLDIER, 3, 1);
    expect(computeRange([blocker, target], target, 'x')).toEqual({ min: 1, max: 3 });
  });

  test('2x2 大块被边界限制移动范围', () => {
    const pieces = [piece('cao', PieceType.CAOCAO, 1, 0)];
    expect(computeRange(pieces, pieces[0], 'x')).toEqual({ min: 0, max: 2 });
    expect(computeRange(pieces, pieces[0], 'y')).toEqual({ min: 0, max: 3 });
  });
});

describe('movePiece', () => {
  test('沿 x 轴移动到目标位置', () => {
    const pieces = [piece('a', PieceType.SOLDIER, 0, 0)];
    const moved = movePiece(pieces, 'a', 'x', 3);
    expect(moved[0]).toMatchObject({ x: 3, y: 0 });
  });

  test('沿 y 轴移动到目标位置', () => {
    const pieces = [piece('a', PieceType.SOLDIER, 0, 0)];
    const moved = movePiece(pieces, 'a', 'y', 4);
    expect(moved[0]).toMatchObject({ x: 0, y: 4 });
  });

  test('目标越界时 clamps 到合法范围', () => {
    const pieces = [piece('a', PieceType.CAOCAO, 0, 0)];
    const moved = movePiece(pieces, 'a', 'x', 99);
    expect(moved[0].x).toBe(2);
  });

  test('未被碰撞的其他块保持不变', () => {
    const pieces = [piece('a', PieceType.SOLDIER, 0, 0), piece('b', PieceType.SOLDIER, 3, 3)];
    const moved = movePiece(pieces, 'a', 'x', 3);
    expect(moved[1]).toMatchObject({ x: 3, y: 3 });
  });

  test('不修改原数组', () => {
    const pieces = [piece('a', PieceType.SOLDIER, 0, 0)];
    movePiece(pieces, 'a', 'x', 3);
    expect(pieces[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('isWin', () => {
  test('曹操未到达出口时为 false', () => {
    const pieces = [piece('cao', PieceType.CAOCAO, 1, 0)];
    expect(isWin(pieces)).toBe(false);
  });

  test('曹操左上角到达出口时为 true', () => {
    const pieces = [piece('cao', PieceType.CAOCAO, 1, 3)];
    expect(isWin(pieces)).toBe(true);
  });
});
