import { QueryHistoryStatus } from '@lightdash/common';
import { canReuseApiResult, canReuseQueryResult } from './queryResultReuse';

const now = Date.parse('2026-01-12T12:00:00Z');
const source = {
    status: QueryHistoryStatus.READY,
    createdByUserUuid: 'user',
    compiledSql: 'select count(*) from orders where region = 7',
    usedParameters: { region: 7 },
    resultsFileName: 'rows.jsonl',
    createdAt: new Date(now - 60_000),
    resultsExpiresAt: new Date(now + 60_000),
} satisfies Parameters<typeof canReuseQueryResult>[0];
const current = {
    userUuid: 'user',
    sql: source.compiledSql,
    parameters: { region: 7 },
    now,
};

describe('presentation result reuse', () => {
    it('accepts a recent ready result for the same actor and freshly compiled scope', () => {
        expect(canReuseQueryResult(source, current)).toBe(true);
    });
    it.each([
        { status: QueryHistoryStatus.ERROR },
        { status: QueryHistoryStatus.PENDING },
        { createdByUserUuid: 'another-user' },
        { createdByUserUuid: null },
        { resultsExpiresAt: new Date(now) },
        { resultsExpiresAt: null },
        { createdAt: new Date(now - 16 * 60_000) },
        { resultsFileName: null },
        { compiledSql: 'select count(*) from orders' },
        { usedParameters: { region: 8 } },
    ])(
        'rejects unavailable, unauthorized, stale or different results: %j',
        (change) => {
            expect(canReuseQueryResult({ ...source, ...change }, current)).toBe(
                false,
            );
        },
    );
    it('rejects changed row restrictions, dates and parameters even with the same query UUID', () => {
        expect(
            canReuseQueryResult(source, {
                ...current,
                sql: `${current.sql} and tenant_id = 9`,
            }),
        ).toBe(false);
        expect(
            canReuseQueryResult(source, {
                ...current,
                parameters: { region: 9 },
            }),
        ).toBe(false);
    });
});

describe('live source result reuse', () => {
    const apiResult = {
        status: QueryHistoryStatus.READY,
        resultsFileName: 'rows.jsonl',
        resultsCreatedAt: new Date(now - 30_000),
        resultsExpiresAt: new Date(now + 60_000),
    };
    const policy = { ttlSeconds: 60, purgedAt: null };

    it('reuses ready rows fetched within the source freshness window', () => {
        expect(canReuseApiResult(apiResult, policy, now)).toBe(true);
        expect(
            canReuseApiResult(
                { ...apiResult, resultsExpiresAt: null },
                policy,
                now,
            ),
        ).toBe(true);
    });
    it.each([
        { status: QueryHistoryStatus.PENDING },
        { status: QueryHistoryStatus.ERROR },
        { resultsFileName: null },
        { resultsCreatedAt: null },
        { resultsCreatedAt: new Date(now - 61_000) },
        { resultsExpiresAt: new Date(now) },
    ])('fetches again for missing, failed or stale rows: %j', (change) => {
        expect(
            canReuseApiResult({ ...apiResult, ...change }, policy, now),
        ).toBe(false);
    });
    it('follows the source freshness window, not a fixed minute', () => {
        const old = { ...apiResult, resultsCreatedAt: new Date(now - 600_000) };
        expect(canReuseApiResult(old, policy, now)).toBe(false);
        expect(
            canReuseApiResult(old, { ...policy, ttlSeconds: 900 }, now),
        ).toBe(true);
    });
    it('never reuses with a window of 0', () => {
        expect(
            canReuseApiResult(
                { ...apiResult, resultsCreatedAt: new Date(now - 1) },
                { ...policy, ttlSeconds: 0 },
                now,
            ),
        ).toBe(false);
    });
    it('never reuses rows fetched before a purge', () => {
        expect(
            canReuseApiResult(
                apiResult,
                { ...policy, purgedAt: new Date(now - 10_000) },
                now,
            ),
        ).toBe(false);
        expect(
            canReuseApiResult(
                apiResult,
                { ...policy, purgedAt: new Date(now - 40_000) },
                now,
            ),
        ).toBe(true);
    });
});
