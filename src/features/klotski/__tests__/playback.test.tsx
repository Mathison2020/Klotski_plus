import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, OptionHTMLAttributes, SelectHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handsetOrientationDegrees } from '../engine';
import { KlotskiPage } from '../KlotskiPage';
import { HANDSET_SANDBOX } from '../layouts';
import { solveKlotski } from '../solver';

vi.mock('@/components/ui', () => ({
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) => (
    <button {...props} />
  ),
  NativeSelect: (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />,
  NativeSelectOption: (props: OptionHTMLAttributes<HTMLOptionElement>) => <option {...props} />,
  Slider: ({
    value,
    min,
    max,
    disabled,
    onValueChange,
  }: {
    value: readonly number[];
    min: number;
    max: number;
    disabled?: boolean;
    onValueChange: (value: number[]) => void;
  }) => (
    <input
      aria-label="演示进度"
      type="range"
      value={value[0]}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(event) => onValueChange([Number(event.currentTarget.value)])}
    />
  ),
}));

function selectLayout(name: string) {
  const option = screen.getByRole('option', { name }) as HTMLOptionElement;
  fireEvent.change(screen.getByRole('combobox'), { target: { value: option.value } });
}

describe('自动演示动画队列', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('连续播放等待平移动画结束后才开始下一次旋转', () => {
    render(<KlotskiPage />);
    selectLayout('双月回旋');
    fireEvent.click(screen.getByRole('button', { name: '开始演示' }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(20));

    const piece = screen.getByTestId('piece-three-quarter-2');
    expect(piece.style.top).toBe('60%');
    expect(piece.style.transform).toBe('rotate(270deg)');
    expect(piece.style.transitionDuration).toBe('120ms');

    act(() => vi.advanceTimersByTime(100));
    expect(piece.style.transform).toBe('rotate(270deg)');

    act(() => vi.advanceTimersByTime(50));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(80));
    expect(piece.style.transform).not.toBe('rotate(270deg)');
  });

  test('暂停后点击下一步会播放旋转动画再提交目标朝向', () => {
    render(<KlotskiPage />);
    selectLayout('双月回旋');
    fireEvent.click(screen.getByRole('button', { name: '开始演示' }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(20));
    fireEvent.click(screen.getByRole('button', { name: '暂停演示' }));
    act(() => vi.advanceTimersByTime(150));

    expect(screen.getByText('1 / 51')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    act(() => vi.advanceTimersByTime(0));

    const piece = screen.getByTestId('piece-three-quarter-2');
    act(() => vi.advanceTimersByTime(80));
    expect(piece.style.transform).not.toBe('rotate(270deg)');
    expect(piece.style.transform).not.toBe('rotate(0deg)');
    expect(piece.style.transitionProperty).toBe('none');
    expect(piece.style.transitionDuration).toBe('');

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText('2 / 51')).toBeTruthy();
    expect(screen.getByTestId('piece-three-quarter-2').style.transform).toBe('rotate(0deg)');
  });

  test('听筒单步后退时沿原转角轨迹反向旋转滑动', () => {
    const solution = solveKlotski(HANDSET_SANDBOX.pieces);
    expect(solution).not.toBeNull();
    if (!solution) return;

    const cornerIndex = solution.findIndex((action) => action.kind === 'corner-turn');
    const cornerAction = solution[cornerIndex];
    expect(cornerIndex).toBeGreaterThanOrEqual(0);
    if (cornerAction.kind !== 'corner-turn') return;

    render(<KlotskiPage />);
    selectLayout('辗转腾挪');
    fireEvent.click(screen.getByRole('button', { name: '开始演示' }));
    fireEvent.click(screen.getByRole('button', { name: '暂停演示' }));
    fireEvent.change(screen.getByRole('slider', { name: '演示进度' }), {
      target: { value: String(cornerIndex + 1) },
    });

    const piece = screen.getByTestId('piece-handset');
    const initialLeft = piece.style.left;
    const initialTop = piece.style.top;
    const initialTransform = piece.style.transform;

    fireEvent.click(screen.getByRole('button', { name: '上一步' }));
    act(() => vi.advanceTimersByTime(80));

    expect(piece.style.transitionProperty).toBe('none');
    expect(piece.style.transform).not.toBe(initialTransform);
    expect(`${piece.style.left},${piece.style.top}`).not.toBe(`${initialLeft},${initialTop}`);

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByText(`${cornerIndex} / ${solution.length}`)).toBeTruthy();
    expect(screen.getByTestId('piece-handset').style.transform).toBe(
      `rotate(${handsetOrientationDegrees(cornerAction.orientation)}deg)`,
    );
  });
});
