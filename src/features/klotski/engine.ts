/**
 * 华容道核心纯逻辑：尺寸、碰撞、可移动范围与胜利判定。
 * 不含 DOM / React 依赖，便于单测与复用。
 */

import {
  HandsetOrientation,
  Orientation,
  PieceType,
  type HandsetPivot,
  type Piece,
  type RotationDirection,
} from './types';
import { BOARD_COLS, BOARD_ROWS, PIECE_SIZE, WIN_POSITION } from './constants';

const ORIENTATION_ORDER = [
  Orientation.RIGHT,
  Orientation.DOWN,
  Orientation.LEFT,
  Orientation.UP,
] as const;

const HANDSET_ORIENTATION_ORDER = [
  HandsetOrientation.UP,
  HandsetOrientation.RIGHT,
  HandsetOrientation.DOWN,
  HandsetOrientation.LEFT,
] as const;

interface Point {
  x: number;
  y: number;
}

function cubicPoints(from: Point, control1: Point, control2: Point, to: Point): Point[] {
  const points: Point[] = [];
  for (let index = 1; index <= 16; index++) {
    const t = index / 16;
    const inverse = 1 - t;
    points.push({
      x:
        inverse ** 3 * from.x +
        3 * inverse ** 2 * t * control1.x +
        3 * inverse * t ** 2 * control2.x +
        t ** 3 * to.x,
      y:
        inverse ** 3 * from.y +
        3 * inverse ** 2 * t * control1.y +
        3 * inverse * t ** 2 * control2.y +
        t ** 3 * to.y,
    });
  }
  return points;
}

/**
 * 3×1 Hammersley 听筒的精确格坐标轮廓，用于转角全轨迹碰撞检测。
 * 中央凹口是半径 0.5 格的半圆，两个外端是半径 1 格的四分之一圆。
 * 物理轮廓不可为描边预留内边距，否则内凹圆弧将无法贴住墙角。
 */
const HANDSET_OUTLINE: readonly Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  ...cubicPoints(
    { x: 1, y: 0 },
    { x: 1, y: 0.276_142 },
    { x: 1.223_858, y: 0.5 },
    { x: 1.5, y: 0.5 },
  ),
  ...cubicPoints(
    { x: 1.5, y: 0.5 },
    { x: 1.776_142, y: 0.5 },
    { x: 2, y: 0.276_142 },
    { x: 2, y: 0 },
  ),
  { x: 3, y: 0 },
  ...cubicPoints({ x: 3, y: 0 }, { x: 3, y: 0.552_285 }, { x: 2.552_285, y: 1 }, { x: 2, y: 1 }),
  { x: 1, y: 1 },
  ...cubicPoints({ x: 1, y: 1 }, { x: 0.447_715, y: 1 }, { x: 0, y: 0.552_285 }, { x: 0, y: 0 }),
];

