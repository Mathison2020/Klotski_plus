import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Piece as PieceView } from '../components/Piece';
import {
  computeRange,
  getOccupiedArea,
  getOccupiedCells,
  getSize,
  overlaps,
  rotatePiece,
} from '../engine';
import { PieceType, ThreeQuarterOrientation, type Piece } from '../types';

const handlers = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onPointerCancel: vi.fn(),
};

function threeQuarter(
  orientation: Piece['threeQuarterOrientation'] = ThreeQuarterOrientation.TOP_RIGHT,
): Piece {
  return {
    id: 'three-quarter',
    type: PieceType.THREE_QUARTER_DISC,
    x: 0,
    y: 0,
    threeQuarterOrientation: orientation,
  };
}

describe('3/4圆块规则', () => {
  test('外接框为 2×2，但只占缺口以外的三个格', () => {
    const piece = threeQuarter();
    expect(getSize(piece)).toEqual({ w: 2, h: 2 });
    expect(getOccupiedArea(piece)).toBe(3);
    expect(getOccupiedCells(piece)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  test('其他棋块可以位于缺口中，并会阻止占入该格的旋转或平移', () => {
    const piece = threeQuarter();
    const inOpening: Piece = { id: 'soldier', type: PieceType.SOLDIER, x: 1, y: 0 };

    expect(overlaps(piece, inOpening)).toBe(false);
    expect(rotatePiece([piece, inOpening], piece.id, 'clockwise')).toBeNull();
    expect(computeRange([piece, inOpening], piece, 'x')).toEqual({ min: 0, max: 0 });
    expect(computeRange([piece, inOpening], piece, 'y').max).toBe(3);
  });

  test('以左上角不变的方式原地旋转，四次后回到原朝向', () => {
    let pieces = [threeQuarter()];
    const orientations = [
      ThreeQuarterOrientation.BOTTOM_RIGHT,
      ThreeQuarterOrientation.BOTTOM_LEFT,
      ThreeQuarterOrientation.TOP_LEFT,
      ThreeQuarterOrientation.TOP_RIGHT,
    ];

    for (const threeQuarterOrientation of orientations) {
      pieces = rotatePiece(pieces, pieces[0].id, 'clockwise')!;
      expect(pieces[0]).toMatchObject({ x: 0, y: 0, threeQuarterOrientation });
    }
  });
});

describe('3/4圆块渲染', () => {
  test('按缺口朝向绘制并支持旋转预览', () => {
    const view = render(
      <PieceView
        piece={threeQuarter(ThreeQuarterOrientation.BOTTOM_RIGHT)}
        renderX={1}
        renderY={2}
        selected
        dragging
        rotationDegrees={30}
        {...handlers}
      />,
    );

    const element = view.getByLabelText('3/4圆块');
    expect(element.style.left).toBe('25%');
    expect(element.style.top).toBe('40%');
    expect(element.style.transform).toBe('rotate(120deg)');
    expect(element.style.clipPath).toContain('50% 50%');
    expect(element.querySelector('path')?.getAttribute('stroke')).toBe('var(--ring)');
  });
});
