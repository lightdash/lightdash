// Runs fn over items with at most `concurrency` in flight, preserving order.
export async function mapWithConcurrency<T, R>(
    items: Array<T>,
    concurrency: number,
    fn: (item: T) => Promise<R>,
): Promise<R[]> {
    const results: R[] = [];
    let nextIndex = 0;
    const worker = async () => {
        /* eslint-disable no-await-in-loop */
        while (nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await fn(items[index]);
        }
        /* eslint-enable no-await-in-loop */
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
}
