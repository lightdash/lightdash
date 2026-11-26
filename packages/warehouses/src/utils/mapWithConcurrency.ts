// Runs fn over items with at most `concurrency` in flight, preserving order.
// After the first rejection no new items start; it rethrows once in-flight ones settle.
export async function mapWithConcurrency<T, R>(
    items: Array<T>,
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results: R[] = Array.from({ length: items.length });
    let nextIndex = 0;
    let failed = false;
    let failure: unknown;

    const worker = async () => {
        /* eslint-disable no-await-in-loop */
        while (!failed && nextIndex < items.length) {
            const index = nextIndex;
            nextIndex += 1;
            try {
                results[index] = await fn(items[index], index);
            } catch (e) {
                if (!failed) {
                    failed = true;
                    failure = e;
                }
            }
        }
        /* eslint-enable no-await-in-loop */
    };

    await Promise.all(
        Array.from(
            { length: Math.max(1, Math.min(concurrency, items.length)) },
            worker,
        ),
    );
    if (failed) throw failure;
    return results;
}
