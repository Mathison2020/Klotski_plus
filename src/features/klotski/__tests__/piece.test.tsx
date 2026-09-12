import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { Piece } from '../components/Piece';
import { HandsetOrientation, Orientation, PieceType } from '../types';

const handlers = {
  onPointerDown: vi.fn(),
  onPointerMove: vi.fn(),
  onPointerUp: vi.fn(),
  onPointerCancel: vi.fn(),
};

describe('半圆块渲染', () => {
  test('横放时围绕逻辑圆心定位，不会重复偏移', () => {
    const view = render(
      <Piece
        piece={{
          id: 'half',
          type: PieceType.HALF_DISC,
          x: 0,
          y: 4,
          orientation: Orientation.DOWN,
        }}
        renderX={0}
        renderY={4}
        selected={false}
        dragging={false}
        {...handlers}
      />,
    );

    const element = view.container.querySelector<HTMLElement>('[data-testid="piece-half"]')!;
    expect(element.style.left).toBe('25%');
    expect(element.style.top).toBe('60%');
    expect(element.style.transform).toBe('rotate(90deg)');
  });

  test('平移与旋转预览使用临时渲染值', () => {
    const view = render(
      <Piece
        piece={{
          id: 'half',
          type: PieceType.HALF_DISC,
          x: 1,
          y: 1,
          orientation: Orientation.RIGHT,
        }}
        renderX={1.5}
        renderY={2}
        selected={false}
        dragging
        rotationDegrees={35}
        {...handlers}
      />,
    );

    const element = view.container.querySelector<HTMLElement>('[data-testid="piece-half"]')!;
    expect(element.style.left).toBe('37.5%');
    expect(element.style.top).toBe('40%');
    expect(element.style.transform).toBe('rotate(35deg)');
  });

  test('选中高亮附着在半圆形状而不是矩形外接框', () => {
    const view = render(
      <Piece
        piece={{
          id: 'half',
          type: PieceType.HALF_DISC,
          x: 1,
          y: 1,
          orientation: Orientation.RIGHT,
        }}
        renderX={1}
        renderY={1}
        selected
        dragging={false}
        {...handlers}
      />,
    );

    const hitBox = view.container.querySelector<HTMLElement>('[data-testid="piece-half"]')!;
    const shape = view.container.querySelector<HTMLElement>('[data-testid="piece-half-shape"]')!;
    expect(hitBox.className).not.toContain('ring-2');
    expect(shape.className).toContain('ring-2');
    expect(shape.className).toContain('ring-ring');
    expect(shape.className).toContain('border-border');
    expect(shape.style.borderRadius).toContain('6px');
    expect(shape.style.borderRadius).toContain('100%');
  });
});

describe('棋块高亮', () => {
  test('普通棋块使用主题边框，选中后显示主题高亮环', () => {
    const view = render(
      <Piece
        piece={{ id: 'soldier', type: PieceType.SOLDIER, x: 0, y: 0 }}
        renderX={0}
        renderY={0}
        selected={false}
        dragging={false}
        {...handlers}
      />,
    );
    const shape = view.getByTestId('piece-soldier-shape');
    expect(shape.className).toContain('border');
    expect(shape.className).toContain('border-border');

    view.rerender(
      <Piece
        piece={{ id: 'soldier', type: PieceType.SOLDIER, x: 0, y: 0 }}
        renderX={0}
        renderY={0}
        selected
        dragging={false}
        {...handlers}
      />,
    );
    expect(shape.className).toContain('ring-2');
    expect(shape.className).toContain('ring-ring');
    expect(shape.className).toContain('ring-offset-1');
  });

  test('曹操也使用统一的主题高亮环', () => {
    const view = render(
      <Piece
        piece={{ id: 'caocao', type: PieceType.CAOCAO, x: 1, y: 0 }}
        renderX={1}
        renderY={0}
        selected
        dragging={false}
        {...handlers}
      />,
    );
    const shape = view.getByTestId('piece-caocao-shape');
    expect(shape.className).toContain('border-border');
    expect(shape.className).toContain('ring-2');
    expect(shape.className).toContain('ring-ring');
  });
});

describe('听筒块渲染', () => {
  test.each([
    [HandsetOrientation.LEFT, -90, '-180deg', HandsetOrientation.DOWN, '180deg'],
    [HandsetOrientation.DOWN, 90, '270deg', HandsetOrientation.LEFT, '-90deg'],
  ] as const)(
    '左向与下向双向切换时不对等价的 360° 角度差执行过渡',
    (sourceOrientation, rotationDegrees, previewAngle, targetOrientation, targetAngle) => {
      const view = render(
        <Piece
          piece={{
            id: 'handset',
            type: PieceType.HANDSET,
            x: 0,
            y: 0,
            handsetOrientation: sourceOrientation,
          }}
          renderX={0}
          renderY={0}
          selected={false}
          dragging
          rotationDegrees={rotationDegrees}
          {...handlers}
        />,
      );

      const element = view.container.querySelector<HTMLElement>('[data-testid="piece-handset"]')!;
      expect(element.style.transform).toBe(`rotate(${previewAngle})`);

      view.rerender(
        <Piece
          piece={{
            id: 'handset',
            type: PieceType.HANDSET,
            x: 0,
            y: 0,
            handsetOrientation: targetOrientation,
          }}
          renderX={0}
          renderY={0}
          selected={false}
          dragging={false}
          {...handlers}
        />,
      );

      expect(element.style.transform).toBe(`rotate(${targetAngle})`);
      expect(element.className).toContain('transition-[left,top]');
      expect(element.className).not.toContain('transition-[left,top,transform]');
    },
  );
});
