import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  CaretLeftIcon,
  CaretRightIcon,
  PencilSimpleIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { Button, NativeSelect, NativeSelectOption, Slider } from '@/components/ui';
import { Board, LayoutEditor, Piece as PieceView, type LayoutDraft } from './components';
import { BOARD_COLS, BOARD_ROWS } from './constants';
import { loadCustomLayouts, persistCustomLayouts, type CustomLayout } from './custom-layouts';
import {
  computeRange,
  discCenter,
  getHandsetOrientation,
  getOrientation,
  getSize,
  getThreeQuarterOrientation,
  handsetCenter,
  handsetTurnDirection,
  isWin,
  movePiece,
  rotatePiece,
  turnHandset,
} from './engine';
import { LAYOUTS } from './layouts';
import { solveKlotski, type SolverAction } from './solver';
import { PieceType, type HandsetPivot, type Piece, type RotationDirection } from './types';

/** 自动演示速度档位（每步间隔毫秒）。 */
const SPEEDS: readonly { label: string; ms: number }[] = [
  { label: '0.5×', ms: 240 },
  { label: '1×', ms: 120 },
  { label: '2×', ms: 60 },
  { label: '4×', ms: 30 },
];

interface MoveDragState {
  kind: 'move';
  id: string;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  cellW: number;
  cellH: number;
  axis: 'x' | 'y' | null;
  /** 按下时按两个轴各自算好的可移动范围，拖动中直接查表 clamp。 */
  range: { x: { min: number; max: number }; y: { min: number; max: number } };
  /** 实时浮点格坐标（渲染用），拖动过程中连续更新。 */
  lastX: number;
  lastY: number;
}

interface RotationDragState {
  kind: 'rotate';
  id: string;
  centerX: number;
  centerY: number;
  previousPointerAngle: number;
  degrees: number;
  canClockwise: boolean;
  canCounterclockwise: boolean;
}

