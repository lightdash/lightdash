import {
    ApiConnectorType,
    getItemMap,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { ATTIO_MAX_GROUPED_RECORDS } from '../integrations/attio/explores';
import { GITHUB_MAX_QUERY_ROWS } from '../integrations/github/run';
import { PYLON_MAX_QUERY_ROWS } from '../integrations/pylon/run';
import {
    assertLiveResultComplete,
    buildLiveExplores,
    compileLiveMetricQuery,
    getLegacyLiveSourceName,
    groupLiveRows,
    toLiveResult,
    toScannedLiveSourceFields,
} from './build';
import { getInitialLiveSourceFieldEdits } from './fields';

const CONNECTION_UUID = '03386598-7a51-45b2-b1f9-5ef55bd09016';

/** The first explore of a source: pull requests, issues or records. */
const build = (
    apiSource: Parameters<typeof buildLiveExplores>[0]['apiSource'],
): Explore => {
    const scannedFields = toScannedLiveSourceFields(apiSource.connector, {});
    const [explore] = buildLiveExplores({
        connectionUuid: CONNECTION_UUID,
        sourceName: getLegacyLiveSourceName(
            apiSource.connector,
            CONNECTION_UUID,
        ),
        name: 'Source',
        apiSource,
        scannedFields,
        edits: getInitialLiveSourceFieldEdits({
            scannedFields,
            isExistingSource: true,
        }),
    });
    return explore;
};

const query = (
    explore: Explore,
    fields: { dimensions: string[]; metrics: string[] },
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName: explore.name,
    dimensions: fields.dimensions.map((name) => `${explore.name}_${name}`),
    metrics: fields.metrics.map((name) => `${explore.name}_${name}`),
    filters: {},
    sorts: [],
    limit: 10,
    tableCalculations: [],
    ...overrides,
});

const compile = (explore: Explore, metricQuery: MetricQuery) =>
    compileLiveMetricQuery({
        explore,
        metricQuery,
        timezone: 'UTC',
        now: new Date('2026-11-18T12:00:00Z'),
    });

const sources = [
    {
        name: 'GitHub',
        explore: () =>
            build({
                connector: ApiConnectorType.GITHUB,
                owner: 'lightdash',
                repo: 'lightdash',
            }),
        dimension: 'author',
        column: 'author',
        maxRows: GITHUB_MAX_QUERY_ROWS,
        message: 'more than 999 rows',
    },
    {
        name: 'Pylon',
        explore: () => build({ connector: ApiConnectorType.PYLON }),
        dimension: 'assignee_email',
        column: 'assignee_email',
        maxRows: PYLON_MAX_QUERY_ROWS,
        message: 'more than 9,999 rows',
    },
    {
        name: 'Attio',
        explore: () =>
            build({ connector: ApiConnectorType.ATTIO, object: 'deals' }),
        dimension: 'record_id',
        column: 'record_id',
        maxRows: ATTIO_MAX_GROUPED_RECORDS,
        message: 'more than 499 rows',
    },
];

