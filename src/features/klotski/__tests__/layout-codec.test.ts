import { describe, expect, test } from 'vitest';
import { decodeLayout, encodeLayout, LayoutCodeError } from '../layout-codec';
import { LAYOUTS } from '../layouts';
import { PieceType, type Layout, type Piece } from '../types';

function rawCode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `KLP1.${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`;
}

describe('KLP1 局面编码', () => {
  test.each(LAYOUTS)('预设“$name”可完整往返', (layout) => {
    const code = encodeLayout(layout);
    expect(code).toMatch(/^KLP1\.[A-Za-z0-9_-]+$/u);
    expect(decodeLayout(code)).toEqual(layout);
  });

  test('支持中文名称，并保留未来新增的棋块属性', () => {
    const extensiblePiece = {
      id: 'cao',
      type: PieceType.CAOCAO,
      x: 1,
      y: 0,
      appearance: { theme: 'future' },
    } as Piece;
    const layout: Layout = { name: '可扩展局面', pieces: [extensiblePiece] };

    expect(decodeLayout(encodeLayout(layout))).toEqual(layout);
  });

  test('拒绝损坏、未知版本和当前客户端不支持的棋块类型', () => {
    expect(() => decodeLayout('not-a-layout')).toThrow(LayoutCodeError);
    expect(() => decodeLayout('KLP1.invalid*')).toThrow('编码内容无效');
    expect(() =>
      decodeLayout(rawCode({ format: 'klotski-layout', version: 2, name: '新版', pieces: [] })),
    ).toThrow('暂不支持');
    expect(() =>
      decodeLayout(
        rawCode({
          format: 'klotski-layout',
          version: 1,
          name: '未来棋块',
          pieces: [{ id: 'future', type: 'future-piece', x: 0, y: 0 }],
        }),
      ),
    ).toThrow('不支持棋块类型');
  });
});