interface CornerDragState {
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

type DragState = MoveDragState | RotationDragState | CornerDragState;

interface DemoStepAnimation {
  index: number;
  action: SolverAction;
}

type RenderPos = Record<string, { x: number; y: number }>;

function toRenderPos(pieces: Piece[]): RenderPos {
  const map: RenderPos = {};
  for (const p of pieces) map[p.id] = { x: p.x, y: p.y };
  return map;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** 按动作记录定位盘面中的棋块并执行，返回新盘面与棋块 id。 */
function applySolverMove(
  pieces: Piece[],
  action: SolverAction,
): { next: Piece[]; id: string } | null {
  if (action.kind === 'rotate') {
    const piece = pieces.find(
      (candidate) =>
        candidate.type === action.pieceType &&
        candidate.x === action.from.x &&
        candidate.y === action.from.y &&
        (candidate.type === PieceType.HALF_DISC
          ? getOrientation(candidate)
          : getThreeQuarterOrientation(candidate)) === action.orientation,
    );
    if (!piece) return null;
    const next = rotatePiece(pieces, piece.id, action.direction);
    return next ? { next, id: piece.id } : null;
  }

  if (action.kind === 'corner-turn') {
    const piece = pieces.find(
      (candidate) =>
        candidate.type === PieceType.HANDSET &&
        candidate.x === action.from.x &&
        candidate.y === action.from.y &&
        getHandsetOrientation(candidate) === action.orientation,
    );
    if (!piece) return null;
    const next = turnHandset(pieces, piece.id, action.pivot, action.direction);
    return next ? { next, id: piece.id } : null;
  }

  const index = pieces.findIndex((p) => {
    const size = getSize(p);
    return (
      size.w === action.w && size.h === action.h && p.x === action.from.x && p.y === action.from.y
    );
  });
  if (index === -1) return null;

  const next = [...pieces];
  next[index] = { ...next[index], x: action.to.x, y: action.to.y };
  return { next, id: next[index].id };
}

/** 从初始布局回放 solution 的前 upto 步，得到对应盘面（纯函数）。 */
function replay(initial: Piece[], solution: SolverAction[], upto: number): Piece[] {
  let board = initial;
  for (let i = 0; i < upto; i++) {
    const applied = applySolverMove(board, solution[i]);
    if (applied) board = applied.next;
  }
  return board;
}

/** 华容道页面：连续拖动移动、点击高亮、关卡切换、一键求解演示（可调速/暂停/步进/拖进度条）。 */
export function KlotskiPage() {
  const [customLayouts, setCustomLayouts] = useState<CustomLayout[]>(loadCustomLayouts);
  const layouts = useMemo(
    () => [...LAYOUTS, ...customLayouts.map(({ name, pieces }) => ({ name, pieces }))],
    [customLayouts],
  );
  const [layoutIdx, setLayoutIdx] = useState(0);
  const [pieces, setPieces] = useState(LAYOUTS[0].pieces);
  const [render, setRender] = useState<RenderPos>(() => toRenderPos(LAYOUTS[0].pieces));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [rotationPreview, setRotationPreview] = useState<{
    id: string;
    degrees: number;
    target?: Piece;
  } | null>(null);
  const [steps, setSteps] = useState(0);
  const [solution, setSolution] = useState<SolverAction[] | null>(null);
  const [demoStart, setDemoStart] = useState<Piece[] | null>(null);
  const [playIndex, setPlayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pendingSingleStep, setPendingSingleStep] = useState(false);
  const [activeDemoStep, setActiveDemoStep] = useState<DemoStepAnimation | null>(null);
  const [speedMs, setSpeedMs] = useState(SPEEDS[1].ms);
  const [editor, setEditor] = useState<LayoutDraft | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const total = solution?.length ?? 0;
  const demoPieces = useMemo(
    () => (solution && demoStart ? replay(demoStart, solution, playIndex) : null),
    [demoStart, solution, playIndex],
  );
  const boardPieces = demoPieces ?? pieces;
  const boardRender = useMemo(
    () => (demoPieces ? toRenderPos(demoPieces) : render),
    [demoPieces, render],
  );

  const won = isWin(boardPieces) && activeDemoStep === null;
  const selectedPiece = selectedId ? pieces.find((p) => p.id === selectedId) : null;
  const moveAnimationMs = Math.max(speedMs, 60);

  // 连续播放与“下一步”共用同一条动画队列；任何时刻只允许一个动作在执行。
  useEffect(() => {
    if ((!playing && !pendingSingleStep) || activeDemoStep || solution === null) return;
    const timer = setTimeout(() => {
      if (playIndex >= solution.length) {
        setPendingSingleStep(false);
        setPlaying(false);
        return;
      }

      setPendingSingleStep(false);
      setActiveDemoStep({ index: playIndex, action: solution[playIndex] });
    }, 0);
    return () => clearTimeout(timer);
  }, [activeDemoStep, pendingSingleStep, playIndex, playing, solution]);

  // 平移先提交目标坐标，并等待 CSS 位移动画结束；旋转则逐帧绘制到目标姿态。
  // activeDemoStep 在整个动作期间保持非空，因此下一动作不可能提前开始。
  useEffect(() => {
    if (!activeDemoStep || solution === null) return;

    const { action, index } = activeDemoStep;
    if (action.kind === 'move') {
      let finishTimer: ReturnType<typeof setTimeout> | null = null;
      const frame = requestAnimationFrame(() => {
        setPlayIndex(index + 1);
        finishTimer = setTimeout(() => {
          setSteps((count) => count + 1);
          setActiveDemoStep(null);
        }, moveAnimationMs + 20);
      });
      return () => {
        cancelAnimationFrame(frame);
        if (finishTimer !== null) clearTimeout(finishTimer);
      };
    }

    if ((action.kind === 'rotate' || action.kind === 'corner-turn') && demoStart) {
      const sourcePieces = replay(demoStart, solution, index);
      const applied = applySolverMove(sourcePieces, action);
      const targetPiece = applied?.next.find((piece) => piece.id === applied.id);
      if (applied && targetPiece) {
        // 棋盘的普通一步很短；旋转至少保留 120ms，并在常用速度下放慢一倍，
        // 否则 90° 的连续帧在人眼看来仍像直接切换。
        const duration = Math.max(speedMs * 2, 120);
        let startedAt: number | null = null;
        let frame = 0;
        const animate = (now: number) => {
          if (startedAt === null) startedAt = now;
          const progress = clamp((now - startedAt) / duration, 0, 1);
          const eased = 1 - (1 - progress) ** 3;
          setRotationPreview({
            id: applied.id,
            degrees: (action.direction === 'clockwise' ? 1 : -1) * eased * 90,
            target: action.kind === 'corner-turn' ? targetPiece : undefined,
          });
          if (progress < 1) {
            frame = requestAnimationFrame(animate);
          } else {
            setRotationPreview(null);
            setSteps((count) => count + 1);
            setPlayIndex(index + 1);
            setActiveDemoStep(null);
          }
        };
        frame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frame);
      }
    }

    const timer = setTimeout(() => setActiveDemoStep(null), 0);
    return () => clearTimeout(timer);
  }, [activeDemoStep, demoStart, moveAnimationMs, solution, speedMs]);

  const startDemo = () => {
    if (won) return;
    const s = solveKlotski(pieces);
    if (!s) return;
    setDemoStart(pieces);
    setSolution(s);
    setPlayIndex(0);
    setPendingSingleStep(false);
    setActiveDemoStep(null);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (solution === null) {
      startDemo();
    } else if (playIndex >= total) {
      setPlayIndex(0);
      setPendingSingleStep(false);
      setActiveDemoStep(null);
      setPlaying(true);
    } else {
      setPlaying((p) => !p);
    }
  };

  const stepBy = (delta: number) => {
    if (solution === null || activeDemoStep) return;
    setPlaying(false);
    setRotationPreview(null);
    if (delta > 0) {
      if (playIndex < total) setPendingSingleStep(true);
      return;
    }
    setPendingSingleStep(false);
    const next = clamp(playIndex + delta, 0, total);
    setPlayIndex(next);
  };

  const handleSliderChange = (value: number | readonly number[]) => {
    if (solution === null) return;
    if (activeDemoStep) return;
    const next = Array.isArray(value) ? Number(value[0]) : Number(value);
    setPlaying(false);
    setPendingSingleStep(false);
    setRotationPreview(null);
    const nextIndex = clamp(next, 0, total);
    if (nextIndex > playIndex) setSteps((count) => count + nextIndex - playIndex);
    setPlayIndex(nextIndex);
  };

  const rotateSelected = (direction: RotationDirection = 'clockwise') => {
    if (selectedId === null || playing || activeDemoStep) return;
    const rotated = rotatePiece(pieces, selectedId, direction);
    if (!rotated) return;
    setPieces(rotated);
    setRender(toRenderPos(rotated));
    setSteps((n) => n + 1);
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>, piece: Piece) => {
    if (playing || activeDemoStep) return;
    const wantsPieceRotation =
      e.button === 2 &&
      (piece.type === PieceType.HALF_DISC || piece.type === PieceType.THREE_QUARTER_DISC);
    const wantsCornerTurn = e.button === 2 && piece.type === PieceType.HANDSET;
    if (e.button !== 0 && !wantsPieceRotation && !wantsCornerTurn) return;
    if (wantsPieceRotation || wantsCornerTurn) e.preventDefault();

    // 演示模式下用户手动拖动：把当前演示盘面固化为手动状态，退出演示。
    if (solution !== null) {
      setSolution(null);
      setDemoStart(null);
      setPlayIndex(0);
      setPendingSingleStep(false);
      setActiveDemoStep(null);
      setPieces(boardPieces);
      setRender(toRenderPos(boardPieces));
    }
    if (won) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(piece.id);
    setDraggingId(piece.id);

    const rect = boardRef.current?.getBoundingClientRect();
    const cellW = rect ? rect.width / BOARD_COLS : 1;
    const cellH = rect ? rect.height / BOARD_ROWS : 1;

    if (wantsPieceRotation) {
      const center =
        piece.type === PieceType.HALF_DISC ? discCenter(piece) : { x: piece.x + 1, y: piece.y + 1 };
      const centerX = (rect?.left ?? 0) + center.x * cellW;
      const centerY = (rect?.top ?? 0) + center.y * cellH;
      dragRef.current = {
        kind: 'rotate',
        id: piece.id,
        centerX,
        centerY,
        previousPointerAngle:
          (Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180) / Math.PI,
        degrees: 0,
        canClockwise: rotatePiece(boardPieces, piece.id, 'clockwise') !== null,
        canCounterclockwise: rotatePiece(boardPieces, piece.id, 'counterclockwise') !== null,
      };
      setRotationPreview({ id: piece.id, degrees: 0 });
      return;
    }

    if (wantsCornerTurn) {
      const center = handsetCenter(piece);
      const size = getSize(piece);
      const horizontal = size.w > size.h;
      const pointerBeforeCenter = horizontal
        ? e.clientX < (rect?.left ?? 0) + center.x * cellW
        : e.clientY < (rect?.top ?? 0) + center.y * cellH;
      const preferredPivot: HandsetPivot = pointerBeforeCenter ? 'start' : 'end';
      const options = (['start', 'end'] as const).flatMap((pivot) => {
        const direction = handsetTurnDirection(piece, pivot);
        const turned = turnHandset(boardPieces, piece.id, pivot, direction);
        const target = turned?.find((candidate) => candidate.id === piece.id);
        if (!target) return [];
        const targetCenter = handsetCenter(target);
        const primaryTravel = horizontal ? targetCenter.y - center.y : targetCenter.x - center.x;
        const sideTravel = horizontal ? targetCenter.x - center.x : targetCenter.y - center.y;
        return [
          {
            pivot,
            direction,
            target,
            travelSign: Math.sign(primaryTravel),
            sideSign: Math.sign(sideTravel),
          },
        ];
      });
      const activeOption = Math.max(
        options.findIndex((option) => option.pivot === preferredPivot),
        options.length > 0 ? 0 : -1,
      );
      dragRef.current = {
        kind: 'corner',
        id: piece.id,
        startX: e.clientX,
        startY: e.clientY,
        horizontal,
        cellSize: horizontal ? cellH : cellW,
        preferredPivot,
        options,
        activeOption: activeOption >= 0 ? activeOption : null,
        degrees: 0,
      };
      setRotationPreview({
        id: piece.id,
        degrees: 0,
        target: activeOption >= 0 ? options[activeOption].target : undefined,
      });
      return;
    }

    dragRef.current = {
      kind: 'move',
      id: piece.id,
      originX: piece.x,
      originY: piece.y,
      startX: e.clientX,
      startY: e.clientY,
      cellW,
      cellH,
      axis: null,
      range: {
        x: computeRange(boardPieces, piece, 'x'),
        y: computeRange(boardPieces, piece, 'y'),
      },
      lastX: piece.x,
      lastY: piece.y,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'corner') {
      const primaryTravel = drag.horizontal ? e.clientY - drag.startY : e.clientX - drag.startX;
      const sideTravel = drag.horizontal ? e.clientX - drag.startX : e.clientY - drag.startY;
      const travelSign = Math.sign(primaryTravel);
      const candidates = drag.options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => travelSign === 0 || option.travelSign === travelSign);
      const sideSign = Math.abs(sideTravel) >= 4 ? Math.sign(sideTravel) : 0;
      const chosen =
        (sideSign !== 0 && candidates.find(({ option }) => option.sideSign === sideSign)) ||
        candidates.find(({ option }) => option.pivot === drag.preferredPivot) ||
        candidates[0];
      drag.activeOption = chosen?.index ?? null;
      const active = chosen?.option;
      const progress = active
        ? clamp(primaryTravel / (drag.cellSize * active.travelSign), 0, 1)
        : 0;
      drag.degrees = (active?.direction === 'clockwise' ? 1 : -1) * progress * 90;
      setRotationPreview({
        id: drag.id,
        degrees: drag.degrees,
        target: active?.target,
      });
      return;
    }

    if (drag.kind === 'rotate') {
      const pointerAngle =
        (Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX) * 180) / Math.PI;
      let delta = pointerAngle - drag.previousPointerAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      drag.previousPointerAngle = pointerAngle;

      const candidate = clamp(drag.degrees + delta, -90, 90);
      const canClockwise = drag.canClockwise;
      const canCounterclockwise = drag.canCounterclockwise;
      drag.degrees =
        (candidate > 0 && !canClockwise) || (candidate < 0 && !canCounterclockwise) ? 0 : candidate;
      setRotationPreview({ id: drag.id, degrees: drag.degrees });
      return;
    }

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.axis === null) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }

    const axis = drag.axis;
    const delta = axis === 'x' ? dx : dy;
    const cellSize = axis === 'x' ? drag.cellW : drag.cellH;
    const origin = axis === 'x' ? drag.originX : drag.originY;
    const float = origin + delta / cellSize;
    const clamped = clamp(float, drag.range[axis].min, drag.range[axis].max);

    const nextX = axis === 'x' ? clamped : drag.lastX;
    const nextY = axis === 'y' ? clamped : drag.lastY;
    drag.lastX = nextX;
    drag.lastY = nextY;

    setRender((prev) => ({ ...prev, [drag.id]: { x: nextX, y: nextY } }));
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'rotate' || drag.kind === 'corner') {
      const cornerOption =
        drag.kind === 'corner' && drag.activeOption !== null
          ? drag.options[drag.activeOption]
          : null;
      const direction: RotationDirection | null =
        Math.abs(drag.degrees) < 45
          ? null
          : drag.kind === 'corner'
            ? (cornerOption?.direction ?? null)
            : drag.degrees > 0
              ? 'clockwise'
              : 'counterclockwise';
      if (direction) {
        const rotated =
          drag.kind === 'rotate'
            ? rotatePiece(pieces, drag.id, direction)
            : cornerOption
              ? turnHandset(pieces, drag.id, cornerOption.pivot, direction)
              : null;
        if (rotated) {
          setPieces(rotated);
          setRender(toRenderPos(rotated));
          setSteps((n) => n + 1);
        }
      }
      setRotationPreview(null);
      setDraggingId(null);
      dragRef.current = null;
      return;
    }

    if (drag.axis === null) {
      setRender(toRenderPos(pieces));
    } else {
      const axis = drag.axis;
      const origin = axis === 'x' ? drag.originX : drag.originY;
      const rounded = Math.round(axis === 'x' ? drag.lastX : drag.lastY);

      if (rounded === origin) {
        setRender(toRenderPos(pieces));
      } else {
        const next = movePiece(pieces, drag.id, axis, rounded);
        setPieces(next);
        setRender(toRenderPos(next));
        setSteps((n) => n + 1);
      }
    }

    setDraggingId(null);
    dragRef.current = null;
  };

  const handlePointerCancel = () => {
    setRender(toRenderPos(pieces));
    setRotationPreview(null);
    setDraggingId(null);
    dragRef.current = null;
  };

  const loadLayout = (idx: number) => {
    const layout = layouts[idx];
    if (!layout) return;
    setLayoutIdx(idx);
    setSolution(null);
    setDemoStart(null);
    setPlayIndex(0);
    setPlaying(false);
    setPendingSingleStep(false);
    setActiveDemoStep(null);
    setPieces(layout.pieces);
    setRender(toRenderPos(layout.pieces));
    setSelectedId(null);
    setDraggingId(null);
    setRotationPreview(null);
    setSteps(0);
    setDeleteArmed(false);
    dragRef.current = null;
  };

  const reset = () => loadLayout(layoutIdx);

  const saveCustomLayout = (draft: LayoutDraft) => {
    const id = draft.id ?? `layout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saved: CustomLayout = {
      id,
      name: draft.name,
      pieces: draft.pieces.map((piece) => ({ ...piece })),
    };
    const existingIndex = customLayouts.findIndex((layout) => layout.id === id);
    const next =
      existingIndex === -1
        ? [...customLayouts, saved]
        : customLayouts.map((layout) => (layout.id === id ? saved : layout));
    persistCustomLayouts(next);
    setCustomLayouts(next);
    setEditor(null);

    const customIndex = next.findIndex((layout) => layout.id === id);
    const nextLayoutIndex = LAYOUTS.length + customIndex;
    setLayoutIdx(nextLayoutIndex);
    setSolution(null);
    setDemoStart(null);
    setPlayIndex(0);
    setPlaying(false);
    setPendingSingleStep(false);
    setActiveDemoStep(null);
    setPieces(saved.pieces);
    setRender(toRenderPos(saved.pieces));
    setSelectedId(null);
    setDraggingId(null);
    setRotationPreview(null);
    setSteps(0);
    dragRef.current = null;
  };

  const currentCustom =
    layoutIdx >= LAYOUTS.length ? customLayouts[layoutIdx - LAYOUTS.length] : undefined;

  const deleteCurrentCustom = () => {
    if (!currentCustom) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    const next = customLayouts.filter((layout) => layout.id !== currentCustom.id);
    persistCustomLayouts(next);
    setCustomLayouts(next);
    setLayoutIdx(0);
    setPieces(LAYOUTS[0].pieces);
    setRender(toRenderPos(LAYOUTS[0].pieces));
    setSelectedId(null);
    setSolution(null);
    setDemoStart(null);
    setPlayIndex(0);
    setPlaying(false);
    setPendingSingleStep(false);
    setActiveDemoStep(null);
    setSteps(0);
  };

  const sliderValue = useMemo(() => (solution === null ? [0] : [playIndex]), [solution, playIndex]);

  if (editor) {
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6"
        onContextMenu={(event) => event.preventDefault()}
      >
        <header className="text-center">
          <h1 className="text-2xl font-semibold text-foreground">关卡编辑器</h1>
          <p className="mt-1 text-sm text-muted-foreground">手动摆放棋块并保存到当前浏览器</p>
        </header>
        <LayoutEditor initial={editor} onCancel={() => setEditor(null)} onSave={saveCustomLayout} />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-6"
      onContextMenu={(event) => event.preventDefault()}
    >
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">华容道</h1>
        <p className="mt-1 text-sm text-muted-foreground">拖动棋子，把曹操移到底部出口</p>
      </header>

      <div className="flex w-full max-w-[340px] items-center justify-center gap-3">
        <span className="text-sm text-muted-foreground">关卡</span>
        <NativeSelect value={layoutIdx} onChange={(e) => loadLayout(Number(e.currentTarget.value))}>
          {layouts.map((layout, i) => (
            <NativeSelectOption key={i} value={i}>
              {i >= LAYOUTS.length ? `自定义 · ${layout.name}` : layout.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditor({ name: '我的关卡', pieces: [] })}
        >
          <PlusIcon size={16} /> 新建关卡
        </Button>
        {currentCustom && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setEditor({
                  id: currentCustom.id,
                  name: currentCustom.name,
                  pieces: currentCustom.pieces,
                })
              }
            >
              <PencilSimpleIcon size={16} /> 编辑
            </Button>
            <Button variant="outline" size="sm" onClick={deleteCurrentCustom}>
              <TrashIcon size={16} /> {deleteArmed ? '确认删除' : '删除'}
            </Button>
          </>
        )}
      </div>

      <div ref={boardRef} className="relative aspect-[4/5] w-full max-w-[340px]">
        <Board />
        {boardPieces.map((piece) => {
          const pos = boardRender[piece.id];
          return (
            <PieceView
              key={piece.id}
              piece={piece}
              renderX={pos.x}
              renderY={pos.y}
              selected={piece.id === selectedId}
              dragging={piece.id === draggingId || piece.id === rotationPreview?.id}
              rotationDegrees={rotationPreview?.id === piece.id ? rotationPreview.degrees : 0}
              rotationTarget={rotationPreview?.id === piece.id ? rotationPreview.target : undefined}
              transitionDurationMs={solution === null ? undefined : moveAnimationMs}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
          );
        })}
        {won && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/80 backdrop-blur-sm">
            <p className="text-xl font-semibold text-foreground">恭喜过关！</p>
            <p className="text-sm text-muted-foreground">
              {solution === null ? `共用 ${steps} 步` : `最优 ${total} 步`}
            </p>
          </div>
        )}
      </div>

      <div className="flex w-full max-w-[340px] flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Slider
              value={sliderValue}
              min={0}
              max={solution === null ? 1 : total}
              step={1}
              disabled={solution === null || activeDemoStep !== null}
              onValueChange={handleSliderChange}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {solution === null ? '-' : `${playIndex} / ${total}`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => stepBy(-1)}
              disabled={solution === null || playIndex <= 0 || activeDemoStep !== null}
              aria-label="上一步"
            >
              <CaretLeftIcon size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={togglePlay}
              disabled={activeDemoStep !== null && !playing}
              aria-label={playing ? '暂停演示' : solution === null ? '开始演示' : '继续演示'}
            >
              {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => stepBy(1)}
              disabled={solution === null || playIndex >= total || activeDemoStep !== null}
              aria-label="下一步"
            >
              <CaretRightIcon size={16} />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <Button
                key={s.ms}
                variant={speedMs === s.ms ? 'default' : 'outline'}
                size="xs"
                onClick={() => setSpeedMs(s.ms)}
                disabled={activeDemoStep !== null}
              >
                {s.label}
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => rotateSelected('clockwise')}
            disabled={
              (selectedPiece?.type !== PieceType.HALF_DISC &&
                selectedPiece?.type !== PieceType.THREE_QUARTER_DISC) ||
              playing ||
              activeDemoStep !== null
            }
            aria-label="顺时针旋转棋块"
            title="顺时针旋转选中的半圆或3/4圆（也可按住右键环绕拖动）"
          >
            <ArrowsClockwiseIcon size={16} />
          </Button>

          <Button
            variant="outline"
            size="icon-sm"
            onClick={reset}
            aria-label="重新开始"
            title="重新开始"
          >
            <ArrowCounterClockwiseIcon size={16} />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {solution === null ? (
            <span>手动模式 · 左键平移 · 右键拖动旋转/转角 · 步数 {steps}</span>
          ) : (
            <span>演示模式 · 步数 {steps}</span>
          )}
        </div>
      </div>
    </div>
  );
}
