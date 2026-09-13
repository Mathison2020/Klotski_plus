import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function expectCustomLayoutInMenu(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: '选择关卡' }));
  expect(screen.getByRole('option', { name: `自定义 · ${name}` })).toBeTruthy();
}

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
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('创建的布局立即加入列表并在重新挂载后恢复', () => {
    const first = render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.change(screen.getByLabelText('关卡名称'), { target: { value: '本地测试' } });
    fireEvent.click(screen.getByRole('button', { name: '曹操 2×2' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 2 列放置棋块' }));
    fireEvent.click(screen.getByRole('button', { name: /保存关卡/ }));

    expectCustomLayoutInMenu('本地测试');
    expect(globalThis.localStorage.getItem(CUSTOM_LAYOUTS_STORAGE_KEY)).toContain('本地测试');

    first.unmount();
    render(<KlotskiPage />);
    expectCustomLayoutInMenu('本地测试');
  });

  test('游玩界面不显示编码功能，编辑器可导出当前草稿并解析编码', () => {
    render(<KlotskiPage />);
    expect(screen.queryByRole('button', { name: /导入编码/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /导出当前局面/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.change(screen.getByLabelText('关卡名称'), { target: { value: '待导出草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '曹操 2×2' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 2 列放置棋块' }));

    fireEvent.click(screen.getByRole('button', { name: /导出当前局面/ }));
    expect((screen.getByLabelText('局面编码') as HTMLTextAreaElement).value).toMatch(/^KLP1\./u);
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    const code = encodeLayout({
      name: '编码导入测试',
      pieces: [{ id: 'cao', type: PieceType.CAOCAO, x: 1, y: 0 }],
    });
    fireEvent.click(screen.getByRole('button', { name: /导入编码/ }));
    fireEvent.change(screen.getByLabelText('局面编码'), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: /解析并载入/ }));

    expect((screen.getByLabelText('关卡名称') as HTMLInputElement).value).toBe('编码导入测试');
    expect(screen.getByTestId('piece-cao')).toBeTruthy();
    expect(globalThis.localStorage.getItem(CUSTOM_LAYOUTS_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /保存关卡/ }));
    expectCustomLayoutInMenu('编码导入测试');
    expect(globalThis.localStorage.getItem(CUSTOM_LAYOUTS_STORAGE_KEY)).toContain('编码导入测试');
  });

  test('导入非法编码时显示错误且不保存', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.click(screen.getByRole('button', { name: /导入编码/ }));
    fireEvent.change(screen.getByLabelText('局面编码'), { target: { value: 'bad-code' } });
    fireEvent.click(screen.getByRole('button', { name: /解析并载入/ }));

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

  test('编辑器使用正确的逆时针图标，并支持双向旋转选中棋块', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.click(screen.getByRole('button', { name: '半圆 1×2' }));

    const placementCounterclockwise = screen.getByRole('button', {
      name: '逆时针切换放置朝向',
    });
    const reset = screen.getByRole('button', { name: '复位到锁定局面' });
    expect(placementCounterclockwise.querySelector('svg')?.innerHTML).not.toBe(
      reset.querySelector('svg')?.innerHTML,
    );

    fireEvent.click(screen.getByRole('button', { name: '在第 2 行第 2 列放置棋块' }));
    const clockwise = screen.getByRole('button', { name: '顺时针旋转选中棋块' });
    const counterclockwise = screen.getByRole('button', { name: '逆时针旋转选中棋块' });
    expect((clockwise as HTMLButtonElement).disabled).toBe(false);
    expect((counterclockwise as HTMLButtonElement).disabled).toBe(false);
    expect(counterclockwise.querySelector('svg')?.innerHTML).toBe(
      placementCounterclockwise.querySelector('svg')?.innerHTML,
    );

    fireEvent.click(clockwise);
    expect(screen.getByTestId('piece-half-disc-1').style.transform).toBe('rotate(90deg)');
    fireEvent.click(counterclockwise);
    expect(screen.getByTestId('piece-half-disc-1').style.transform).toBe('rotate(0deg)');
  });

  test('选中听筒后可使用顺逆时针按钮滑过对应拐角', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.click(screen.getByRole('button', { name: '听筒 1×3' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 3 行第 1 列放置棋块' }));

    fireEvent.click(screen.getByRole('button', { name: '顺时针旋转选中棋块' }));
    expect(screen.getByTestId('piece-handset-1').style.transform).toBe('rotate(90deg)');
    expect(screen.getByTestId('piece-handset-1').style.top).toBe('20%');

    fireEvent.click(screen.getByRole('button', { name: '逆时针旋转选中棋块' }));
    expect(screen.getByTestId('piece-handset-1').style.transform).toBe('rotate(0deg)');
    expect(screen.getByTestId('piece-handset-1').style.top).toBe('40%');
  });

  test('选择棋块时显示朝向预览，并在棋盘悬停位置显示半透明放置预览', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));

    expect(screen.getByLabelText('当前棋块预览')).toBeTruthy();
    expect(screen.getByTestId('piece-tool-preview').style.width).toBe('25%');
    expect(screen.getByTestId('piece-tool-preview').textContent).toBe('');
    expect(screen.getByTestId('piece-tool-preview-shape').className).not.toContain('rounded-md');

    fireEvent.click(screen.getByRole('button', { name: '3/4圆 3格' }));
    fireEvent.click(screen.getByRole('button', { name: '顺时针切换放置朝向' }));
    const toolPreview = screen.getByTestId('piece-tool-preview');
    expect(toolPreview.style.transform).toBe('rotate(90deg)');
    expect(toolPreview.textContent).toBe('');
    expect(toolPreview.querySelector('path')?.getAttribute('d')).toBe(
      'M100 100 V2 A98 98 0 1 0 198 100 H100 Z',
    );

    const board = screen.getByTestId('layout-editor-board');
    fireEvent.pointerMove(board, { clientX: 150, clientY: 250 });
    const preview = screen.getByTestId('placement-hover-preview');
    expect(preview.dataset.valid).toBe('true');
    expect(preview.className).toContain('opacity-50');
    expect(screen.getByTestId('piece-hover-preview').style.left).toBe('25%');
    expect(screen.getByTestId('piece-hover-preview').style.top).toBe('40%');
    expect(screen.getByTestId('piece-hover-preview').style.transform).toBe('rotate(90deg)');
    expect(screen.getByTestId('piece-hover-preview').textContent).toContain('将');
    expect(
      screen.getByTestId('piece-hover-preview').querySelector('path')?.getAttribute('d'),
    ).toContain('V10 Q100 2 92 2');
    expect(screen.getByTestId('piece-hover-preview').querySelector('path')?.classList).toContain(
      'pointer-events-none',
    );

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

  test('编辑器内听筒松手后沿转角轨迹吸附', () => {
    vi.useFakeTimers();
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.click(screen.getByRole('button', { name: '听筒 1×3' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 5 行第 1 列放置棋块' }));

    let handset = screen.getByTestId('piece-handset-1');
    fireEvent.pointerDown(handset, { button: 2, clientX: 250, clientY: 450, pointerId: 10 });
    fireEvent.pointerMove(handset, { button: 2, clientX: 250, clientY: 400, pointerId: 10 });
    fireEvent.pointerUp(handset, { button: 2, clientX: 250, clientY: 400, pointerId: 10 });

    expect(handset.style.transform).toBe('rotate(-45deg)');
    expect(handset.style.transitionProperty).toBe('none');
    act(() => vi.advanceTimersByTime(48));
    expect(handset.style.transform).not.toBe('rotate(-45deg)');
    expect(handset.style.transform).not.toBe('rotate(-90deg)');

    act(() => vi.advanceTimersByTime(100));
    handset = screen.getByTestId('piece-handset-1');
    expect(handset.style.transform).toBe('rotate(-90deg)');
  });

  test('可以锁定当前局面并在继续编辑后复位', () => {
    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.click(screen.getByRole('button', { name: '卒 1×1' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 1 列放置棋块' }));

    fireEvent.click(screen.getByRole('button', { name: '锁定当前局面' }));
    fireEvent.click(screen.getByRole('button', { name: '右移' }));
    expect(screen.getByTestId('piece-soldier-1').style.left).toBe('25%');

    fireEvent.click(screen.getByRole('button', { name: '复位到锁定局面' }));
    expect(screen.getByTestId('piece-soldier-1').style.left).toBe('0%');
    expect(screen.getByText(/已复位到锁定局面/)).toBeTruthy();
  });

  test('自动解显示最短步数或无解，并在局面变化后清除旧结果', async () => {
    let nextSteps: number | null = 27;
    class SolverWorkerMock {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;

      postMessage(message: { requestId: number }) {
        queueMicrotask(() => {
          this.onmessage?.({
            data: { requestId: message.requestId, steps: nextSteps, elapsedMs: 18 },
          } as MessageEvent);
        });
      }

      terminate() {}
    }
    vi.stubGlobal('Worker', SolverWorkerMock);

    render(<KlotskiPage />);
    fireEvent.click(screen.getByRole('button', { name: /新建关卡/ }));
    fireEvent.click(screen.getByRole('button', { name: '曹操 2×2' }));
    fireEvent.click(screen.getByRole('button', { name: '在第 1 行第 1 列放置棋块' }));
    fireEvent.click(screen.getByRole('button', { name: '自动解' }));

    await waitFor(() =>
      expect(screen.getByTestId('editor-solve-result').textContent).toContain('27 步'),
    );

    fireEvent.click(screen.getByRole('button', { name: '右移' }));
    expect(screen.getByTestId('editor-solve-result').textContent).toContain('检查当前局面');

    nextSteps = null;
    fireEvent.click(screen.getByRole('button', { name: '自动解' }));
    await waitFor(() =>
      expect(screen.getByTestId('editor-solve-result').textContent).toContain('无解'),
    );
  });
});
