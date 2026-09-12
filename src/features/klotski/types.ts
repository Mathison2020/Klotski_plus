/**
 * 华容道棋块与布局的核心类型定义。
 */

export const PieceType = {
  CAOCAO: 'caocao',
  GENERAL_H: 'general-h',
  GENERAL_V: 'general-v',
  SOLDIER: 'soldier',
  HALF_DISC: 'half-disc',
  THREE_QUARTER_DISC: 'three-quarter-disc',
  HANDSET: 'handset',
} as const;

export type PieceType = (typeof PieceType)[keyof typeof PieceType];

/** 半圆弧面朝向。未显式提供时按 RIGHT 处理，仅对 HALF_DISC 有意义。 */
export const Orientation = {
  RIGHT: 'right',
  DOWN: 'down',
  LEFT: 'left',
  UP: 'up',
} as const;

export type Orientation = (typeof Orientation)[keyof typeof Orientation];

/** 3/4 圆缺口所在的象限；棋块本体占据 2×2 外接框中的另外三格。 */
export const ThreeQuarterOrientation = {
  TOP_RIGHT: 'top-right',
  BOTTOM_RIGHT: 'bottom-right',
  BOTTOM_LEFT: 'bottom-left',
  TOP_LEFT: 'top-left',
} as const;

export type ThreeQuarterOrientation =
  (typeof ThreeQuarterOrientation)[keyof typeof ThreeQuarterOrientation];

export type RotationDirection = 'clockwise' | 'counterclockwise';

/**
 * 电话听筒的内侧半圆凹口朝向。
 * UP / DOWN 时外接占位为 3×1，LEFT / RIGHT 时为 1×3。
 */
export const HandsetOrientation = {
  UP: 'up',
  RIGHT: 'right',
  DOWN: 'down',
  LEFT: 'left',
} as const;

export type HandsetOrientation = (typeof HandsetOrientation)[keyof typeof HandsetOrientation];
export type HandsetPivot = 'start' | 'end';

/** 单个棋块。x/y 为左上角格子坐标（0-based），w/h 由 type（或 orientation）推导。 */
export interface Piece {
  id: string;
  type: PieceType;
  x: number;
  y: number;
  orientation?: Orientation;
  threeQuarterOrientation?: ThreeQuarterOrientation;
  handsetOrientation?: HandsetOrientation;
}

/** 一套初始布局。 */
export interface Layout {
  name: string;
  pieces: Piece[];
}
