# 华容道（Klotski）

纯前端的华容道模拟器。4×5 棋盘，底部正中 2 格为出口，通过拖动棋子把曹操（2×2）移出。

## 交互

- **拖动**：按住棋子沿主轴（水平/垂直位移较大者）连续吸附滑动，实时限制在合法区间（边界 / 其他棋子）
- **半圆旋转**：半圆块支持右、下、左、上四个朝向；按住鼠标右键环绕圆心拖动，松开后按 90° 吸附
- **3/4 圆旋转**：3/4 圆块占据 2×2 外接框中的三个格，缺口可朝四个象限；支持普通平移和绕外接框中心原地旋转
- **听筒转角**：Hammersley 电话听筒块占 1×3 或 3×1；左键直线平移，右键拖动端部转入新通道。转角时内墙角沿中央半圆凹口滑过，本体同时平移并旋转 90°
- **点击**：仅高亮选中棋子，不移动
- **胜利**：曹操左上角到达 `(1, 3)` 时判胜，蒙层显示步数
- **重新开始**：恢复初始布局并清零步数
- **关卡编辑器**：手动摆放、旋转与删除棋块，自定义关卡保存在浏览器本地

## 文件

- [types.ts](types.ts) — `Piece` / `PieceType` / `Layout` 类型定义
- [constants.ts](constants.ts) — 棋盘尺寸、出口位置、各棋块尺寸
- [engine.ts](engine.ts) — 纯逻辑：碰撞、可移动范围、吸附移动、胜利判定
- [solver.ts](solver.ts) — 最短步求解器（经典关卡使用 BigInt BFS，异形关卡使用含旋转动作的通用 BFS）
- [layouts.ts](layouts.ts) — 内置经典与异形关卡
- [custom-layouts.ts](custom-layouts.ts) — 自定义关卡校验与本地持久化
- [KlotskiPage.tsx](KlotskiPage.tsx) — 页面编排：状态 + 指针事件
- [components](components) — 棋盘、棋子与关卡编辑器组件
- [**tests**/engine.test.ts](__tests__/engine.test.ts) — 引擎单测
- [**tests**/solver.test.ts](__tests__/solver.test.ts) — 求解器单测

## 说明

- 引擎（`engine.ts`）为无 DOM/React 依赖的纯函数，便于单测与复用求解器
- 棋子配色与棋盘使用统一的 Neutral Modern 语义色
- 求解器采用 BFS 求最短解，一步 = 一块棋子沿一个方向滑动任意距离（见 [solver.ts](solver.ts) 文件头注释）
- 异形关卡的求解中，一次 90° 旋转、一次听筒转角和一次沿单轴滑动任意距离均计为一步
