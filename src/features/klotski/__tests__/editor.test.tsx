import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ButtonHTMLAttributes, OptionHTMLAttributes, SelectHTMLAttributes } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CUSTOM_LAYOUTS_STORAGE_KEY } from '../custom-layouts';
import { KlotskiPage } from '../KlotskiPage';
import { encodeLayout } from '../layout-codec';
import { PieceType } from '../types';

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

  test('当前预设可导出为编码，编码可导入为持久化的自定义关卡', () => {
    render(<KlotskiPage />);

    fireEvent.click(screen.getByRole('button', { name: /导出当前关卡/ }));
    expect((screen.getByLabelText('局面编码') as HTMLTextAreaElement).value).toMatch(/^KLP1\./u);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    const code = encodeLayout({
      name: '编码导入测试',
      pieces: [{ id: 'cao', type: PieceType.CAOCAO, x: 1, y: 0 }],
    });
    fireEvent.click(screen.getByRole('button', { name: /导入编码/ }));
    fireEvent.change(screen.getByLabelText('局面编码'), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: /导入为自定义关卡/ }));

    expect(screen.getByRole('option', { name: '自定义 · 编码导入测试' })).toBeTruthy();
    expect(globalThis.localStorage.getItem(CUSTOM_LAYOUTS_STORAGE_KEY)).toContain('编码导入测试');
  });

  test('导入非法编码时显示错误且不保存', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /导入编码/ }));
    fireEvent.change(screen.getByLabelText('局面编码'), { target: { value: 'bad-code' } });
    fireEvent.click(screen.getByRole('button', { name: /导入为自定义关卡/ }));

    expect(screen.getByRole('status').textContent).toContain('KLP1');
    expect(globalThis.localStorage.getItem(CUSTOM_LAYOUTS_STORAGE_KEY)).toBeNull();
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
    expect(screen.getByTestId('piece-half-disc-1').style.transform).toBe('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: '听筒 1×3' }));
    fireEvent.click(screen.getByRole('button', { name: '顺时针切换放置朝向' }));
    expect(screen.getByText('凹口向右')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 4 列放置棋块' }));
    expect(screen.getByTestId('piece-handset-1').style.transform).toBe('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: '3/4圆 3格' }));
    fireEvent.click(screen.getByRole('button', { name: '顺时针切换放置朝向' }));
    expect(screen.getByText('缺口右下')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '在第 4 行第 1 列放置棋块' }));
    expect(screen.getByTestId('piece-three-quarter-disc-1').style.transform).toBe('rotate(90deg)');
  });

  test('选择棋块时显示朝向预览，并在棋盘悬停位置显示半透明放置预览', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));

    expect(screen.getByLabelText('当前棋块预览')).toBeTruthy();
    expect(screen.getByTestId('piece-tool-preview').style.width).toBe('25%');

    fireEvent.click(screen.getByRole('button', { name: '3/4圆 3格' }));
    fireEvent.click(screen.getByRole('button', { name: '顺时针切换放置朝向' }));
    expect(screen.getByTestId('piece-tool-preview').style.transform).toBe('rotate(90deg)');

    const board = screen.getByTestId('layout-editor-board');
    fireEvent.pointerMove(board, { clientX: 150, clientY: 250 });
    const preview = screen.getByTestId('placement-hover-preview');
    expect(preview.dataset.valid).toBe('true');
    expect(preview.className).toContain('opacity-50');
    expect(screen.getByTestId('piece-hover-preview').style.left).toBe('25%');
    expect(screen.getByTestId('piece-hover-preview').style.top).toBe('40%');
    expect(screen.getByTestId('piece-hover-preview').style.transform).toBe('rotate(90deg)');

    fireEvent.pointerMove(board, { clientX: 350, clientY: 450 });
    expect(screen.getByTestId('placement-hover-preview').dataset.valid).toBe('false');
    expect(screen.getByTestId('placement-hover-preview').className).toContain('opacity-25');

    fireEvent.pointerLeave(board);
    expect(screen.queryByTestId('placement-hover-preview')).toBeNull();
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
    const half = screen.getByTestId('piece-half-disc-1');
    fireEvent.pointerDown(half, { button: 2, clientX: 150, clientY: 200, pointerId: 2 });
    fireEvent.pointerMove(half, { button: 2, clientX: 100, clientY: 250, pointerId: 2 });
    fireEvent.pointerUp(half, { button: 2, clientX: 100, clientY: 250, pointerId: 2 });
    expect(screen.getByTestId('piece-half-disc-1').style.transform).toBe('rotate(90deg)');

    fireEvent.click(screen.getByRole('button', { name: '3/4圆 3格' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 3 行第 3 列放置棋块' }));
    const threeQuarter = screen.getByTestId('piece-three-quarter-disc-1');
    fireEvent.pointerDown(threeQuarter, {
      button: 2,
      clientX: 350,
      clientY: 300,
      pointerId: 3,
    });
    fireEvent.pointerMove(threeQuarter, {
      button: 2,
      clientX: 300,
      clientY: 350,
      pointerId: 3,
    });
    fireEvent.pointerUp(threeQuarter, {
      button: 2,
      clientX: 300,
      clientY: 350,
      pointerId: 3,
    });
    expect(screen.getByTestId('piece-three-quarter-disc-1').style.transform).toBe('rotate(90deg)');
  });
});
