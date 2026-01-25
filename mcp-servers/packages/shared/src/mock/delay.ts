/**
 * Utility for simulating network/processing latency in mock services.
 */

export interface DelayOptions {
  minMs?: number;
  maxMs?: number;
  fixed?: number;
}

/**
 * Delays execution for a specified duration.
 * @param options - Delay configuration
 *   - fixed: Use exact delay in ms
 *   - minMs/maxMs: Use random delay within range
 */
export async function simulateDelay(options: DelayOptions = {}): Promise<void> {
  const { minMs = 50, maxMs = 200, fixed } = options;

  let delayMs: number;
  if (fixed !== undefined) {
    delayMs = fixed;
  } else {
    delayMs = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  }

  return new Promise(resolve => setTimeout(resolve, delayMs));
}

/**
 * Wraps a function with simulated delay.
 */
export function withDelay<T>(
  fn: () => T | Promise<T>,
  options?: DelayOptions
): () => Promise<T> {
  return async () => {
    await simulateDelay(options);
    return fn();
  };
}

/**
 * Decorator-style delay wrapper for async functions.
 */
export function delayed<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: DelayOptions
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    await simulateDelay(options);
    return fn(...args);
  };
}

/**
 * Standard delays for different operation types.
 */
export const StandardDelays = {
  /** Quick metadata lookup */
  metadata: { minMs: 20, maxMs: 80 },
  /** Database query execution */
  query: { minMs: 100, maxMs: 500 },
  /** File system operations */
  fileSystem: { minMs: 30, maxMs: 150 },
  /** Network API call */
  network: { minMs: 150, maxMs: 600 },
} as const;
