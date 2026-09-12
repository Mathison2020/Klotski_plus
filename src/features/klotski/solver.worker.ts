import { solveKlotski } from './solver';
import type { Piece } from './types';

interface SolverWorkerRequest {
  requestId: number;
  pieces: Piece[];
}

interface SolverWorkerResponse {
  requestId: number;
  steps: number | null;
  elapsedMs: number;
  error?: string;
}

self.addEventListener('message', (event: MessageEvent<SolverWorkerRequest>) => {
  const { requestId, pieces } = event.data;
  const startedAt = performance.now();

  try {
    const solution = solveKlotski(pieces);
    const response: SolverWorkerResponse = {
      requestId,
      steps: solution?.length ?? null,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
    self.postMessage(response);
  } catch {
    const response: SolverWorkerResponse = {
      requestId,
      steps: null,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: '求解过程中发生错误',
    };
    self.postMessage(response);
  }
});