function transformHandsetOutline(center: Point, degrees: number): Point[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return HANDSET_OUTLINE.map((point) => {
    const x = point.x - 1.5;
    const y = point.y - 0.5;
    return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
  });
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (origin: Point, first: Point, second: Point) =>
    (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x);
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function polygonIntersectsPiece(polygon: readonly Point[], piece: Piece): boolean {
  const size = getSize(piece);
  // 圆弧由三次贝塞尔和离散线段近似；相切应合法，公差仅吸收近似误差。
  const inset = 0.001;
  const left = piece.x + inset;
  const right = piece.x + size.w - inset;
  const top = piece.y + inset;
  const bottom = piece.y + size.h - inset;
  const corners: Point[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];

  if (
    polygon.some((point) => point.x > left && point.x < right && point.y > top && point.y < bottom)
  ) {
    return true;
  }
  if (corners.some((point) => pointInPolygon(point, polygon))) return true;

  for (let index = 0; index < polygon.length; index++) {
    const from = polygon[index];
    const to = polygon[(index + 1) % polygon.length];
    for (let edge = 0; edge < corners.length; edge++) {
      if (segmentsCross(from, to, corners[edge], corners[(edge + 1) % corners.length])) return true;
    }
  }
  return false;
}

const CENTER_OFFSET: Record<Orientation, { x: number; y: number }> = {
  [Orientation.RIGHT]: { x: 0, y: 1 },
  [Orientation.DOWN]: { x: 1, y: 0 },
  [Orientation.LEFT]: { x: 1, y: 1 },
  [Orientation.UP]: { x: 1, y: 1 },
};

const POSITION_OFFSET: Record<Orientation, { x: number; y: number }> = {
  [Orientation.RIGHT]: { x: 0, y: -1 },
  [Orientation.DOWN]: { x: -1, y: 0 },
  [Orientation.LEFT]: { x: -1, y: -1 },
  [Orientation.UP]: { x: -1, y: -1 },
};

export function getOrientation(piece: Piece): Orientation {
  return piece.orientation ?? Orientation.RIGHT;
}

export function getHandsetOrientation(piece: Piece): HandsetOrientation {
  return piece.handsetOrientation ?? HandsetOrientation.UP;
}

export function orientationDegrees(orientation: Orientation): number {
  return ORIENTATION_ORDER.indexOf(orientation) * 90;
}

export function handsetOrientationDegrees(orientation: HandsetOrientation): number {
  if (orientation === HandsetOrientation.LEFT) return -90;
  return HANDSET_ORIENTATION_ORDER.indexOf(orientation) * 90;
}

/** 返回棋块的占用尺寸（单位格）。上下朝向为 2×1，左右朝向为 1×2。 */
export function getSize(piece: Piece): { w: number; h: number } {
  if (piece.type === PieceType.HALF_DISC) {
    const orientation = getOrientation(piece);
    return orientation === Orientation.DOWN || orientation === Orientation.UP
      ? { w: 2, h: 1 }
      : { w: 1, h: 2 };
  }
  if (piece.type === PieceType.HANDSET) {
    const orientation = getHandsetOrientation(piece);
    return orientation === HandsetOrientation.UP || orientation === HandsetOrientation.DOWN
      ? { w: 3, h: 1 }
      : { w: 1, h: 3 };
  }
  return PIECE_SIZE[piece.type];
}

/** 电话听筒外接矩形的中心点。 */
export function handsetCenter(piece: Piece): { x: number; y: number } {
  const size = getSize(piece);
  return { x: piece.x + size.w / 2, y: piece.y + size.h / 2 };
}

/** 电话听筒指定端部所在格子的中心点。 */
export function handsetPivotCenter(piece: Piece, pivot: HandsetPivot): { x: number; y: number } {
  const size = getSize(piece);
  const horizontal = size.w > size.h;
  return {
    x: piece.x + (horizontal && pivot === 'end' ? 2.5 : 0.5),
    y: piece.y + (!horizontal && pivot === 'end' ? 2.5 : 0.5),
  };
}

/** 指定端部能转向凹口所在的一侧；反向会让实心外弧撞上内墙。 */
export function handsetTurnDirection(piece: Piece, pivot: HandsetPivot): RotationDirection {
  const orientation = getHandsetOrientation(piece);
  const firstHalf =
    orientation === HandsetOrientation.UP || orientation === HandsetOrientation.RIGHT;
  if (pivot === 'start') return firstHalf ? 'clockwise' : 'counterclockwise';
  return firstHalf ? 'counterclockwise' : 'clockwise';
}

/**
 * Hammersley 听筒转角时的中心轨迹。
 *
 * 内墙拐角固定不动，并在听筒的局部坐标中沿中央半圆凹口滑动 180°。
 * 每一帧均由“旋转后的凹口接触点 = 固定墙角”反求听筒中心，因此中心轨迹
 * 是一条曲线，而不是起止中心之间的对角直线。
 */
export function handsetTurnCenter(
  source: Piece,
  target: Piece,
  progress: number,
): { x: number; y: number } {
  const start = handsetCenter(source);
  const end = handsetCenter(target);
  const t = Math.max(0, Math.min(progress, 1));
  if (t === 0) return start;
  if (t === 1) return end;

  const startDegrees = handsetOrientationDegrees(getHandsetOrientation(source));
  const endDegrees = handsetOrientationDegrees(getHandsetOrientation(target));
  let degreeDelta = endDegrees - startDegrees;
  if (degreeDelta > 180) degreeDelta -= 360;
  if (degreeDelta < -180) degreeDelta += 360;

  const clockwise = degreeDelta > 0;
  const startRadians = (startDegrees * Math.PI) / 180;
  const startContact = { x: clockwise ? -0.5 : 0.5, y: -0.5 };
  const startCos = Math.cos(startRadians);
  const startSin = Math.sin(startRadians);
  const corner = {
    x: start.x + startContact.x * startCos - startContact.y * startSin,
    y: start.y + startContact.x * startSin + startContact.y * startCos,
  };

  // 凹口圆心相对棋块中心为 (0, -0.5)，半径为 0.5。
  const contactAngle = clockwise ? Math.PI * (1 - t) : Math.PI * t;
  const localContact = {
    x: 0.5 * Math.cos(contactAngle),
    y: -0.5 + 0.5 * Math.sin(contactAngle),
  };
  const radians = ((startDegrees + degreeDelta * t) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: corner.x - (localContact.x * cos - localContact.y * sin),
    y: corner.y - (localContact.x * sin + localContact.y * cos),
  };
}

function isHandsetTurnSweepClear(
  pieces: Piece[],
  source: Piece,
  target: Piece,
  direction: RotationDirection,
): boolean {
  const others = pieces.filter((piece) => piece.id !== source.id);
  const startDegrees = handsetOrientationDegrees(getHandsetOrientation(source));
  const degreeDelta = direction === 'clockwise' ? 90 : -90;

  // 4·5 的棋盘上 32 个分段已小于一个 SVG 描边像素对应的格坐标误差。
  for (let step = 0; step <= 32; step++) {
    const progress = step / 32;
    const center = handsetTurnCenter(source, target, progress);
    const polygon = transformHandsetOutline(center, startDegrees + degreeDelta * progress);

    const boundaryTolerance = 0.001;
    if (
      polygon.some(
        (point) =>
          point.x < -boundaryTolerance ||
          point.y < -boundaryTolerance ||
          point.x > BOARD_COLS + boundaryTolerance ||
          point.y > BOARD_ROWS + boundaryTolerance,
      )
    ) {
      return false;
    }
    if (others.some((other) => polygonIntersectsPiece(polygon, other))) return false;
  }
  return true;
}

/**
 * 半圆块的圆心（直径中点，整数格点）。
 * x/y 始终是当前朝向外接矩形的左上角。
 */
export function discCenter(piece: Piece): { x: number; y: number } {
  const offset = CENTER_OFFSET[getOrientation(piece)];
  return { x: piece.x + offset.x, y: piece.y + offset.y };
}

function positionFromCenter(
  center: { x: number; y: number },
  orientation: Orientation,
): { x: number; y: number } {
  const offset = POSITION_OFFSET[orientation];
  return { x: center.x + offset.x, y: center.y + offset.y };
}

/**
 * 将指定半圆块绕其圆心（直径中点）旋转 90°，圆心保持不动。
 * 仅对 HALF_DISC 生效；旋转后越界或与其它块重叠则返回 null（不旋转）。
 */
export function rotatePiece(
  pieces: Piece[],
  id: string,
  direction: RotationDirection = 'clockwise',
): Piece[] | null {
  const piece = pieces.find((p) => p.id === id);
  if (!piece || piece.type !== PieceType.HALF_DISC) return null;

  const center = discCenter(piece);
  const currentIndex = ORIENTATION_ORDER.indexOf(getOrientation(piece));
  const delta = direction === 'clockwise' ? 1 : -1;
  const orientation = ORIENTATION_ORDER[(currentIndex + delta + ORIENTATION_ORDER.length) % 4];
  const position = positionFromCenter(center, orientation);
  const rotated: Piece = {
    ...piece,
    orientation,
    ...position,
  };

  const size = getSize(rotated);
  if (rotated.x < 0 || rotated.y < 0) return null;
  if (rotated.x + size.w > BOARD_COLS || rotated.y + size.h > BOARD_ROWS) return null;

  const others = pieces.filter((p) => p.id !== id);
  if (others.some((other) => overlaps(rotated, other))) return null;

  return pieces.map((p) => (p.id === id ? rotated : p));
}

/**
 * 电话听筒沿 L 形通道完成一次 Hammersley 式平移 + 90° 旋转。
 * start 是竖放时的上端或横放时的左端，end 是另一端。只允许向半圆凹口一侧转弯。
 */
export function turnHandset(
  pieces: Piece[],
  id: string,
  pivot: HandsetPivot,
  direction: RotationDirection,
): Piece[] | null {
  const piece = pieces.find((candidate) => candidate.id === id);
  if (!piece || piece.type !== PieceType.HANDSET) return null;

  if (direction !== handsetTurnDirection(piece, pivot)) return null;

  const currentOrientation = getHandsetOrientation(piece);
  const currentIndex = HANDSET_ORIENTATION_ORDER.indexOf(currentOrientation);
  const orientationDelta = direction === 'clockwise' ? 1 : -1;
  const nextOrientation =
    HANDSET_ORIENTATION_ORDER[
      (currentIndex + orientationDelta + HANDSET_ORIENTATION_ORDER.length) %
        HANDSET_ORIENTATION_ORDER.length
    ];
  const horizontal = getSize(piece).w === 3;
  let x: number;
  let y: number;

  if (horizontal) {
    x = piece.x + (pivot === 'end' ? 2 : 0);
    y = piece.y + (currentOrientation === HandsetOrientation.UP ? -2 : 0);
  } else {
    x = piece.x + (currentOrientation === HandsetOrientation.LEFT ? -2 : 0);
    y = piece.y + (pivot === 'end' ? 2 : 0);
  }

  const turned: Piece = {
    ...piece,
    x,
    y,
    handsetOrientation: nextOrientation,
  };
  const size = getSize(turned);
  if (!isInside(turned.x, turned.y, size.w, size.h)) return null;
  if (pieces.some((other) => other.id !== id && overlaps(turned, other))) return null;
  if (!isHandsetTurnSweepClear(pieces, piece, turned, direction)) return null;

  return pieces.map((candidate) => (candidate.id === id ? turned : candidate));
}

/** 两块棋子的格子矩形是否重叠。 */
export function overlaps(a: Piece, b: Piece): boolean {
  const sa = getSize(a);
  const sb = getSize(b);
  return a.x < b.x + sb.w && b.x < a.x + sa.w && a.y < b.y + sb.h && b.y < a.y + sa.h;
}

function isInside(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x + w <= BOARD_COLS && y + h <= BOARD_ROWS;
}

/**
 * 计算目标棋块沿某轴可连续滑动的范围 [min, max]。
 * 从当前位置向两侧扩展，直到越界或撞到其他棋块。
 */
export function computeRange(
  pieces: Piece[],
  target: Piece,
  axis: 'x' | 'y',
): { min: number; max: number } {
  const size = getSize(target);
  const others = pieces.filter((p) => p.id !== target.id);

  const valid = (x: number, y: number): boolean => {
    if (!isInside(x, y, size.w, size.h)) return false;
    const candidate: Piece = { ...target, x, y };
    return others.every((other) => !overlaps(candidate, other));
  };

  const isX = axis === 'x';
  const start = isX ? target.x : target.y;
  let min = start;
  let max = start;

  for (let pos = start - 1; ; pos--) {
    if (!valid(isX ? pos : target.x, isX ? target.y : pos)) break;
    min = pos;
  }
  for (let pos = start + 1; ; pos++) {
    if (!valid(isX ? pos : target.x, isX ? target.y : pos)) break;
    max = pos;
  }

  return { min, max };
}

/** 沿轴将指定棋块吸附移动到最接近目标值的合法位置，返回新数组。 */
export function movePiece(pieces: Piece[], id: string, axis: 'x' | 'y', target: number): Piece[] {
  const piece = pieces.find((p) => p.id === id);
  if (!piece) return pieces;

  const range = computeRange(pieces, piece, axis);
  const clamped = target < range.min ? range.min : target > range.max ? range.max : target;

  return pieces.map((p) => {
    if (p.id !== id) return p;
    return axis === 'x' ? { ...p, x: clamped } : { ...p, y: clamped };
  });
}

/** 曹操左上角是否已到达出口位置。 */
export function isWin(pieces: Piece[]): boolean {
  return pieces.some(
    (p) => p.type === PieceType.CAOCAO && p.x === WIN_POSITION.x && p.y === WIN_POSITION.y,
  );
}
