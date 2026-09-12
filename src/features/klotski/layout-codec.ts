import { parseCustomLayout, validateCustomLayout } from './custom-layouts';
import { PieceType, type Layout, type Piece } from './types';

const CODE_PREFIX = 'KLP1.';
const FORMAT = 'klotski-layout';
const VERSION = 1;

interface LayoutEnvelope {
  format: typeof FORMAT;
  version: typeof VERSION;
  name: string;
  pieces: Piece[];
}

export class LayoutCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutCodeError';
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): string {
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new LayoutCodeError('编码内容无效');
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new LayoutCodeError('编码内容无效');
  }
}

/**
 * KLP1 是带版本号的 URL-safe Base64 文本格式。载荷保留每个棋块的自描述字段，
 * 新增棋块属性时无需改变外层格式；后续不兼容升级则使用新的版本号。
 */
export function encodeLayout(layout: Layout): string {
  const error = validateCustomLayout(layout.name, layout.pieces);
  if (error) throw new LayoutCodeError(`无法导出：${error}`);
  const envelope: LayoutEnvelope = {
    format: FORMAT,
    version: VERSION,
    name: layout.name.trim(),
    pieces: layout.pieces.map((piece) => ({ ...piece })),
  };
  return CODE_PREFIX + encodeBase64Url(JSON.stringify(envelope));
}

/** 解码并按当前客户端支持的棋块规则校验；未知版本不会被静默误读。 */
export function decodeLayout(code: string): Layout {
  const normalized = code.trim();
  if (!normalized.startsWith(CODE_PREFIX)) {
    throw new LayoutCodeError('不是受支持的 KLP1 局面编码');
  }

  let value: unknown;
  try {
    value = JSON.parse(decodeBase64Url(normalized.slice(CODE_PREFIX.length)));
  } catch (error) {
    if (error instanceof LayoutCodeError) throw error;
    throw new LayoutCodeError('编码内容不是有效的局面数据');
  }

  if (!value || typeof value !== 'object') throw new LayoutCodeError('编码内容不是有效的局面数据');
  const envelope = value as Partial<LayoutEnvelope>;
  if (envelope.format !== FORMAT || envelope.version !== VERSION) {
    throw new LayoutCodeError('暂不支持此局面编码版本');
  }
  if (typeof envelope.name !== 'string' || !Array.isArray(envelope.pieces)) {
    throw new LayoutCodeError('编码缺少关卡名称或棋块数据');
  }

  const supportedTypes = new Set<string>(Object.values(PieceType));
  const pieces = envelope.pieces.map((item) => {
    if (!item || typeof item !== 'object') throw new LayoutCodeError('编码中含有无效棋块');
    const piece = item as Partial<Piece>;
    if (typeof piece.type !== 'string' || !supportedTypes.has(piece.type)) {
      throw new LayoutCodeError(`当前版本不支持棋块类型“${piece.type ?? ''}”`);
    }
    if (
      typeof piece.id !== 'string' ||
      !piece.id ||
      !Number.isInteger(piece.x) ||
      !Number.isInteger(piece.y)
    ) {
      throw new LayoutCodeError('编码中含有无效棋块');
    }
    return { ...item } as Piece;
  });
  const parsed = parseCustomLayout({ id: 'decoded-layout', name: envelope.name, pieces });
  if (!parsed) throw new LayoutCodeError('编码中的关卡或棋块数据无效');
  return { name: parsed.name, pieces: parsed.pieces };
}
