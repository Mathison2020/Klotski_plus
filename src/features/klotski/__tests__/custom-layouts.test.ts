import { beforeEach, describe, expect, test } from 'vitest';
import {
  CUSTOM_LAYOUTS_STORAGE_KEY,
  loadCustomLayouts,
  persistCustomLayouts,
  validateCustomLayout,
  type CustomLayout,
} from '../custom-layouts';
import { PieceType, ThreeQuarterOrientation, type Piece } from '../types';

const VALID_PIECES: Piece[] = [
  { id: 'cao', type: PieceType.CAOCAO, x: 1, y: 0 },
  { id: 'soldier', type: PieceType.SOLDIER, x: 0, y: 0 },
];

describe('自定义关卡持久化', () => {
  beforeEach(() => globalThis.localStorage.clear());

  test('保存后可从 localStorage 恢复独立副本', () => {
    const layouts: CustomLayout[] = [{ id: 'custom-1', name: '测试关卡', pieces: VALID_PIECES }];
    persistCustomLayouts(layouts);

    const loaded = loadCustomLayouts();
    expect(loaded).toEqual(layouts);
    expect(loaded).not.toBe(layouts);
    expect(loaded[0].pieces).not.toBe(VALID_PIECES);
  });

  test('保存并恢复3/4圆块的缺口朝向', () => {
    const pieces: Piece[] = [
      VALID_PIECES[0],
      {
        id: 'three-quarter',
        type: PieceType.THREE_QUARTER_DISC,
        x: 0,
        y: 2,
        threeQuarterOrientation: ThreeQuarterOrientation.BOTTOM_LEFT,
      },
    ];
    persistCustomLayouts([{ id: 'custom-three-quarter', name: '三格块', pieces }]);

    expect(loadCustomLayouts()[0].pieces[1]).toMatchObject({
      type: PieceType.THREE_QUARTER_DISC,
      threeQuarterOrientation: ThreeQuarterOrientation.BOTTOM_LEFT,
    });
  });

  test('损坏的数据和非法布局会被忽略', () => {
    globalThis.localStorage.setItem(CUSTOM_LAYOUTS_STORAGE_KEY, '{bad json');
    expect(loadCustomLayouts()).toEqual([]);

    globalThis.localStorage.setItem(
      CUSTOM_LAYOUTS_STORAGE_KEY,
      JSON.stringify([{ id: 'bad', name: '越界', pieces: [{ ...VALID_PIECES[0], x: 4 }] }]),
    );
    expect(loadCustomLayouts()).toEqual([]);
  });
});

describe('自定义关卡校验', () => {
  test('要求名称、唯一曹操、无重叠并保留两个空格', () => {
    expect(validateCustomLayout('', VALID_PIECES)).toBe('请输入关卡名称');
    expect(validateCustomLayout('无曹操', [VALID_PIECES[1]])).toBe('关卡必须且只能包含一个曹操');
    expect(
      validateCustomLayout('重叠', [VALID_PIECES[0], { ...VALID_PIECES[1], x: 1, y: 0 }]),
    ).toBe('棋块之间不能重叠');
    expect(validateCustomLayout('合法', VALID_PIECES)).toBeNull();
  });
});
