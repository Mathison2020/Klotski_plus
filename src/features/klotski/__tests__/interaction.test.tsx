import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ButtonHTMLAttributes, OptionHTMLAttributes, SelectHTMLAttributes } from 'react';
import { KlotskiPage } from '../KlotskiPage';

// 手势测试使用专用稀疏棋局，避免正式关卡的难度调整改变拖动坐标；
// 正式预设的密度、可解性和旋转动作由 solver.test.ts 覆盖。
vi.mock('../layouts', () => ({
  LAYOUTS: [
    {
      name: '峰回路转',
      pieces: [
        { id: 'caocao', type: 'caocao', x: 1, y: 0 },
        { id: 'guanyu', type: 'general-h', x: 1, y: 2 },
        { id: 'half', type: 'half-disc', x: 1, y: 4, orientation: 'down' },
        { id: 'zhangfei', type: 'general-v', x: 0, y: 1 },
        { id: 'zu1', type: 'soldier', x: 2, y: 3 },
        { id: 'zu2', type: 'soldier', x: 3, y: 4 },
      ],
    },
    {
      name: '辗转腾挪',
      pieces: [
        { id: 'caocao', type: 'caocao', x: 1, y: 0 },
        { id: 'guanyu', type: 'general-h', x: 1, y: 2 },
        { id: 'handset', type: 'handset', x: 1, y: 4, handsetOrientation: 'up' },
        { id: 'zhangfei', type: 'general-v', x: 0, y: 1 },
        { id: 'zu1', type: 'soldier', x: 2, y: 3 },
      ],
    },
    {
      name: '三分归圆',
      pieces: [
        { id: 'caocao', type: 'caocao', x: 0, y: 3 },
        {
          id: 'three-quarter',
          type: 'three-quarter-disc',
          x: 1,
          y: 0,
          threeQuarterOrientation: 'top-right',
        },
      ],
    },
  ],
}));

function selectLayout(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: '选择关卡' }));
  fireEvent.click(screen.getByRole('option', { name }));
}

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

