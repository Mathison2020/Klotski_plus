import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  TrashIcon,
  UploadSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BOARD_COLS, BOARD_ROWS } from '../constants';
import { validateCustomLayout } from '../custom-layouts';
import { decodeLayout, encodeLayout, LayoutCodeError } from '../layout-codec';
import {
  computeRange,
  discCenter,
  getOccupiedArea,
  getSize,
  handsetCenter,
  handsetTurnDirection,
  movePiece,
  overlaps,
  rotatePiece,
  turnHandset,
} from '../engine';
import {
  HandsetOrientation,
  Orientation,
  PieceType,
  ThreeQuarterOrientation,
  type HandsetPivot,
  type Layout,
  type Piece,
  type RotationDirection,
} from '../types';
import { Board } from './Board';
import { Piece as PieceView } from './Piece';

const TOOLS = [
  { type: PieceType.CAOCAO, label: '曹操 2×2' },
  { type: PieceType.GENERAL_H, label: '横将 2×1' },
  { type: PieceType.GENERAL_V, label: '竖将 1×2' },
  { type: PieceType.SOLDIER, label: '卒 1×1' },
  { type: PieceType.HALF_DISC, label: '半圆 1×2' },
  { type: PieceType.THREE_QUARTER_DISC, label: '3/4圆 3格' },
  { type: PieceType.HANDSET, label: '听筒 1×3' },
] as const;

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
const THREE_QUARTER_ORIENTATION_ORDER = [
  ThreeQuarterOrientation.TOP_RIGHT,
  ThreeQuarterOrientation.BOTTOM_RIGHT,
  ThreeQuarterOrientation.BOTTOM_LEFT,
  ThreeQuarterOrientation.TOP_LEFT,
] as const;
const HALF_LABELS = ['弧面向右', '弧面向下', '弧面向左', '弧面向上'] as const;
const THREE_QUARTER_LABELS = ['缺口右上', '缺口右下', '缺口左下', '缺口左上'] as const;
const HANDSET_LABELS = ['凹口向上', '凹口向右', '凹口向下', '凹口向左'] as const;

type RenderPos = Record<string, { x: number; y: number }>;

interface MoveDrag {
  kind: 'move';
  id: string;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  cellW: number;
  cellH: number;
  axis: 'x' | 'y' | null;
  range: { x: { min: number; max: number }; y: { min: number; max: number } };
  lastX: number;
  lastY: number;
}

interface HalfDrag {
  kind: 'half';
  id: string;
  centerX: number;
  centerY: number;
  previousAngle: number;
  degrees: number;
  canClockwise: boolean;
  canCounterclockwise: boolean;
}

interface CornerDrag {
  kind: 'corner';
  id: string;
  startX: number;
  startY: number;
  horizontal: boolean;
  cellSize: number;
  preferredPivot: HandsetPivot;
  options: {
    pivot: HandsetPivot;
    direction: RotationDirection;
    target: Piece;
    travelSign: number;
    sideSign: number;
  }[];
  activeOption: number | null;
  degrees: number;
}

type EditorDrag = MoveDrag | HalfDrag | CornerDrag;

export interface LayoutDraft extends Layout {
  id?: string;
}

