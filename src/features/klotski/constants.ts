import { PieceType } from './types';

/** 棋盘列数（宽）。 */
export const BOARD_COLS = 4;

/** 棋盘行数（高）。 */
export const BOARD_ROWS = 5;

/** 底部出口所占列区间：x 为起始列，width 为列数。 */
export const EXIT = { x: 1, width: 2 } as const;

/** 曹操从出口逃出时，其左上角应到达的格子坐标。 */
export const WIN_POSITION = { x: 1, y: 3 } as const;

/** 每种棋块的默认占用尺寸；可旋转块的实际尺寸由 getSize 推导。 */
export const PIECE_SIZE: Record<PieceType, { w: number; h: number }> = {
  [PieceType.CAOCAO]: { w: 2, h: 2 },
  [PieceType.GENERAL_H]: { w: 2, h: 1 },
  [PieceType.GENERAL_V]: { w: 1, h: 2 },
  [PieceType.SOLDIER]: { w: 1, h: 1 },
  [PieceType.HALF_DISC]: { w: 1, h: 2 },
  [PieceType.THREE_QUARTER_DISC]: { w: 2, h: 2 },
  [PieceType.HANDSET]: { w: 1, h: 3 },
} as const;
