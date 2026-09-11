import { describe, expect, test } from 'vitest';
import { Orientation, PieceType, type Piece } from '../types';
import { discCenter, getSize, rotatePiece } from '../engine';

function piece(
  id: string,
  type: Piece['type'],
  x: number,
  y: number,
  orientation?: Piece['orientation'],
): Piece {
  return { id, type, x, y, orientation };
}

describe('discCenter 半圆块圆心', () => {
  test.each([
    [Orientation.RIGHT, 2, 1, { x: 2, y: 2 }],
    [Orientation.DOWN, 1, 2, { x: 2, y: 2 }],
    [Orientation.LEFT, 1, 1, { x: 2, y: 2 }],
    [Orientation.UP, 1, 1, { x: 2, y: 2 }],
  ])('%s 朝向得到正确圆心', (orientation, x, y, center) => {
    expect(discCenter(piece('d', PieceType.HALF_DISC, x, y, orientation))).toEqual(center);
  });
});

describe('getSize 半圆块', () => {
  test.each([
    [Orientation.RIGHT, { w: 1, h: 2 }],
    [Orientation.DOWN, { w: 2, h: 1 }],
    [Orientation.LEFT, { w: 1, h: 2 }],
    [Orientation.UP, { w: 2, h: 1 }],
  ])('%s 朝向占用正确外接框', (orientation, size) => {
    expect(getSize(piece('d', PieceType.HALF_DISC, 0, 0, orientation))).toEqual(size);
  });

  test('未声明朝向时默认向右', () => {
    expect(getSize(piece('d', PieceType.HALF_DISC, 0, 0))).toEqual({ w: 1, h: 2 });
  });
});

describe('rotatePiece 绕圆心旋转 90°', () => {
  test('顺时针旋转四次才回到原位', () => {
    let pieces = [piece('d', PieceType.HALF_DISC, 2, 1, Orientation.RIGHT)];
    const expected = [
      { x: 1, y: 2, orientation: Orientation.DOWN },
      { x: 1, y: 1, orientation: Orientation.LEFT },
      { x: 1, y: 1, orientation: Orientation.UP },
      { x: 2, y: 1, orientation: Orientation.RIGHT },
    ];

    for (const state of expected) {
      pieces = rotatePiece(pieces, 'd', 'clockwise')!;
      expect(pieces[0]).toMatchObject(state);
      expect(discCenter(pieces[0])).toEqual({ x: 2, y: 2 });
    }
  });

  test('支持逆时针旋转', () => {
    const pieces = [piece('d', PieceType.HALF_DISC, 2, 1, Orientation.RIGHT)];
    const rotated = rotatePiece(pieces, 'd', 'counterclockwise');
    expect(rotated![0]).toMatchObject({ x: 1, y: 1, orientation: Orientation.UP });
  });

  test('位于左边界时不能转成横向', () => {
    const pieces = [piece('d', PieceType.HALF_DISC, 0, 1, Orientation.RIGHT)];
    expect(rotatePiece(pieces, 'd', 'clockwise')).toBeNull();
    expect(rotatePiece(pieces, 'd', 'counterclockwise')).toBeNull();
  });

  test('目标占用格被其它块挡住时不能旋转', () => {
    const disc = piece('d', PieceType.HALF_DISC, 2, 1, Orientation.RIGHT);
    const blocker = piece('s', PieceType.SOLDIER, 1, 2);
    expect(rotatePiece([disc, blocker], 'd', 'clockwise')).toBeNull();
  });

  test('拐角外侧有障碍时仍可绕圆心转过内侧空位', () => {
    const disc = piece('d', PieceType.HALF_DISC, 2, 1, Orientation.RIGHT);
    const outsideCorner = piece('s', PieceType.SOLDIER, 1, 1);
    const rotated = rotatePiece([disc, outsideCorner], 'd', 'clockwise');
    expect(rotated).not.toBeNull();
    expect(rotated![0]).toMatchObject({ x: 1, y: 2, orientation: Orientation.DOWN });
  });

  test('非半圆块返回 null', () => {
    const pieces = [piece('cao', PieceType.CAOCAO, 0, 0)];
    expect(rotatePiece(pieces, 'cao')).toBeNull();
  });

  test('不修改原数组', () => {
    const pieces = [piece('d', PieceType.HALF_DISC, 2, 1, Orientation.RIGHT)];
    rotatePiece(pieces, 'd');
    expect(pieces[0]).toMatchObject({ x: 2, y: 1, orientation: Orientation.RIGHT });
  });
});