interface LayoutEditorProps {
  initial: LayoutDraft;
  onCancel: () => void;
  onSave: (draft: LayoutDraft) => void;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function toRenderPos(pieces: Piece[]): RenderPos {
  return Object.fromEntries(pieces.map((piece) => [piece.id, { x: piece.x, y: piece.y }]));
}

function nextPieceId(type: Piece['type'], pieces: Piece[]): string {
  let suffix = 1;
  while (pieces.some((piece) => piece.id === `${type}-${suffix}`)) suffix++;
  return `${type}-${suffix}`;
}

function createPiece(
  type: Piece['type'],
  x: number,
  y: number,
  pieces: Piece[],
  orientationIndex: number,
): Piece {
  const base: Piece = { id: nextPieceId(type, pieces), type, x, y };
  if (type === PieceType.HALF_DISC) {
    return { ...base, orientation: ORIENTATION_ORDER[orientationIndex] };
  }
  if (type === PieceType.THREE_QUARTER_DISC) {
    return {
      ...base,
      threeQuarterOrientation: THREE_QUARTER_ORIENTATION_ORDER[orientationIndex],
    };
  }
  if (type === PieceType.HANDSET) {
    return { ...base, handsetOrientation: HANDSET_ORIENTATION_ORDER[orientationIndex] };
  }
  return base;
}

function canPlace(candidate: Piece, pieces: Piece[]): boolean {
  const size = getSize(candidate);
  return (
    candidate.x >= 0 &&
    candidate.y >= 0 &&
    candidate.x + size.w <= BOARD_COLS &&
    candidate.y + size.h <= BOARD_ROWS &&
    pieces.every((piece) => piece.id === candidate.id || !overlaps(candidate, piece))
  );
}

export function LayoutEditor({ initial, onCancel, onSave }: LayoutEditorProps) {
  const [name, setName] = useState(initial.name);
  const [pieces, setPieces] = useState<Piece[]>(() =>
    initial.pieces.map((piece) => ({ ...piece })),
  );
  const [render, setRender] = useState<RenderPos>(() => toRenderPos(initial.pieces));
  const [tool, setTool] = useState<Piece['type']>(PieceType.SOLDIER);
  const [placementOrientation, setPlacementOrientation] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [rotationPreview, setRotationPreview] = useState<{
    id: string;
    degrees: number;
    target?: Piece;
  } | null>(null);
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [codeMode, setCodeMode] = useState<'import' | 'export' | null>(null);
  const [layoutCode, setLayoutCode] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<EditorDrag | null>(null);

  const selected = pieces.find((piece) => piece.id === selectedId) ?? null;
  const occupiedArea = useMemo(
    () => pieces.reduce((area, piece) => area + getOccupiedArea(piece), 0),
    [pieces],
  );
  const hasPlacementOrientation =
    tool === PieceType.HALF_DISC ||
    tool === PieceType.THREE_QUARTER_DISC ||
    tool === PieceType.HANDSET;
  const placementLabel =
    tool === PieceType.HALF_DISC
      ? HALF_LABELS[placementOrientation]
      : tool === PieceType.THREE_QUARTER_DISC
        ? THREE_QUARTER_LABELS[placementOrientation]
        : HANDSET_LABELS[placementOrientation];
  const toolLabel = TOOLS.find((item) => item.type === tool)?.label ?? tool;
  const toolPreview = useMemo(
    () => ({ ...createPiece(tool, 0, 0, [], placementOrientation), id: 'tool-preview' }),
    [tool, placementOrientation],
  );
  const toolPreviewSize = getSize(toolPreview);
  const toolPreviewPosition = {
    x: (BOARD_COLS - toolPreviewSize.w) / 2,
    y: (BOARD_ROWS - toolPreviewSize.h) / 2,
  };
  const hoverPreview = useMemo(
    () =>
      hoverCell
        ? {
            ...createPiece(tool, hoverCell.x, hoverCell.y, [], placementOrientation),
            id: 'hover-preview',
          }
        : null,
    [hoverCell, tool, placementOrientation],
  );
  const hoverPreviewValid =
    hoverPreview !== null &&
    !(tool === PieceType.CAOCAO && pieces.some((piece) => piece.type === PieceType.CAOCAO)) &&
    canPlace(hoverPreview, pieces);

  const chooseTool = (type: Piece['type']) => {
    setTool(type);
    setPlacementOrientation(0);
    setMessage(null);
  };

  const changePlacementOrientation = (delta: number) => {
    setPlacementOrientation((current) => (current + delta + 4) % 4);
  };

  const placeAt = (x: number, y: number) => {
    const candidate = createPiece(tool, x, y, pieces, placementOrientation);
    if (tool === PieceType.CAOCAO && pieces.some((piece) => piece.type === PieceType.CAOCAO)) {
      setMessage('每个关卡只能放置一个曹操');
      return;
    }
    if (!canPlace(candidate, pieces)) {
      setMessage(
        hasPlacementOrientation
          ? `无法以“${placementLabel}”朝向放在这里`
          : '此处空间不足或与其他棋块重叠',
      );
      return;
    }
    const next = [...pieces, candidate];
    setPieces(next);
    setRender(toRenderPos(next));
    setSelectedId(candidate.id);
    setHoverCell(null);
    setMessage(null);
  };

  const updateSelected = (transform: (piece: Piece) => Piece) => {
    if (!selected) return;
    const candidate = transform(selected);
    if (!canPlace(candidate, pieces)) {
      setMessage('目标位置越界或被其他棋块占用');
      return;
    }
    const next = pieces.map((piece) => (piece.id === candidate.id ? candidate : piece));
    setPieces(next);
    setRender(toRenderPos(next));
    setMessage(null);
  };

  /** 工具栏旋转也严格使用游戏规则；初始朝向请在放置前选择。 */
  const rotateSelected = () => {
    if (!selected) return;
    let next: Piece[] | null = null;
    if (selected.type === PieceType.HALF_DISC || selected.type === PieceType.THREE_QUARTER_DISC) {
      next = rotatePiece(pieces, selected.id, 'clockwise');
    } else if (selected.type === PieceType.HANDSET) {
      for (const pivot of ['start', 'end'] as const) {
        const direction = handsetTurnDirection(selected, pivot);
        next = turnHandset(pieces, selected.id, pivot, direction);
        if (next) break;
      }
    }
    if (!next) {
      setMessage('当前空间不足，无法按游戏规则完成旋转');
      return;
    }
    setPieces(next);
    setRender(toRenderPos(next));
    setMessage(null);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    const next = pieces.filter((piece) => piece.id !== selectedId);
    setPieces(next);
    setRender(toRenderPos(next));
    setSelectedId(null);
    setMessage(null);
  };

  const save = () => {
    const error = validateCustomLayout(name, pieces);
    if (error) {
      setMessage(error);
      return;
    }
    onSave({ id: initial.id, name: name.trim(), pieces: pieces.map((piece) => ({ ...piece })) });
  };

  const openExport = () => {
    try {
      setLayoutCode(encodeLayout({ name, pieces }));
      setCodeMode('export');
      setCodeMessage(null);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof LayoutCodeError ? error.message : '导出局面失败');
    }
  };

