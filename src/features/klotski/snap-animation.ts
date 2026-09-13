interface AngleSnapOptions {
  from: number;
  to: number;
  onFrame: (degrees: number) => void;
  onComplete: () => void;
}

/**
 * 把松手时的旋转预览补完到目标角度。位置仍由 Piece 根据角度沿原轨迹计算，
 * 因而不会退化为 left/top 两点之间的直线 CSS 过渡。
 */
export function animateAngleSnap({ from, to, onFrame, onComplete }: AngleSnapOptions): () => void {
  const distance = Math.abs(to - from);
  if (distance < 0.01) {
    onFrame(to);
    onComplete();
    return () => {};
  }

  const duration = Math.max(70, (distance / 90) * 180);
  let startedAt: number | null = null;
  let frame = 0;
  const animate = (now: number) => {
    if (startedAt === null) startedAt = now;
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    onFrame(from + (to - from) * eased);
    if (progress < 1) frame = requestAnimationFrame(animate);
    else onComplete();
  };
  frame = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frame);
}
