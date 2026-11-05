import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    ParameterError,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { buildApiSourceExplore } from '../apiSourceExplore';
import { compilePostHogQuery } from './posthogCompiler';
import {
    POSTHOG_EVENTS_EXPLORE,
    POSTHOG_MAX_SCANNED_PROPERTIES,
    POSTHOG_SEMANTIC_LAYER_VERSION,
    withPostHogPropertyFields,
} from './posthogSemanticLayer';

const EXPLORE = 'posthog_events';
const warehouseSqlBuilder = warehouseSqlBuilderFromType(
    SupportedDbtAdapter.CLICKHOUSE,
);

const buildExplore = (definition = POSTHOG_EVENTS_EXPLORE) =>
    buildApiSourceExplore({
        definition,
        exploreName: EXPLORE,
        label: 'Product',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.POSTHOG,
        baseVersion: POSTHOG_SEMANTIC_LAYER_VERSION,
        warehouseSqlBuilder,
    });

const field = (name: string) => `${EXPLORE}_${name}`;

const rule = (
    name: string,
    operator: FilterOperator,
    values: unknown[] = [],
): FilterRule => ({
    id: `${name}-${operator}`,
    target: { fieldId: field(name) },
    operator,
    values,
});

const query = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: EXPLORE,
    dimensions: [field('week'), field('browser')],
    metrics: [field('unique_users'), field('event_count')],
    filters: {},
    sorts: [{ fieldId: field('unique_users'), descending: true }],
    limit: 20,
    tableCalculations: [],
    ...overrides,
});

const compile = (metricQuery: MetricQuery, explore = buildExplore()) =>
    compilePostHogQuery({
        explore,
        metricQuery,
        warehouseSqlBuilder,
        timezone: 'UTC',
    });

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('PostHog semantic layer', () => {
    test('keeps its field ids stable', () => {
        expect(
            Object.keys(buildExplore().apiSource?.fields ?? {}),
        ).toMatchSnapshot();
    });
});

describe('compilePostHogQuery', () => {
    test('compiles one HogQL query, reading the last 30 days by default', () => {
        const { query: hogql, ...compiled } = compile(query());
        expect(hogql).toMatchSnapshot();
        expect(hogql).toContain(
            `(toDate("${EXPLORE}".timestamp)) >= ('2026-10-05')`,
        );
        expect(hogql).not.toContain('LIMIT');
        expect(compiled).toEqual({
            requestLimit: 20,
            limit: 20,
            fieldIdsByColumn: {
                c0: field('week'),
                c1: field('browser'),
                c2: field('unique_users'),
                c3: field('event_count'),
            },
            localSorts: [],
        });
    });

    test('uses the date filter instead of the default, even inside an OR', () => {
        const { query: hogql } = compile(
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        or: [
                            rule('date', FilterOperator.IN_BETWEEN, [
                                '2026-10-01',
                                '2026-10-31',
                            ]),
                            rule('event', FilterOperator.EQUALS, ['$pageview']),
                        ],
                    },
                },
            }),
        );
        expect(hogql).toContain(
            `(toDate("${EXPLORE}".timestamp)) >= ('2026-10-01')`,
        );
        expect(hogql).toContain(`("${EXPLORE}".event) IN ('$pageview')`);
        expect(hogql).not.toContain("'2026-10-05'");
    });

    test('keeps the default when the date filter is disabled', () => {
        const { query: hogql } = compile(
            query({
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                ...rule('date', FilterOperator.EQUALS, [
                                    '2026-10-01',
                                ]),
                                disabled: true,
                            },
                        ],
                    },
                },
            }),
        );
        expect(hogql).toContain("'2026-10-05'");
    });

    test('applies metric filters after aggregating and sorts by position', () => {
        const { query: hogql } = compile(
            query({
                filters: {
                    metrics: {
                        id: 'metrics',
                        and: [
                            rule(
                                'event_count',
                                FilterOperator.GREATER_THAN,
                                [5],
                            ),
                        ],
                    },
                },
                sorts: [
                    { fieldId: field('week'), descending: false },
                    { fieldId: field('event_count'), descending: true },
                ],
            }),
        );
        expect(hogql).toContain(`("${field('event_count')}") > (5)`);
        expect(hogql).toMatch(/\) AS live_query\nORDER BY c0 ASC, c3 DESC$/);
    });

    test('refuses features live data sources cannot run yet', () => {
        expect(() =>
            compile(
                query({
                    tableCalculations: [
                        {
                            name: 'share',
                            displayName: 'Share',
                            sql: '1',
                        },
                    ],
                }),
            ),
        ).toThrow(ParameterError);
    });
});

describe('withPostHogPropertyFields', () => {
    const results = (
        ...definitions: { name: string; property_type?: string | null }[]
    ) => ({ results: definitions });

    test('adds event and person properties with their types', () => {
        const definition = withPostHogPropertyFields(POSTHOG_EVENTS_EXPLORE, {
            event: results(
                { name: 'plan', property_type: 'String' },
                { name: '$screen_width', property_type: 'Numeric' },
                { name: 'is_trial', property_type: 'Boolean' },
            ),
            person: results({ name: 'email', property_type: null }),
        });
        expect(
            definition.dimensions
                .slice(POSTHOG_EVENTS_EXPLORE.dimensions.length)
                .map(({ name, type, sql }) => ({ name, type, sql })),
        ).toEqual([
            {
                name: 'property_plan',
                type: DimensionType.STRING,
                sql: '${TABLE}.properties.plan',
            },
            {
                name: 'property_screen_width',
                type: DimensionType.NUMBER,
                sql: 'toFloat(${TABLE}.properties.$screen_width)',
            },
            {
                name: 'property_is_trial',
                type: DimensionType.BOOLEAN,
                sql: '${TABLE}.properties.is_trial',
            },
            {
                name: 'person_email',
                type: DimensionType.STRING,
                sql: '${TABLE}.person.properties.email',
            },
        ]);
    });

    test('skips covered, clashing and unquotable properties', () => {
        const definition = withPostHogPropertyFields(POSTHOG_EVENTS_EXPLORE, {
            event: results(
                { name: '$browser' },
                { name: 'plan' },
                { name: 'Plan' },
                { name: "x') OR 1=1 --" },
                { name: 'with space' },
            ),
            person: results({ name: 'id' }),
        });
        expect(
            definition.dimensions
                .slice(POSTHOG_EVENTS_EXPLORE.dimensions.length)
                .map(({ name, apiName }) => ({ name, apiName })),
        ).toEqual([{ name: 'property_plan', apiName: 'properties.plan' }]);
    });

    test('caps each kind and ignores unreadable definitions', () => {
        const many = results(
            ...Array.from(
                { length: POSTHOG_MAX_SCANNED_PROPERTIES + 5 },
                (_, index) => ({ name: `p${index}` }),
            ),
        );
        const definition = withPostHogPropertyFields(POSTHOG_EVENTS_EXPLORE, {
            event: many,
            person: { detail: 'Not found' },
        });
        expect(
            definition.dimensions.length -
                POSTHOG_EVENTS_EXPLORE.dimensions.length,
        ).toBe(POSTHOG_MAX_SCANNED_PROPERTIES);
    });
});