describe.each(sources)(
    '$name Count grouped by a dimension',
    ({ explore, dimension, column, maxRows, message }) => {
        const source = explore();
        const dimensionId = `${source.name}_${dimension}`;
        const countId = `${source.name}_count`;
        const compiled = compile(
            source,
            query(source, { dimensions: [dimension], metrics: ['count'] }),
        );

        test('reads every record, up to the grouped cap, as the dimension column', () => {
            expect(compiled.grouping).toEqual({
                aggregates: { [countId]: { type: 'count' } },
                maxRows,
            });
            expect(compiled.requestLimit).toBe(maxRows);
            expect(JSON.parse(compiled.query).columns).toEqual([column]);
        });

        test('counts each group, largest first by default', () => {
            const { rows, columns } = toLiveResult({
                compiled,
                rows: [
                    { [column]: 'a' },
                    { [column]: 'b' },
                    { [column]: 'b' },
                    { [column]: null },
                ],
                fields: getItemMap(source),
            });
            expect(rows).toEqual([
                { [dimensionId]: 'b', [countId]: 2 },
                { [dimensionId]: 'a', [countId]: 1 },
                { [dimensionId]: null, [countId]: 1 },
            ]);
            expect(Object.keys(columns)).toEqual([dimensionId, countId]);
        });

        test('refuses a read the API cut short', () => {
            expect(() =>
                assertLiveResultComplete({
                    compiled,
                    hasMoreRows: true,
                    label: 'Source',
                    maxRows: 1,
                }),
            ).toThrow(message);
        });

        test('answers a complete read', () => {
            expect(() =>
                assertLiveResultComplete({
                    compiled,
                    hasMoreRows: false,
                    label: 'Source',
                    maxRows: 1,
                }),
            ).not.toThrow();
        });

        test('sorts groups by the query sort and applies its limit', () => {
            const sorted = compile(
                source,
                query(
                    source,
                    { dimensions: [dimension], metrics: ['count'] },
                    {
                        sorts: [{ fieldId: dimensionId, descending: false }],
                        limit: 1,
                    },
                ),
            );
            expect(sorted.localSorts).toEqual([
                { fieldId: dimensionId, descending: false },
            ]);
            expect(
                toLiveResult({
                    compiled: sorted,
                    rows: [{ [column]: 'b' }, { [column]: 'a' }],
                    fields: getItemMap(source),
                }).rows,
            ).toEqual([{ [dimensionId]: 'a', [countId]: 1 }]);
        });
    },
);

describe.each(sources.filter(({ name }) => name !== 'GitHub'))(
    '$name Count alone',
    ({ explore }) => {
        test('counts every record read as one row, 0 when none match', () => {
            const source = explore();
            const countId = `${source.name}_count`;
            const compiled = compile(
                source,
                query(source, { dimensions: [], metrics: ['count'] }),
            );
            const count = (rows: Record<string, unknown>[]) =>
                toLiveResult({ compiled, rows, fields: getItemMap(source) })
                    .rows;
            expect(count([{}, {}, {}])).toEqual([{ [countId]: 3 }]);
            expect(count([])).toEqual([{ [countId]: 0 }]);
        });
    },
);

test('GitHub Count alone stays the search total', () => {
    const source = sources[0].explore();
    const compiled = compile(
        source,
        query(source, { dimensions: [], metrics: ['count'] }),
    );
    expect(compiled.grouping).toBeUndefined();
    expect(JSON.parse(compiled.query).columns).toEqual(['total_count']);
});

test('an Attio attribute named count still groups next to Count', () => {
    const source = build({
        connector: ApiConnectorType.ATTIO,
        object: 'deals',
    });
    const withAttribute = {
        ...source,
        apiSource: {
            ...source.apiSource!,
            fields: {
                ...source.apiSource!.fields,
                [`${source.name}_attribute_count`]: {
                    apiName: 'count',
                    filterOperators: [],
                },
            },
        },
    };
    const compiled = compile(
        withAttribute,
        query(withAttribute, {
            dimensions: ['attribute_count'],
            metrics: ['count'],
        }),
    );
    expect(compiled.fieldIdsByColumn).toEqual({
        count: `${source.name}_attribute_count`,
    });
});

test('a list without Count is not grouped', () => {
    const source = sources[1].explore();
    const compiled = compile(
        source,
        query(source, { dimensions: ['state'], metrics: [] }),
    );
    expect(compiled.grouping).toBeUndefined();
});

describe('groupLiveRows', () => {
    test('groups by every dimension together', () => {
        expect(
            groupLiveRows(
                [
                    { a: 1, b: 'x' },
                    { a: 1, b: 'y' },
                    { a: 1, b: 'x' },
                ],
                {
                    dimensions: ['a', 'b'],
                    aggregates: { n: { type: 'count' } },
                },
            ),
        ).toEqual([
            { a: 1, b: 'x', n: 2 },
            { a: 1, b: 'y', n: 1 },
        ]);
    });
});
