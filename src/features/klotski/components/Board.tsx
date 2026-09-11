import { BOARD_COLS, BOARD_ROWS, EXIT } from '../constants';

/** 棋盘背景网格与底部出口标记。棋子由父组件绝对定位叠加其上。 */
export function Board() {
  const cells = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const isExit = row === BOARD_ROWS - 1 && col >= EXIT.x && col < EXIT.x + EXIT.width;
      cells.push(
        <div
          key={`${row}-${col}`}
          className={`border border-border/60 ${isExit ? 'border-b-0' : ''}`}
        />,
      );
    }
  }

  return (
    <div className="absolute inset-0 grid grid-cols-4 grid-rows-5 overflow-hidden rounded-lg border border-border bg-card">
      {cells}
    </div>
  );
}
