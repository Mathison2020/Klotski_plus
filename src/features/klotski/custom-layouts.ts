import { BOARD_COLS, BOARD_ROWS } from './constants';
import { getOccupiedArea, getSize, overlaps } from './engine';
import {
  HandsetOrientation,
  Orientation,
  PieceType,
  ThreeQuarterOrientation,
  type Layout,
  type Piece,
} from './types';

export const CUSTOM_LAYOUTS_STORAGE_KEY = 'klotski.custom-layouts.v1';

export interface CustomLayout extends Layout {
  id: string;
}

const PIECE_TYPES = new Set<string>(Object.values(PieceType));
const ORIENTATIONS = new Set<string>(Object.values(Orientation));
const THREE_QUARTER_ORIENTATIONS = new Set<string>(Object.values(ThreeQuarterOrientation));
const HANDSET_ORIENTATIONS = new Set<string>(Object.values(HandsetOrientation));

function isPiece(value: unknown): value is Piece {
  if (!value || typeof value !== 'object') return false;
  const piece = value as Partial<Piece>;
  if (
    typeof piece.id !== 'string' ||
    piece.id.length === 0 ||
    typeof piece.type !== 'string' ||
    !PIECE_TYPES.has(piece.type) ||
    !Number.isInteger(piece.x) ||
    !Number.isInteger(piece.y)
  ) {
    return false;
  }
  if (
    piece.type === PieceType.HALF_DISC &&
    piece.orientation !== undefined &&
    !ORIENTATIONS.has(piece.orientation)
  ) {
    return false;
  }
  if (
    piece.type === PieceType.THREE_QUARTER_DISC &&
    piece.threeQuarterOrientation !== undefined &&
    !THREE_QUARTER_ORIENTATIONS.has(piece.threeQuarterOrientation)
  ) {
    return false;
  }
  if (
    piece.type === PieceType.HANDSET &&
    piece.handsetOrientation !== undefined &&
    !HANDSET_ORIENTATIONS.has(piece.handsetOrientation)
  ) {
    return false;
  }
  return true;
}

/** 返回可展示给编辑器的首个错误；null 表示布局可以保存。 */
export function validateCustomLayout(name: string, pieces: Piece[]): string | null {
  if (!name.trim()) return '请输入关卡名称';
  if (pieces.filter((piece) => piece.type === PieceType.CAOCAO).length !== 1) {
    return '关卡必须且只能包含一个曹操';
  }
  if (new Set(pieces.map((piece) => piece.id)).size !== pieces.length) {
    return '棋块标识重复，请重新放置棋块';
  }

  let occupiedArea = 0;
  for (const piece of pieces) {
    const size = getSize(piece);
    occupiedArea += getOccupiedArea(piece);
    if (
      piece.x < 0 ||
      piece.y < 0 ||
      piece.x + size.w > BOARD_COLS ||
      piece.y + size.h > BOARD_ROWS
    ) {
      return '有棋块超出了棋盘边界';
    }
  }
  if (occupiedArea > BOARD_COLS * BOARD_ROWS - 2) return '至少需要保留两格自由空间';

  for (let index = 0; index < pieces.length; index++) {
    for (let other = index + 1; other < pieces.length; other++) {
      if (overlaps(pieces[index], pieces[other])) return '棋块之间不能重叠';
    }
  }
  return null;
}

function parseCustomLayout(value: unknown): CustomLayout | null {
  if (!value || typeof value !== 'object') return null;
  const layout = value as Partial<CustomLayout>;
  if (
    typeof layout.id !== 'string' ||
    !layout.id ||
    typeof layout.name !== 'string' ||
    !Array.isArray(layout.pieces) ||
    !layout.pieces.every(isPiece) ||
    validateCustomLayout(layout.name, layout.pieces) !== null
  ) {
    return null;
  }
  return {
    id: layout.id,
    name: layout.name.trim(),
    pieces: layout.pieces.map((piece) => ({ ...piece })),
  };
}

/** 损坏或旧版本的数据会被安全忽略，不影响内置关卡启动。 */
export function loadCustomLayouts(storage?: Pick<Storage, 'getItem'>): CustomLayout[] {
  const target =
    storage ?? (globalThis.localStorage === undefined ? undefined : globalThis.localStorage);
  if (!target) return [];
  try {
    const raw = target.getItem(CUSTOM_LAYOUTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const layout = parseCustomLayout(value);
      return layout ? [layout] : [];
    });
  } catch {
    return [];
  }
}

export function persistCustomLayouts(
  layouts: CustomLayout[],
  storage?: Pick<Storage, 'setItem'>,
): void {
  const target =
    storage ?? (globalThis.localStorage === undefined ? undefined : globalThis.localStorage);
  target?.setItem(CUSTOM_LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}
