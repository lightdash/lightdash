import { createFetchStats, FETCH_STATS_SAMPLE_SIZE } from './fetchStats';

describe('createFetchStats', () => {
    it('reports zeros when no page was fetched', () => {
        expect(createFetchStats().summary()).toStrictEqual({
            pages: 0,
            rows: 0,
            approxResponseBytes: 0,
            requestTotalMs: 0,
            requestP50Ms: 0,
            requestMaxMs: 0,
            waitMs: 0,
            processMs: 0,
            sdkConvertMs: 0,
            writeMs: 0,
        });
    });

    it('sums pages, rows, bytes and durations and reports the median and max request', () => {
        const stats = createFetchStats();
        stats.recordPage(30, 5000, 1000);
        stats.recordPage(10, 5000, 1000);
        stats.recordPage(20, 1, 2);
        stats.add('waitMs', 5);
        stats.add('waitMs', 7);
        stats.add('processMs', 40);
        stats.add('sdkConvertMs', 15);
        stats.add('writeMs', 9);

        expect(stats.summary()).toStrictEqual({
            pages: 3,
            rows: 10001,
            approxResponseBytes: 2002,
            requestTotalMs: 60,
            requestP50Ms: 20,
            requestMaxMs: 30,
            waitMs: 12,
            processMs: 40,
            sdkConvertMs: 15,
            writeMs: 9,
        });
    });

    it('keeps exact totals and a sampled median after the request sample is full', () => {
        const stats = createFetchStats(() => 0.5);
        const pages = FETCH_STATS_SAMPLE_SIZE * 4;
        for (let page = 0; page < pages; page += 1) {
            stats.recordPage(page % 2 === 0 ? 10 : 20, 1, 1);
        }
        const summary = stats.summary();

        expect(summary.pages).toBe(pages);
        expect(summary.requestTotalMs).toBe(pages * 15);
        expect(summary.requestMaxMs).toBe(20);
        expect([10, 20]).toContain(summary.requestP50Ms);
    });
});
