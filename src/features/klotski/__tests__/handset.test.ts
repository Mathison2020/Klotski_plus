import { describe, expect, test } from 'vitest';
import { getSize, handsetCenter, handsetTurnCenter, turnHandset } from '../engine';
import { HandsetOrientation, PieceType, type Piece } from '../types';

function handset(x: number, y: number, orientation: Piece['handsetOrientation']): Piece {
  return { id: 'phone', type: PieceType.HANDSET, x, y, handsetOrientation: orientation };
}

describe('Hammersley 电话听筒块', () => {
  test('四个凹口朝向对应 1×3 或 3×1 外接占位', () => {
    expect(getSize(handset(0, 0, HandsetOrientation.LEFT))).toEqual({ w: 1, h: 3 });
    expect(getSize(handset(0, 0, HandsetOrientation.RIGHT))).toEqual({ w: 1, h: 3 });
    expect(getSize(handset(0, 0, HandsetOrientation.UP))).toEqual({ w: 3, h: 1 });
    expect(getSize(handset(0, 0, HandsetOrientation.DOWN))).toEqual({ w: 3, h: 1 });
  });

  test('外接矩形中心计算正确', () => {
    expect(handsetCenter(handset(1, 1, HandsetOrientation.RIGHT))).toEqual({ x: 1.5, y: 2.5 });
    expect(handsetCenter(handset(0, 2, HandsetOrientation.UP))).toEqual({ x: 1.5, y: 2.5 });
  });

  test.each([
    [HandsetOrientation.UP, 'start', 'clockwise', 0, 0, HandsetOrientation.RIGHT],
    [HandsetOrientation.UP, 'end', 'counterclockwise', 2, 0, HandsetOrientation.LEFT],
    [HandsetOrientation.DOWN, 'start', 'counterclockwise', 0, 2, HandsetOrientation.RIGHT],
    [HandsetOrientation.DOWN, 'end', 'clockwise', 2, 2, HandsetOrientation.LEFT],
  ] as const)('横放 %s 从 %s 端向凹口侧转弯', (orientation, pivot, direction, x, y, next) => {
    const turned = turnHandset([handset(0, 2, orientation)], 'phone', pivot, direction);
    expect(turned![0]).toMatchObject({ x, y, handsetOrientation: next });
  });

  test.each([
    [HandsetOrientation.LEFT, 2, 'start', 'counterclockwise', 0, 0, HandsetOrientation.DOWN],
    [HandsetOrientation.LEFT, 2, 'end', 'clockwise', 0, 2, HandsetOrientation.UP],
    [HandsetOrientation.RIGHT, 0, 'start', 'clockwise', 0, 0, HandsetOrientation.DOWN],
    [HandsetOrientation.RIGHT, 0, 'end', 'counterclockwise', 0, 2, HandsetOrientation.UP],
  ] as const)(
    '竖放 %s 从 %s 端向凹口侧转弯',
    (orientation, sourceX, pivot, direction, x, y, next) => {
      const turned = turnHandset([handset(sourceX, 0, orientation)], 'phone', pivot, direction);
      expect(turned![0]).toMatchObject({ x, y, handsetOrientation: next });
    },
  );

  test('中心沿绕开内墙角的半圆轨迹移动', () => {
    const source = handset(1, 4, HandsetOrientation.UP);
    const target = turnHandset([source], 'phone', 'end', 'counterclockwise')![0];
    expect(handsetTurnCenter(source, target, 0)).toEqual({ x: 2.5, y: 4.5 });
    expect(handsetTurnCenter(source, target, 0.5).x).toBeCloseTo(3);
    expect(handsetTurnCenter(source, target, 0.5).y).toBeCloseTo(4);
    expect(handsetTurnCenter(source, target, 1).x).toBeCloseTo(3.5);
    expect(handsetTurnCenter(source, target, 1).y).toBeCloseTo(3.5);
  });

  test('转角全程由同一个内墙角贴住半圆凹口', () => {
    const source = handset(1, 4, HandsetOrientation.UP);
    const target = turnHandset([source], 'phone', 'end', 'counterclockwise')![0];
    const corner = { x: 3, y: 4 };

    for (let step = 0; step <= 32; step++) {
      const progress = step / 32;
      const center = handsetTurnCenter(source, target, progress);
      const bodyAngle = -(Math.PI / 2) * progress;
      const contactAngle = Math.PI * progress;
      const local = {
        x: 0.5 * Math.cos(contactAngle),
        y: -0.5 + 0.5 * Math.sin(contactAngle),
      };
      const worldContact = {
        x: center.x + local.x * Math.cos(bodyAngle) - local.y * Math.sin(bodyAngle),
        y: center.y + local.x * Math.sin(bodyAngle) + local.y * Math.cos(bodyAngle),
      };

      expect(worldContact.x).toBeCloseTo(corner.x, 8);
      expect(worldContact.y).toBeCloseTo(corner.y, 8);
    }
  });

  test('转角内侧的障碍物始终位于半圆凹口中，不会被实体扫过', () => {
    const source = handset(1, 4, HandsetOrientation.UP);
    const innerCorner: Piece = { id: 'corner', type: PieceType.SOLDIER, x: 2, y: 3 };
    const turned = turnHandset([source, innerCorner], 'phone', 'end', 'counterclockwise');

    expect(turned?.[0]).toMatchObject({ x: 3, y: 2, handsetOrientation: HandsetOrientation.LEFT });
  });

  test('背离凹口转弯、越界或转角通道被占用时均不可转', () => {
    const horizontal = handset(0, 2, HandsetOrientation.UP);
    expect(turnHandset([horizontal], 'phone', 'end', 'clockwise')).toBeNull();

    const atTop = handset(0, 0, HandsetOrientation.UP);
    expect(turnHandset([atTop], 'phone', 'start', 'clockwise')).toBeNull();

    const blocker: Piece = { id: 'block', type: PieceType.SOLDIER, x: 2, y: 1 };
    expect(turnHandset([horizontal, blocker], 'phone', 'end', 'counterclockwise')).toBeNull();
  });
});