describe('半圆块交互', () => {
  beforeEach(() => {
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
  });

  test('在半圆上按住右键环绕拖动后吸附到下一朝向', () => {
    render(<KlotskiPage />);
    selectLayout('峰回路转');

    // 先把挡在半圆右上方的卒向右移开。
    const soldier = screen.getByTestId('piece-zu1');
    fireEvent.pointerDown(soldier, { button: 0, clientX: 250, clientY: 350, pointerId: 1 });
    fireEvent.pointerMove(soldier, { button: 0, clientX: 350, clientY: 350, pointerId: 1 });
    fireEvent.pointerUp(soldier, { button: 0, clientX: 350, clientY: 350, pointerId: 1 });

    const half = screen.getByLabelText('半圆块');
    // 初始圆心为棋盘坐标 (2,4)，从圆心右侧拖到上侧即逆时针 90°。
    fireEvent.pointerDown(half, { button: 2, clientX: 250, clientY: 400, pointerId: 2 });
    fireEvent.pointerMove(half, { button: 2, clientX: 200, clientY: 350, pointerId: 2 });
    expect(half.style.transform).toBe('rotate(0deg)');

    fireEvent.pointerUp(half, { button: 2, clientX: 200, clientY: 350, pointerId: 2 });
    expect(screen.getByLabelText('半圆块').style.transform).toBe('rotate(0deg)');
    expect(screen.getByText(/步数 2/)).toBeTruthy();
  });

  test('页面统一禁用浏览器右键菜单', () => {
    render(<KlotskiPage />);
    expect(fireEvent.contextMenu(screen.getByRole('heading', { name: '华容道' }))).toBe(false);
  });

  test('演示步数计入累计值，切回手动模式后保留，仅重新开始时清零', () => {
    render(<KlotskiPage />);
    selectLayout('峰回路转');

    const soldier = screen.getByTestId('piece-zu1');
    fireEvent.pointerDown(soldier, { button: 0, clientX: 250, clientY: 350, pointerId: 8 });
    fireEvent.pointerMove(soldier, { button: 0, clientX: 350, clientY: 350, pointerId: 8 });
    fireEvent.pointerUp(soldier, { button: 0, clientX: 350, clientY: 350, pointerId: 8 });
    expect(screen.getByText(/步数 1/)).toBeTruthy();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: '开始演示' }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(20));
    act(() => vi.advanceTimersByTime(160));
    expect(screen.getByText(/演示模式 · 步数 2/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '暂停演示' }));
    vi.useRealTimers();

    const demoSoldier = screen.getByTestId('piece-zu1');
    fireEvent.pointerDown(demoSoldier, {
      button: 0,
      clientX: 350,
      clientY: 350,
      pointerId: 9,
    });
    fireEvent.pointerUp(demoSoldier, {
      button: 0,
      clientX: 350,
      clientY: 350,
      pointerId: 9,
    });
    expect(screen.getByText(/步数 2/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '重新开始' }));
    expect(screen.getByText(/步数 0/)).toBeTruthy();
  });

  test.each([125, 250, 375])('听筒任意横向位置（x=%i）都可开始右键转角', (pointerX) => {
    render(<KlotskiPage />);
    selectLayout('辗转腾挪');

    const handset = screen.getByLabelText('电话听筒块');
    fireEvent.pointerDown(handset, { button: 2, clientX: pointerX, clientY: 450, pointerId: 5 });
    fireEvent.pointerMove(handset, { button: 2, clientX: pointerX, clientY: 350, pointerId: 5 });
    fireEvent.pointerUp(handset, { button: 2, clientX: pointerX, clientY: 350, pointerId: 5 });

    expect(screen.getByLabelText('电话听筒块').style.transform).toBe('rotate(-90deg)');
    expect(screen.getByText(/步数 1/)).toBeTruthy();
  });

  test('听筒右键拖动转角后仍可左键平移', () => {
    vi.useFakeTimers();
    render(<KlotskiPage />);
    selectLayout('辗转腾挪');

    let handset = screen.getByLabelText('电话听筒块');
    // 向上拖右端转入右侧通道。中心从 (2.5, 4.5) 出发，
    // 半程时内墙角到达凹口最深处，听筒中心位于 (3, 4)。
    fireEvent.pointerDown(handset, { button: 2, clientX: 375, clientY: 450, pointerId: 3 });
    fireEvent.pointerMove(handset, { button: 2, clientX: 375, clientY: 400, pointerId: 3 });
    expect(handset.style.transform).toBe('rotate(-45deg)');
    expect(handset.style.left).toBe('37.5%');
    expect(handset.style.top).toBe('70%');

    // 在半程松手，吸附必须继续沿相同圆弧补完，而不是直接提交终点后做 left/top 直线过渡。
    fireEvent.pointerUp(handset, { button: 2, clientX: 375, clientY: 400, pointerId: 3 });
    expect(handset.style.transform).toBe('rotate(-45deg)');
    expect(handset.style.left).toBe('37.5%');
    expect(handset.style.top).toBe('70%');
    expect(handset.style.transitionProperty).toBe('none');

    act(() => vi.advanceTimersByTime(48));
    expect(handset.style.transform).not.toBe('rotate(-45deg)');
    expect(handset.style.transform).not.toBe('rotate(-90deg)');
    expect(handset.style.left).not.toBe('37.5%');
    expect(handset.style.left).not.toBe('50%');

    act(() => vi.advanceTimersByTime(100));
    handset = screen.getByLabelText('电话听筒块');
    expect(handset.style.transform).toBe('rotate(-90deg)');
    expect(handset.style.left).toBe('50%');
    expect(handset.style.top).toBe('60%');
    expect(screen.getByText(/步数 1/)).toBeTruthy();

    // 转成竖向后继续使用普通左键拖动上移一格。
    fireEvent.pointerDown(handset, { button: 0, clientX: 350, clientY: 350, pointerId: 4 });
    fireEvent.pointerMove(handset, { button: 0, clientX: 350, clientY: 250, pointerId: 4 });
    fireEvent.pointerUp(handset, { button: 0, clientX: 350, clientY: 250, pointerId: 4 });
    expect(screen.getByLabelText('电话听筒块').style.top).toBe('40%');
    expect(screen.getByText(/步数 2/)).toBeTruthy();
  });

  test('3/4圆块支持原地旋转和普通平移', () => {
    render(<KlotskiPage />);
    selectLayout('三分归圆');

    let piece = screen.getByLabelText('3/4圆块');
    fireEvent.pointerDown(piece, { button: 2, clientX: 250, clientY: 100, pointerId: 6 });
    fireEvent.pointerMove(piece, { button: 2, clientX: 200, clientY: 150, pointerId: 6 });
    fireEvent.pointerUp(piece, { button: 2, clientX: 200, clientY: 150, pointerId: 6 });
    expect(screen.getByLabelText('3/4圆块').style.transform).toBe('rotate(90deg)');

    piece = screen.getByLabelText('3/4圆块');
    fireEvent.pointerDown(piece, { button: 0, clientX: 150, clientY: 50, pointerId: 7 });
    fireEvent.pointerMove(piece, { button: 0, clientX: 150, clientY: 150, pointerId: 7 });
    fireEvent.pointerUp(piece, { button: 0, clientX: 150, clientY: 150, pointerId: 7 });
    expect(screen.getByLabelText('3/4圆块').style.top).toBe('20%');
    expect(screen.getByText(/步数 2/)).toBeTruthy();
  });

  test('工具栏旋转按钮播放动画后再提交半圆朝向', () => {
    vi.useFakeTimers();
    render(<KlotskiPage />);
    selectLayout('峰回路转');

    const half = screen.getByLabelText('半圆块');
    fireEvent.pointerDown(half, { button: 0, clientX: 150, clientY: 450, pointerId: 10 });
    fireEvent.pointerUp(half, { button: 0, clientX: 150, clientY: 450, pointerId: 10 });

    const clockwise = screen.getByRole('button', { name: '顺时针旋转棋块' });
    expect(clockwise.parentElement?.className).toContain('grid-cols-10');
    expect(clockwise.parentElement?.children).toHaveLength(10);
    fireEvent.click(clockwise);

    act(() => vi.advanceTimersByTime(80));
    expect(half.style.transform).not.toBe('rotate(90deg)');
    expect(half.style.transform).not.toBe('rotate(180deg)');
    expect(half.style.transitionProperty).toBe('none');

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByLabelText('半圆块').style.transform).toBe('rotate(180deg)');
    expect(screen.getByText(/步数 1/)).toBeTruthy();
  });

  test('听筒可通过工具栏按钮沿拐角逆时针转出并顺时针转回', () => {
    vi.useFakeTimers();
    render(<KlotskiPage />);
    selectLayout('辗转腾挪');

    let handset = screen.getByLabelText('电话听筒块');
    fireEvent.pointerDown(handset, { button: 0, clientX: 250, clientY: 450, pointerId: 11 });
    fireEvent.pointerUp(handset, { button: 0, clientX: 250, clientY: 450, pointerId: 11 });

    fireEvent.click(screen.getByRole('button', { name: '逆时针旋转棋块' }));
    act(() => vi.advanceTimersByTime(80));
    expect(handset.style.transform).not.toBe('rotate(0deg)');
    expect(handset.style.transform).not.toBe('rotate(-90deg)');
    expect(handset.style.left).not.toBe('25%');
    expect(handset.style.left).not.toBe('50%');

    act(() => vi.advanceTimersByTime(200));
    handset = screen.getByLabelText('电话听筒块');
    expect(handset.style.transform).toBe('rotate(-90deg)');
    expect(handset.style.left).toBe('50%');
    expect(handset.style.top).toBe('60%');

    fireEvent.click(screen.getByRole('button', { name: '顺时针旋转棋块' }));
    act(() => vi.advanceTimersByTime(80));
    expect(handset.style.transform).not.toBe('rotate(-90deg)');
    expect(handset.style.transform).not.toBe('rotate(0deg)');

    act(() => vi.advanceTimersByTime(200));
    handset = screen.getByLabelText('电话听筒块');
    expect(handset.style.transform).toBe('rotate(0deg)');
    expect(handset.style.left).toBe('25%');
    expect(handset.style.top).toBe('80%');
    expect(screen.getByText(/步数 2/)).toBeTruthy();
  });
});
