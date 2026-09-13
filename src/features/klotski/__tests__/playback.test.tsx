import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, OptionHTMLAttributes, SelectHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { KlotskiPage } from '../KlotskiPage';

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
  Slider: () => <input aria-label="演示进度" type="range" disabled />,
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
});
