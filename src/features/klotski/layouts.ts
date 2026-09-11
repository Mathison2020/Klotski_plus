import { HandsetOrientation, Orientation, PieceType, type Layout, type Piece } from './types';

const { CAOCAO, GENERAL_H, GENERAL_V, SOLDIER, HALF_DISC, HANDSET } = PieceType;

/** 四个竖将（1×2）在两列的固定位置 —— 与经典布局一致。 */
const VERTICALS = [
  { id: 'zhangfei', x: 0, y: 0 },
  { id: 'zhaoyun', x: 0, y: 2 },
  { id: 'machao', x: 3, y: 0 },
  { id: 'huangzhong', x: 3, y: 2 },
] as const;

/**
 * 按结构显式构建一关：曹操(2x2, 恒在 x=1)、关羽(2x1) 纵坐标、以及四个 1x1 卒。
 * 4×5 棋盘下曹操横向只可能落在 x=1（底部出口居中），竖将只能贴两侧列，
 * 因此变体差异主要来自曹操纵坐标、关羽纵坐标与小卒落点。
 */
function build(
  name: string,
  caoY: number,
  guanY: number,
  soldiers: readonly (readonly [number, number])[],
): Layout {
  return {
    name,
    pieces: [
      { id: 'caocao', type: CAOCAO, x: 1, y: caoY },
      { id: 'guanyu', type: GENERAL_H, x: 1, y: guanY },
      ...VERTICALS.map((v) => ({ type: GENERAL_V, ...v })),
      ...soldiers.map(([x, y], i) => ({ id: `zu${i + 1}`, type: SOLDIER, x, y })),
    ],
  };
}

/** 横刀立马 —— 最常见的经典布局。最短解 90 步（本项目的「滑动任意距离=一步」口径）。 */
export const HENG_DAO_LI_MA: Layout = build('横刀立马', 0, 2, [
  [1, 3],
  [2, 3],
  [0, 4],
  [3, 4],
]);

/**
 * 传统关卡的 4×5 行优先编码：0 空格、1 延续格、2 卒、3 竖将、4 横将、5 曹操。
 * 布局资料来源：https://github.com/conwnet/huarongdao
 */
function decodeClassicLayout(name: string, encoded: string): Layout {
  if (encoded.length !== BOARD_CELL_COUNT) throw new Error(`关卡「${name}」编码长度错误`);

  const pieces: Piece[] = [];
  let horizontalIndex = 0;
  let verticalIndex = 0;
  let soldierIndex = 0;
  for (let index = 0; index < encoded.length; index++) {
    const x = index % 4;
    const y = Math.floor(index / 4);
    switch (encoded[index]) {
      case '2': {
        pieces.push({ id: `${name}-zu${++soldierIndex}`, type: SOLDIER, x, y });
        break;
      }
      case '3': {
        pieces.push({ id: `${name}-shu${++verticalIndex}`, type: GENERAL_V, x, y });
        break;
      }
      case '4': {
        pieces.push({ id: `${name}-heng${++horizontalIndex}`, type: GENERAL_H, x, y });
        break;
      }
      case '5': {
        pieces.push({ id: `${name}-caocao`, type: CAOCAO, x, y });
        break;
      }
      default: {
        break;
      }
    }
  }
  return { name, pieces };
}

const BOARD_CELL_COUNT = 20;

export const QI_TOU_BING_JIN = decodeClassicLayout('齐头并进', '35131111222234131001');
export const BING_FEN_SAN_LU = decodeClassicLayout('兵分三路', '25123113122134131001');
export const YI_LU_SHUN_FENG = decodeClassicLayout('一路顺风', '35121112341312310210');
export const JIANG_SHOU_JIAO_LOU = decodeClassicLayout('将守角楼', '35131111241232231001');
export const CENG_CENG_SHE_FANG = decodeClassicLayout(
  '层层设防',
  '35131111241224120410',
);

/**
 * 峰回路转 —— 由“横刀立马”把左上竖将替换为半圆。
 * 仍保持传统布局的 18 格占用（仅两格空位）；最短解 37 步，必须旋转半圆 2 次。
 */
export const HALF_DISC_SANDBOX: Layout = {
  name: '峰回路转',
  pieces: [
    { id: 'caocao', type: CAOCAO, x: 1, y: 0 },
    { id: 'guanyu', type: GENERAL_H, x: 1, y: 2 },
    { id: 'half', type: HALF_DISC, x: 0, y: 0, orientation: Orientation.RIGHT },
    { id: 'zhaoyun', type: GENERAL_V, x: 0, y: 2 },
    { id: 'machao', type: GENERAL_V, x: 3, y: 0 },
    { id: 'huangzhong', type: GENERAL_V, x: 3, y: 2 },
    { id: 'zu1', type: SOLDIER, x: 1, y: 3 },
    { id: 'zu2', type: SOLDIER, x: 2, y: 3 },
    { id: 'zu3', type: SOLDIER, x: 0, y: 4 },
    { id: 'zu4', type: SOLDIER, x: 3, y: 4 },
  ],
};

/**
 * 辗转腾挪 —— 由“横刀立马”把左下竖将和其下方小卒合并为三格听筒。
 * 仅留下两格自由空间；最短解 81 步，其中必须完成 6 次转角动作。
 */
export const HANDSET_SANDBOX: Layout = {
  name: '辗转腾挪',
  pieces: [
    { id: 'caocao', type: CAOCAO, x: 1, y: 0 },
    { id: 'guanyu', type: GENERAL_H, x: 1, y: 2 },
    {
      id: 'handset',
      type: HANDSET,
      x: 0,
      y: 2,
      handsetOrientation: HandsetOrientation.RIGHT,
    },
    { id: 'zhangfei', type: GENERAL_V, x: 0, y: 0 },
    { id: 'machao', type: GENERAL_V, x: 3, y: 0 },
    { id: 'huangzhong', type: GENERAL_V, x: 3, y: 2 },
    { id: 'zu1', type: SOLDIER, x: 1, y: 3 },
    { id: 'zu2', type: SOLDIER, x: 2, y: 3 },
    { id: 'zu4', type: SOLDIER, x: 3, y: 4 },
  ],
};

/** 全部关卡（后续新增布局在此追加）。 */
export const LAYOUTS: Layout[] = [
  HENG_DAO_LI_MA,
  QI_TOU_BING_JIN,
  BING_FEN_SAN_LU,
  YI_LU_SHUN_FENG,
  JIANG_SHOU_JIAO_LOU,
  CENG_CENG_SHE_FANG,
  HALF_DISC_SANDBOX,
  HANDSET_SANDBOX,
];
