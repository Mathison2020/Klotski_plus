import { BOARD_COLS, BOARD_ROWS } from '../constants';
import {
  discCenter,
  getHandsetOrientation,
  getOrientation,
  getSize,
  handsetCenter,
  handsetOrientationDegrees,
  handsetTurnCenter,
  orientationDegrees,
} from '../engine';
import { PieceType, type Piece } from '../types';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

const LABEL: Record<Piece['type'], string> = {
  [PieceType.CAOCAO]: '曹操',
  [PieceType.GENERAL_H]: '将',
  [PieceType.GENERAL_V]: '将',
  [PieceType.SOLDIER]: '卒',
  [PieceType.HALF_DISC]: '半',
  [PieceType.HANDSET]: '听筒',
};

const VARIANT: Record<Piece['type'], string> = {
  [PieceType.CAOCAO]: 'bg-primary text-primary-foreground',
  [PieceType.GENERAL_H]: 'bg-accent text-accent-foreground',
  [PieceType.GENERAL_V]: 'bg-accent text-accent-foreground',
  [PieceType.SOLDIER]: 'bg-muted text-muted-foreground',
  [PieceType.HALF_DISC]: 'bg-secondary text-secondary-foreground',
  [PieceType.HANDSET]: 'bg-secondary text-secondary-foreground',
};

interface PieceProps {
  piece: Piece;
  /** 渲染用格坐标（拖动中为浮点，静止时为整数），与游戏状态解耦以实现连续动画。 */
  renderX: number;
  renderY: number;
  selected: boolean;
  /** 正在拖动时关闭 left/top 的过渡，保持跟手；松手后开启，平滑吸附到整格。 */
  dragging: boolean;
  /** 右键旋转拖动期间，相对当前朝向的临时角度。 */
  rotationDegrees?: number;
  /** 听筒转角动作的目标状态，用于计算半圆中心轨迹。 */
  rotationTarget?: Piece;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, piece: Piece) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

