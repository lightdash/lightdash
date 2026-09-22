import { QueryHistoryStatus } from '@lightdash/common';
import { canReuseQueryResult } from './queryResultReuse';

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
