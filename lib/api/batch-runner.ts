export type BatchResult<R> = 
  | { status: 'fulfilled'; value: R }
  | { status: 'rejected'; reason: any }
  | { status: 'skipped_circuit_open' };

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
  circuitBreakerCheck?: () => boolean
): Promise<BatchResult<R>[]> {
  const results: BatchResult<R>[] = new Array(items.length);
  let currentIndex = 0;
  let isCircuitOpen = false;

  async function processNext(): Promise<void> {
    while (true) {
      if (currentIndex >= items.length) {
        return;
      }
      
      const index = currentIndex++;
      const item = items[index];

      if (isCircuitOpen || (circuitBreakerCheck && circuitBreakerCheck())) {
        isCircuitOpen = true; // Mark as open for the rest of the batch
        results[index] = { status: 'skipped_circuit_open' };
        continue;
      }

      try {
        const value = await worker(item);
        results[index] = { status: 'fulfilled', value };
      } catch (error) {
        results[index] = { status: 'rejected', reason: error };
      }
    }
  }

  const workers: Promise<void>[] = [];
  const actualLimit = Math.min(limit, items.length);
  
  for (let i = 0; i < actualLimit; i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);
  return results;
}
