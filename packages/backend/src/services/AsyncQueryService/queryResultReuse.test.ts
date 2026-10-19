import { QueryHistoryStatus } from '@lightdash/common';
import {
    EXPLORE,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import { canReuseQueryResult } from './queryResultReuse';

const now = Date.parse('2026-01-12T12:00:00Z');
const source = {
    status: QueryHistoryStatus.READY,
    createdByUserUuid: 'user',
    compiledSql: 'select count(*) from orders where region = 7',
    usedParameters: { region: 7 },
    resultsFileName: 'rows.jsonl',
    metricQuery: METRIC_QUERY,
    requestParameters: { query: METRIC_QUERY },
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
    it.each([
        { sourceDetect: true, currentDetect: undefined, expected: false },
        { sourceDetect: true, currentDetect: false, expected: false },
        { sourceDetect: undefined, currentDetect: true, expected: false },
        { sourceDetect: true, currentDetect: true, expected: true },
    ])(
        'checks retained limits despite identical execution SQL (source=$sourceDetect, current=$currentDetect)',
        ({ sourceDetect, currentDetect, expected }) => {
            const context = {
                explore: EXPLORE,
                warehouseSqlBuilder: warehouseClientMock,
                intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
                userAttributes: {},
                timezone: QUERY_BUILDER_UTC_TIMEZONE,
                availableParameterDefinitions: {},
                parameters: {},
            };
            const sourceQuery = {
                ...METRIC_QUERY,
                limit: sourceDetect ? 17 : 18,
            };
            const sourceComposer = new QueryComposer(
                {
                    metricQuery: sourceQuery,
                    detectRowLimitExceeded: sourceDetect,
                },
                context,
            );
            const currentComposer = new QueryComposer(
                {
                    metricQuery: {
                        ...METRIC_QUERY,
                        limit: currentDetect ? 17 : 18,
                    },
                    detectRowLimitExceeded: currentDetect,
                },
                context,
            );
            const sql = sourceComposer.getSql({ columnLimit: 200 });
            expect(currentComposer.getSql({ columnLimit: 200 })).toBe(sql);
            expect(sql).toMatch(/LIMIT 18$/);
            expect(
                canReuseQueryResult(
                    {
                        ...source,
                        compiledSql: sql,
                        metricQuery: sourceQuery,
                        requestParameters: {
                            query: sourceQuery,
                            ...(sourceDetect
                                ? { detectRowLimitExceeded: true }
                                : {}),
                        },
                        usedParameters: sourceComposer.getUsedParameters(),
                    },
                    {
                        ...current,
                        sql,
                        parameters: currentComposer.getUsedParameters(),
                        rowLimitDetectionLimit:
                            currentComposer.getRowLimitDetectionLimit(),
                    },
                ),
            ).toBe(expected);
        },
    );

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
