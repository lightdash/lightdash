import pLimit from 'p-limit';

/**
 * Run tasks over `items` with at most `concurrency` in flight, preserving input order.
 *
 * Fails fast: after the first rejection, queued tasks throw that error instead of starting.
 * p-limit on its own keeps draining its queue after a rejection, so a plain `pLimit` wrapper
 * would still start every remaining task once one has already failed.
 */
export const runWithConcurrency = async <T, R>(
    items: readonly T[],
    concurrency: number,
    task: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
    const limit = pLimit(Math.max(1, Math.floor(concurrency)));
    let hasFailed = false;
    let firstError: unknown;

    return Promise.all(
        items.map((item, index) =>
            limit(async () => {
                if (hasFailed) {
                    throw firstError;
                }
                try {
                    return await task(item, index);
                } catch (error) {
                    if (!hasFailed) {
                        hasFailed = true;
                        firstError = error;
                    }
                    throw error;
                }
            }),
        ),
    );
};
