import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, OptionHTMLAttributes, SelectHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CUSTOM_LAYOUTS_STORAGE_KEY } from '../custom-layouts';
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

describe('关卡编辑器', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 500,
      height: 500,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test('创建的布局立即加入列表并在重新挂载后恢复', () => {
    const first = render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.change(screen.getByLabelText('关卡名称'), { target: { value: '本地测试' } });
    fireEvent.click(screen.getByRole('button', { name: '曹操 2×2' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 2 列放置棋块' }));
    fireEvent.click(screen.getByRole('button', { name: /保存关卡/ }));

    expect(screen.getByRole('option', { name: '自定义 · 本地测试' })).toBeTruthy();
    expect(globalThis.localStorage.getItem(CUSTOM_LAYOUTS_STORAGE_KEY)).toContain('本地测试');

    first.unmount();
    render(<KlotskiPage />);
    expect(screen.getByRole('option', { name: '自定义 · 本地测试' })).toBeTruthy();
  });

  test('非法布局不会保存，并显示明确原因', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.click(screen.getByRole('button', { name: /保存关卡/ }));

    expect(screen.getByRole('alert').textContent).toContain('曹操');
    expect(globalThis.localStorage.getItem(CUSTOM_LAYOUTS_STORAGE_KEY)).toBeNull();
  });

  test('异形块可在放置前选择朝向', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));

    fireEvent.click(screen.getByRole('button', { name: '半圆 1×2' }));
    fireEvent.click(screen.getByRole('button', { name: '顺时针切换放置朝向' }));
    expect(screen.getByText('弧面向下')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 1 列放置棋块' }));
    expect(screen.getByLabelText('半圆块').style.transform).toBe('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: '听筒 1×3' }));
    fireEvent.click(screen.getByRole('button', { name: '顺时针切换放置朝向' }));
    expect(screen.getByText('凹口向右')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 4 列放置棋块' }));
    expect(screen.getByLabelText('电话听筒块').style.transform).toBe('rotate(90deg)');
  });

  test('编辑器内支持左键拖动平移和右键拖动旋转', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));

    fireEvent.click(screen.getByRole('button', { name: '卒 1×1' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 1 列放置棋块' }));
    const soldier = screen.getByTestId('piece-soldier-1');
    fireEvent.pointerDown(soldier, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(soldier, { button: 0, clientX: 150, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(soldier, { button: 0, clientX: 150, clientY: 50, pointerId: 1 });
    expect(screen.getByTestId('piece-soldier-1').style.left).toBe('25%');

    fireEvent.click(screen.getByRole('button', { name: '半圆 1×2' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 2 行第 2 列放置棋块' }));
    const half = screen.getByLabelText('半圆块');
    fireEvent.pointerDown(half, { button: 2, clientX: 150, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(half, { button: 2, clientX: 100, clientY: 250, pointerId: 2 });
    fireEvent.pointerUp(half, { button: 2, clientX: 100, clientY: 250, pointerId: 2 });
    expect(screen.getByLabelText('半圆块').style.transform).toBe('rotate(90deg)');
  });
});