  const openImport = () => {
    setLayoutCode('');
    setCodeMode('import');
    setCodeMessage(null);
    setMessage(null);
  };

  const importLayout = () => {
    try {
      const imported = decodeLayout(layoutCode);
      setName(imported.name);
      setPieces(imported.pieces);
      setRender(toRenderPos(imported.pieces));
      setSelectedId(null);
      setHoverCell(null);
      setMessage(null);
      setCodeMessage(`已载入“${imported.name}”，点击“保存关卡”后才会保存。`);
    } catch (error) {
      setCodeMessage(error instanceof LayoutCodeError ? error.message : '导入局面失败');
    }
  };

  const copyLayoutCode = async () => {
    try {
      await navigator.clipboard.writeText(layoutCode);
      setCodeMessage('编码已复制');
    } catch {
      setCodeMessage('无法自动复制，请手动选择编码');
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>, piece: Piece) => {
    const wantsPieceRotation =
      event.button === 2 &&
      (piece.type === PieceType.HALF_DISC || piece.type === PieceType.THREE_QUARTER_DISC);
    const wantsCornerTurn = event.button === 2 && piece.type === PieceType.HANDSET;
    if (event.button !== 0 && !wantsPieceRotation && !wantsCornerTurn) return;

    event.preventDefault();
    event.stopPropagation();
    setHoverCell(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(piece.id);
    setDraggingId(piece.id);
    setMessage(null);

    const rect = boardRef.current?.getBoundingClientRect();
    const cellW = rect ? rect.width / BOARD_COLS : 1;
    const cellH = rect ? rect.height / BOARD_ROWS : 1;

    if (wantsPieceRotation) {
      const center =
        piece.type === PieceType.HALF_DISC ? discCenter(piece) : { x: piece.x + 1, y: piece.y + 1 };
      const centerX = (rect?.left ?? 0) + center.x * cellW;
      const centerY = (rect?.top ?? 0) + center.y * cellH;
      dragRef.current = {
        kind: 'half',
        id: piece.id,
        centerX,
        centerY,
        previousAngle:
          (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI,
        degrees: 0,
        canClockwise: rotatePiece(pieces, piece.id, 'clockwise') !== null,
        canCounterclockwise: rotatePiece(pieces, piece.id, 'counterclockwise') !== null,
      };
      setRotationPreview({ id: piece.id, degrees: 0 });
      return;
    }

    if (wantsCornerTurn) {
      const center = handsetCenter(piece);
      const horizontal = getSize(piece).w > 1;
      const pointerBeforeCenter = horizontal
        ? event.clientX < (rect?.left ?? 0) + center.x * cellW
        : event.clientY < (rect?.top ?? 0) + center.y * cellH;
      const preferredPivot: HandsetPivot = pointerBeforeCenter ? 'start' : 'end';
      const options = (['start', 'end'] as const).flatMap((pivot) => {
        const direction = handsetTurnDirection(piece, pivot);
        const turned = turnHandset(pieces, piece.id, pivot, direction);
        const target = turned?.find((candidate) => candidate.id === piece.id);
        if (!target) return [];
        const targetCenter = handsetCenter(target);
        return [
          {
            pivot,
            direction,
            target,
            travelSign: Math.sign(
              horizontal ? targetCenter.y - center.y : targetCenter.x - center.x,
            ),
            sideSign: Math.sign(horizontal ? targetCenter.x - center.x : targetCenter.y - center.y),
          },
        ];
      });
      const preferredIndex = options.findIndex((option) => option.pivot === preferredPivot);
      const activeOption = preferredIndex >= 0 ? preferredIndex : options.length > 0 ? 0 : null;
      dragRef.current = {
        kind: 'corner',
        id: piece.id,
        startX: event.clientX,
        startY: event.clientY,
        horizontal,
        cellSize: horizontal ? cellH : cellW,
        preferredPivot,
        options,
        activeOption,
        degrees: 0,
      };
      setRotationPreview({
        id: piece.id,
        degrees: 0,
        target: activeOption === null ? undefined : options[activeOption].target,
      });
      return;
    }

    dragRef.current = {
      kind: 'move',
      id: piece.id,
      originX: piece.x,
      originY: piece.y,
      startX: event.clientX,
      startY: event.clientY,
      cellW,
      cellH,
      axis: null,
      range: {
        x: computeRange(pieces, piece, 'x'),
        y: computeRange(pieces, piece, 'y'),
      },
      lastX: piece.x,
      lastY: piece.y,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'half') {
      const angle =
        (Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180) / Math.PI;
      let delta = angle - drag.previousAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      drag.previousAngle = angle;
      const candidate = clamp(drag.degrees + delta, -90, 90);
      drag.degrees =
        (candidate > 0 && !drag.canClockwise) || (candidate < 0 && !drag.canCounterclockwise)
          ? 0
          : candidate;
      setRotationPreview({ id: drag.id, degrees: drag.degrees });
      return;
    }

    if (drag.kind === 'corner') {
      const primary = drag.horizontal ? event.clientY - drag.startY : event.clientX - drag.startX;
      const side = drag.horizontal ? event.clientX - drag.startX : event.clientY - drag.startY;
      const candidates = drag.options
        .map((option, index) => ({ option, index }))
        .filter(
          ({ option }) => Math.sign(primary) === 0 || option.travelSign === Math.sign(primary),
        );
      const sideSign = Math.abs(side) >= 4 ? Math.sign(side) : 0;
      const chosen =
        (sideSign !== 0 && candidates.find(({ option }) => option.sideSign === sideSign)) ||
        candidates.find(({ option }) => option.pivot === drag.preferredPivot) ||
        candidates[0];
      drag.activeOption = chosen?.index ?? null;
      const progress = chosen
        ? clamp(primary / (drag.cellSize * chosen.option.travelSign), 0, 1)
        : 0;
      drag.degrees = (chosen?.option.direction === 'clockwise' ? 1 : -1) * progress * 90;
      setRotationPreview({
        id: drag.id,
        degrees: drag.degrees,
        target: chosen?.option.target,
      });
      return;
    }

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.axis === null) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    const axis = drag.axis;
    const delta = axis === 'x' ? dx : dy;
    const cellSize = axis === 'x' ? drag.cellW : drag.cellH;
    const origin = axis === 'x' ? drag.originX : drag.originY;
    const value = clamp(origin + delta / cellSize, drag.range[axis].min, drag.range[axis].max);
    drag.lastX = axis === 'x' ? value : drag.lastX;
    drag.lastY = axis === 'y' ? value : drag.lastY;
    setRender((current) => ({ ...current, [drag.id]: { x: drag.lastX, y: drag.lastY } }));
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'half') {
      const direction: RotationDirection | null =
        Math.abs(drag.degrees) < 45 ? null : drag.degrees > 0 ? 'clockwise' : 'counterclockwise';
      const next = direction ? rotatePiece(pieces, drag.id, direction) : null;
      if (next) setPieces(next);
      setRender(toRenderPos(next ?? pieces));
    } else if (drag.kind === 'corner') {
      const option = drag.activeOption === null ? null : drag.options[drag.activeOption];
      const next =
        option && Math.abs(drag.degrees) >= 45
          ? turnHandset(pieces, drag.id, option.pivot, option.direction)
          : null;
      if (next) setPieces(next);
      setRender(toRenderPos(next ?? pieces));
    } else if (drag.axis === null) {
      setRender(toRenderPos(pieces));
    } else {
      const axis = drag.axis;
      const origin = axis === 'x' ? drag.originX : drag.originY;
      const target = Math.round(axis === 'x' ? drag.lastX : drag.lastY);
      const next = target === origin ? pieces : movePiece(pieces, drag.id, axis, target);
      setPieces(next);
      setRender(toRenderPos(next));
    }

    setRotationPreview(null);
    setDraggingId(null);
    dragRef.current = null;
  };

  const handlePointerCancel = () => {
    setRender(toRenderPos(pieces));
    setRotationPreview(null);
    setDraggingId(null);
    dragRef.current = null;
  };

  const handleBoardPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      if (hoverCell) setHoverCell(null);
      return;
    }
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * BOARD_COLS);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * BOARD_ROWS);
    if (x < 0 || x >= BOARD_COLS || y < 0 || y >= BOARD_ROWS) {
      setHoverCell(null);
      return;
    }
    if (hoverCell?.x !== x || hoverCell.y !== y) setHoverCell({ x, y });
  };

  return (
    <div className="editor-panel flex w-full max-w-[780px] flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-sm md:flex-row">
      <div className="w-full shrink-0 md:w-[340px]">
        <div
          ref={boardRef}
          data-testid="layout-editor-board"
          className="relative aspect-[4/5] w-full overflow-visible"
          onPointerMove={handleBoardPointerMove}
          onPointerLeave={() => setHoverCell(null)}
        >
          <Board />
          <div className="absolute inset-0 z-10 grid grid-cols-4 grid-rows-5">
            {Array.from({ length: BOARD_COLS * BOARD_ROWS }, (_, index) => {
              const x = index % BOARD_COLS;
              const y = Math.floor(index / BOARD_COLS);
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={`在第 ${y + 1} 行第 ${x + 1} 列放置棋块`}
                  className="cursor-crosshair transition-colors outline-none hover:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => placeAt(x, y)}
                />
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 z-20">
            {pieces.map((piece) => {
              const position = render[piece.id] ?? piece;
              return (
                <div key={piece.id} className="pointer-events-auto">
                  <PieceView
                    piece={piece}
                    renderX={position.x}
                    renderY={position.y}
                    selected={piece.id === selectedId}
                    dragging={piece.id === draggingId || piece.id === rotationPreview?.id}
                    rotationDegrees={rotationPreview?.id === piece.id ? rotationPreview.degrees : 0}
                    rotationTarget={
                      rotationPreview?.id === piece.id ? rotationPreview.target : undefined
                    }
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                  />
                </div>
              );
            })}
          </div>
          {hoverPreview && (
            <div
              data-testid="placement-hover-preview"
              data-valid={hoverPreviewValid}
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 z-30 transition-opacity ${
                hoverPreviewValid ? 'opacity-50' : 'opacity-25 grayscale'
              }`}
            >
              <PieceView
                piece={hoverPreview}
                renderX={hoverPreview.x}
                renderY={hoverPreview.y}
                selected={false}
                dragging
                onPointerDown={() => {}}
                onPointerMove={() => {}}
                onPointerUp={() => {}}
                onPointerCancel={() => {}}
              />
            </div>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          左键拖动平移 · 异形块按住右键拖动旋转
        </p>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div>
          <label htmlFor="layout-name" className="mb-1 block text-sm font-medium text-foreground">
            关卡名称
          </label>
          <input
            id="layout-name"
            value={name}
            maxLength={30}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="例如：我的转角挑战"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openImport}>
            <DownloadSimpleIcon size={16} /> 导入编码
          </Button>
          <Button variant="outline" size="sm" onClick={openExport}>
            <UploadSimpleIcon size={16} /> 导出当前局面
          </Button>
        </div>

        {codeMode && (
          <section
            role="dialog"
            aria-label={codeMode === 'import' ? '导入局面编码' : '导出局面编码'}
            className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {codeMode === 'import' ? '导入到编辑器' : '导出编辑器当前局面'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                KLP1 编码包含名称、棋块类型、坐标与朝向。
              </p>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              局面编码
              <textarea
                aria-label="局面编码"
                className="min-h-24 resize-y rounded-lg border border-input bg-background p-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={layoutCode}
                readOnly={codeMode === 'export'}
                placeholder="粘贴以 KLP1. 开头的编码"
                onChange={(event) => {
                  setLayoutCode(event.currentTarget.value);
                  setCodeMessage(null);
                }}
              />
            </label>
            {codeMessage && (
              <p role="status" className="text-xs text-muted-foreground">
                {codeMessage}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCodeMode(null)}>
                关闭
              </Button>
              {codeMode === 'export' ? (
                <Button size="sm" onClick={copyLayoutCode}>
                  <CopyIcon size={16} /> 复制编码
                </Button>
              ) : (
                <Button size="sm" onClick={importLayout} disabled={!layoutCode.trim()}>
                  <DownloadSimpleIcon size={16} /> 解析并载入
                </Button>
              )}
            </div>
          </section>
        )}

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">1. 选择棋块</p>
          <div className="grid grid-cols-2 gap-2">
            {TOOLS.map((item) => (
              <Button
                key={item.type}
                type="button"
                size="sm"
                variant={tool === item.type ? 'default' : 'outline'}
                aria-pressed={tool === item.type}
                onClick={() => chooseTool(item.type)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">当前放置预览</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {toolLabel}
              {hasPlacementOrientation ? ` · ${placementLabel}` : ''}
            </p>
          </div>
          <div
            aria-label="当前棋块预览"
            className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-md border border-border/70 bg-background/80"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <PieceView
                piece={toolPreview}
                renderX={toolPreviewPosition.x}
                renderY={toolPreviewPosition.y}
                selected={false}
                dragging
                onPointerDown={() => {}}
                onPointerMove={() => {}}
                onPointerUp={() => {}}
                onPointerCancel={() => {}}
              />
            </div>
          </div>
        </div>

        {hasPlacementOrientation && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-2 text-sm font-medium text-foreground">2. 放置前选择朝向</p>
            <div className="flex items-center justify-between gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => changePlacementOrientation(-1)}
                aria-label="逆时针切换放置朝向"
              >
                <ArrowCounterClockwiseIcon size={16} />
              </Button>
              <span className="rounded-md border border-border bg-background px-4 py-1.5 text-sm font-medium text-foreground">
                {placementLabel}
              </span>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => changePlacementOrientation(1)}
                aria-label="顺时针切换放置朝向"
              >
                <ArrowsClockwiseIcon size={16} />
              </Button>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/35 p-3">
          <p className="mb-2 text-sm font-semibold text-foreground">
            {selected
              ? `已选中：${TOOLS.find((item) => item.type === selected.type)?.label}`
              : '选择棋盘上的棋块进行调整'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              disabled={!selected}
              onClick={() => updateSelected((piece) => ({ ...piece, y: piece.y - 1 }))}
              aria-label="上移"
            >
              <ArrowUpIcon size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={!selected}
              onClick={() => updateSelected((piece) => ({ ...piece, y: piece.y + 1 }))}
              aria-label="下移"
            >
              <ArrowDownIcon size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={!selected}
              onClick={() => updateSelected((piece) => ({ ...piece, x: piece.x - 1 }))}
              aria-label="左移"
            >
              <ArrowLeftIcon size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={!selected}
              onClick={() => updateSelected((piece) => ({ ...piece, x: piece.x + 1 }))}
              aria-label="右移"
            >
              <ArrowRightIcon size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={
                selected?.type !== PieceType.HALF_DISC &&
                selected?.type !== PieceType.THREE_QUARTER_DISC &&
                selected?.type !== PieceType.HANDSET
              }
              onClick={rotateSelected}
              aria-label="按游戏规则旋转棋块"
            >
              <ArrowsClockwiseIcon size={16} />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={!selected}
              onClick={removeSelected}
              aria-label="删除棋块"
            >
              <TrashIcon size={16} />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span>
            已占用 {occupiedArea} / {BOARD_COLS * BOARD_ROWS} 格
          </span>
          <span>剩余 {BOARD_COLS * BOARD_ROWS - occupiedArea} 格</span>
        </div>
        {message && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {message}
          </p>
        )}

        <div className="mt-auto flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            <XIcon size={16} /> 取消
          </Button>
          <Button onClick={save}>
            <FloppyDiskIcon size={16} /> 保存关卡
          </Button>
        </div>
      </div>
    </div>
  );
}