function Handset({
  piece,
  renderX,
  renderY,
  selected,
  dragging,
  rotationDegrees = 0,
  rotationTarget,
  ...events
}: {
  piece: Piece;
  renderX: number;
  renderY: number;
  selected: boolean;
  dragging: boolean;
  rotationDegrees?: number;
  rotationTarget?: Piece;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const sourceCenter = handsetCenter({ ...piece, x: renderX, y: renderY });
  const progress = Math.min(Math.abs(rotationDegrees) / 90, 1);
  const center = rotationTarget
    ? handsetTurnCenter({ ...piece, x: renderX, y: renderY }, rotationTarget, progress)
    : sourceCenter;
  const baseAngle = handsetOrientationDegrees(getHandsetOrientation(piece));
  const style: CSSProperties = {
    left: `${((center.x - 1.5) / BOARD_COLS) * 100}%`,
    top: `${((center.y - 0.5) / BOARD_ROWS) * 100}%`,
    width: `${(3 / BOARD_COLS) * 100}%`,
    height: `${(1 / BOARD_ROWS) * 100}%`,
    transformOrigin: '50% 50%',
    transform: `rotate(${baseAngle + rotationDegrees}deg)`,
  };

  return (
    <div
      data-testid={`piece-${piece.id}`}
      aria-label="电话听筒块"
      className={`absolute touch-none select-none ${
        // 转角预览的末帧可能与目标朝向相差整整 360°（例如 LEFT -> DOWN：
        // -180° 与 180°）。transform 若参与 CSS 过渡，浏览器会在提交状态时
        // 额外旋转一整圈；位置仍保留吸附动画，角度则直接切到等价姿态。
        dragging ? '' : 'transition-[left,top] duration-150 ease-out'
      }`}
      style={style}
      {...events}
    >
      <svg className="h-full w-full overflow-visible" viewBox="0 0 300 100" aria-hidden="true">
        <path
          d="M4 0.5 H96 Q100 0.5 100 4.5 C100 30.3 122.386 50.5 150 50.5 C177.614 50.5 200 30.3 200 4.5 Q200 0.5 204 0.5 H296 Q299.5 0.5 299.5 4 C299.5 55.452 254.952 99.5 200 99.5 H100 C45.048 99.5 0.5 55.452 0.5 4 Q0.5 0.5 4 0.5 Z"
          transform="translate(3 3) scale(0.98 0.94)"
          fill="var(--secondary)"
          stroke={selected ? 'var(--ring)' : 'var(--border)'}
          strokeWidth={selected ? 2 : 1}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <span className="pointer-events-none absolute inset-x-0 top-[72%] -translate-y-1/2 text-center text-sm font-medium text-secondary-foreground">
        将
      </span>
    </div>
  );
}

function getSizeStyle(piece: Piece): { w: number; h: number } {
  return getSize(piece);
}

/**
 * 半圆块渲染：物理占用始终是 1×2 格（竖放基准）的外接矩形，绝不扩到 2×2。
 *
 * 半圆几何：直径 = 外接矩形的长边（2 格），半径 = 短边（1 格），圆心 = 直径中点 = 整数格点。
 * 竖放时圆心在左竖边中点 (0, 1)，平边贴左、圆弧朝右凸。
 *
 * DOM 始终画一个右凸的 1×2 半圆，并把它放到统一圆心后旋转。状态坐标只用于推导圆心，
 * 不再把“旋转后的外接框左上角”误当作竖放图形的左上角。
 */
function HalfDisc({
  piece,
  renderX,
  renderY,
  selected,
  dragging,
  rotationDegrees = 0,
  ...events
}: {
  piece: Piece;
  renderX: number;
  renderY: number;
  selected: boolean;
  dragging: boolean;
  rotationDegrees?: number;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const center = discCenter({ ...piece, x: renderX, y: renderY });
  const angle = orientationDegrees(getOrientation(piece)) + rotationDegrees;

  const style: CSSProperties = {
    left: `${(center.x / BOARD_COLS) * 100}%`,
    top: `${((center.y - 1) / BOARD_ROWS) * 100}%`,
    width: `${(1 / BOARD_COLS) * 100}%`,
    height: `${(2 / BOARD_ROWS) * 100}%`,
    transformOrigin: '0% 50%',
    transform: `rotate(${angle}deg)`,
  };

  // 竖放基准图像：右凸半椭圆（x 轴半径=满宽 1 格，y 轴半径=半高 1 格），平边在左。
  const radius = '6px 100% 100% 6px / 6px 50% 50% 6px';
  return (
    <div
      data-testid={`piece-${piece.id}`}
      aria-label="半圆块"
      className={`absolute touch-none p-[3px] select-none ${
        dragging ? '' : 'transition-[left,top] duration-150 ease-out'
      }`}
      style={style}
      {...events}
    >
      <div
        data-testid={`piece-${piece.id}-shape`}
        className={`relative flex h-full w-full items-center justify-center border border-border bg-secondary ${
          selected ? 'ring-2 ring-ring ring-offset-1' : ''
        }`}
        style={{ borderRadius: radius, overflow: 'hidden' }}
      >
        <span className="text-sm font-medium text-secondary-foreground">将</span>
      </div>
    </div>
  );
}

export function Piece({
  piece,
  renderX,
  renderY,
  selected,
  dragging,
  rotationDegrees,
  rotationTarget,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: PieceProps) {
  const size = getSizeStyle(piece);

  const isHalfDisc = piece.type === PieceType.HALF_DISC;
  if (isHalfDisc) {
    return (
      <HalfDisc
        piece={piece}
        renderX={renderX}
        renderY={renderY}
        selected={selected}
        dragging={dragging}
        rotationDegrees={rotationDegrees}
        onPointerDown={(e) => onPointerDown(e, piece)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    );
  }

  if (piece.type === PieceType.HANDSET) {
    return (
      <Handset
        piece={piece}
        renderX={renderX}
        renderY={renderY}
        selected={selected}
        dragging={dragging}
        rotationDegrees={rotationDegrees}
        rotationTarget={rotationTarget}
        onPointerDown={(e) => onPointerDown(e, piece)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    );
  }

  const style: CSSProperties = {
    left: `${(renderX / BOARD_COLS) * 100}%`,
    top: `${(renderY / BOARD_ROWS) * 100}%`,
    width: `${(size.w / BOARD_COLS) * 100}%`,
    height: `${(size.h / BOARD_ROWS) * 100}%`,
  };

  return (
    <div
      data-testid={`piece-${piece.id}`}
      className={`absolute touch-none p-[3px] select-none ${
        dragging ? '' : 'transition-[left,top] duration-150 ease-out'
      }`}
      style={style}
      onPointerDown={(e) => onPointerDown(e, piece)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div
        data-testid={`piece-${piece.id}-shape`}
        className={`flex h-full w-full items-center justify-center rounded-md border border-border font-medium ${VARIANT[piece.type]}${
          selected ? ' ring-2 ring-ring ring-offset-1' : ''
        }`}
      >
        <span className={piece.type === PieceType.CAOCAO ? 'text-lg' : 'text-sm'}>
          {LABEL[piece.type]}
        </span>
      </div>
    </div>
  );
}
