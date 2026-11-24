import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    getItemMap,
    ParameterError,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { googlePlayIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { compileGooglePlayQuery, getGooglePlayEarliestDate } from './compile';
import { GOOGLE_PLAY_EXPLORES } from './explores';
import { GOOGLE_PLAY_MAX_QUERY_ROWS } from './run';

const TODAY = '2026-11-24';

const definition = (name: string): LiveExploreDefinition => {
    const found = GOOGLE_PLAY_EXPLORES.find(
        (explore) => explore.definition.name === name,
    );
    if (!found) throw new Error(`No explore ${name}`);
    return found.definition;
};

const build = (name: string) => {
    const exploreName = `google_play_${name}`;
    const explore = buildLiveExplore({
        definition: definition(name),
        exploreName,
        label: 'com.example.app',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.GOOGLE_PLAY,
        baseVersion: 1,
        capabilities: googlePlayIntegration.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });
    const field = (fieldName: string) => `${exploreName}_${fieldName}`;
    const rule = (
        fieldName: string,
        operator: FilterOperator,
        values: unknown[],
    ): FilterRule => ({
        id: `${fieldName}-${operator}-${values.join(',')}`,
        target: { fieldId: field(fieldName) },
        operator,
        values,
    });
    const query = (
        dimensions: string[],
        metrics: string[],
        rules: FilterRule[] = [],
        overrides: Partial<MetricQuery> = {},
    ): MetricQuery => ({
        exploreName,
        dimensions: dimensions.map(field),
        metrics: metrics.map(field),
        filters:
            rules.length > 0 ? { dimensions: { id: 'root', and: rules } } : {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        ...overrides,
    });
    const compile = (metricQuery: MetricQuery) => {
        const issues = getApiSourceQueryIssues(
            explore.apiSource!,
            metricQuery,
            { itemsMap: getItemMap(explore) },
        );
        if (issues.length > 0) {
            throw new ParameterError(
                issues.map(({ message }) => message).join(' '),
            );
        }
        const compiled = compileGooglePlayQuery({
            explore,
            metricQuery,
            today: TODAY,
            maxRows: GOOGLE_PLAY_MAX_QUERY_ROWS,
        });
        return { ...compiled, request: JSON.parse(compiled.query) };
    };
    return { explore, field, rule, query, compile };
};

const crashes = build('crashes');

describe('Google Play semantic layer', () => {
    test('keeps its field ids stable', () => {
        expect(
            GOOGLE_PLAY_EXPLORES.map(({ definition: { name } }) => [
                name,
                Object.keys(build(name).explore.apiSource?.fields ?? {}),
            ]),
        ).toMatchSnapshot();
    });

    test('has no country on error reports', () => {
        expect(
            definition('errors').dimensions.map(({ name }) => name),
        ).not.toContain('country_code');
    });
});

describe('getGooglePlayEarliestDate', () => {
    test('is the first day inside three years', () => {
        expect(getGooglePlayEarliestDate('2026-11-24')).toBe('2023-11-25');
    });
});

describe('compileGooglePlayQuery', () => {
    test('compiles a by-day query over the default 28 days', () => {
        const { request, localSorts } = crashes.compile(
            crashes.query(['date', 'version_code'], ['crash_rate']),
        );
        expect(request).toEqual({
            metricSet: 'crashRateMetricSet',
            startDate: '2026-10-27',
            endDate: '2026-11-23',
            dimensions: ['date', 'versionCode'],
            rowLimit: 500,
        });
        expect(localSorts).toEqual([]);
    });

    test('maps every column through compileLiveMetricQuery', () => {
        const compiled = compileLiveMetricQuery({
            explore: crashes.explore,
            metricQuery: crashes.query(
                ['date'],
                ['crash_rate', 'distinct_users'],
            ),
            timezone: 'Europe/London',
            now: new Date('2026-11-24T12:00:00Z'),
        });
        expect(compiled.fieldIdsByColumn).toEqual({
            date: crashes.field('date'),
            crashRate: crashes.field('crash_rate'),
            distinctUsers: crashes.field('distinct_users'),
        });
    });

    test('uses Pacific Time for today', () => {
        const compiled = compileLiveMetricQuery({
            explore: crashes.explore,
            metricQuery: crashes.query(['date'], ['crash_rate']),
            timezone: 'UTC',
            now: new Date('2026-11-24T05:00:00Z'),
        });
        expect(JSON.parse(compiled.query).endDate).toBe('2026-11-22');
    });

    test('reads the latest day for rolling metrics without a date', () => {
        const { request } = crashes.compile(
            crashes.query(['device_model'], ['user_perceived_crash_rate_28d']),
        );
        expect(request).toEqual({
            metricSet: 'crashRateMetricSet',
            startDate: '2026-10-27',
            endDate: '2026-11-23',
            dimensions: ['deviceModel'],
            rowLimit: 500,
        });
    });

    test('lists dimension values without metrics or a date', () => {
        const { request } = crashes.compile(crashes.query(['api_level'], []));
        expect(request.dimensions).toEqual(['apiLevel']);
    });

    test('sorts every sort locally, reading every row', () => {
        const sorts = [
            { fieldId: crashes.field('crash_rate'), descending: true },
        ];
        const { request, localSorts } = crashes.compile(
            crashes.query(['date'], ['crash_rate'], [], { sorts }),
        );
        expect(localSorts).toEqual(sorts);
        expect(request.rowLimit).toBe(GOOGLE_PLAY_MAX_QUERY_ROWS);
    });

    test('takes the date range from the date filter', () => {
        const { request } = crashes.compile(
            crashes.query(
                ['date'],
                ['crash_rate'],
                [
                    crashes.rule('date', FilterOperator.IN_BETWEEN, [
                        '2026-10-01',
                        '2026-10-31',
                    ]),
                ],
            ),
        );
        expect([request.startDate, request.endDate]).toEqual([
            '2026-10-01',
            '2026-10-31',
        ]);
        expect(request.filter).toBeUndefined();
    });

    test('builds the filter for one value', () => {
        const { request } = crashes.compile(
            crashes.query(
                ['date'],
                ['crash_rate'],
                [crashes.rule('device_type', FilterOperator.EQUALS, ['PHONE'])],
            ),
        );
        expect(request.filter).toBe('(deviceType = "PHONE")');
    });

    test('ORs several values and ANDs several fields, quoting numbers too', () => {
        const { request } = crashes.compile(
            crashes.query(
                ['date'],
                ['crash_rate'],
                [
                    crashes.rule(
                        'version_code',
                        FilterOperator.EQUALS,
                        [1308, 1307],
                    ),
                    crashes.rule('device_type', FilterOperator.EQUALS, [
                        'PHONE',
                    ]),
                ],
            ),
        );
        expect(request.filter).toBe(
            '(versionCode = "1308" OR versionCode = "1307") AND (deviceType = "PHONE")',
        );
    });

    test('refuses a filter value with a quote or a backslash', () => {
        ['say "hi"', 'back\\slash'].forEach((value) => {
            expect(() =>
                crashes.compile(
                    crashes.query(
                        ['date'],
                        ['crash_rate'],
                        [
                            crashes.rule(
                                'device_model',
                                FilterOperator.EQUALS,
                                [value],
                            ),
                        ],
                    ),
                ),
            ).toThrow(
                expect.objectContaining({
                    message:
                        "Google Play can't filter on a value that contains a quote or a backslash.",
                    data: expect.objectContaining({
                        liveSourceErrorCode:
                            'live_source.refused.filter_operator',
                    }),
                }),
            );
        });
    });

    test('refuses a daily metric without a date, naming it', () => {
        expect(() =>
            crashes.compile(
                crashes.query(
                    ['version_code'],
                    ['crash_rate', 'crash_rate_28d', 'distinct_users'],
                ),
            ),
        ).toThrow(
            expect.objectContaining({
                message:
                    'Google Play reports Crash rate and Distinct users per day. Add Date to the query, or use a 7-day or 28-day metric to get one number for the latest day.',
                data: expect.objectContaining({
                    liveSourceErrorCode:
                        'live_source.refused.field_combination',
                }),
            }),
        );
    });

    describe('slow starts', () => {
        const slowStarts = build('slow_starts');

        test('refuses a query without Start type', () => {
            expect(() =>
                slowStarts.compile(
                    slowStarts.query(['date'], ['slow_start_rate']),
                ),
            ).toThrow(
                'Google Play reports slow starts per start type. Add Start type to the query, or filter it to one of COLD, WARM or HOT.',
            );
        });

        test('refuses Start type filtered to several values', () => {
            expect(() =>
                slowStarts.compile(
                    slowStarts.query(
                        ['date'],
                        ['slow_start_rate'],
                        [
                            slowStarts.rule(
                                'start_type',
                                FilterOperator.EQUALS,
                                ['COLD', 'WARM'],
                            ),
                        ],
                    ),
                ),
            ).toThrow(ParameterError);
        });

        test('runs with Start type filtered to one value', () => {
            const { request } = slowStarts.compile(
                slowStarts.query(
                    ['date'],
                    ['slow_start_rate'],
                    [
                        slowStarts.rule('start_type', FilterOperator.EQUALS, [
                            'COLD',
                        ]),
                    ],
                ),
            );
            expect(request).toMatchObject({
                metricSet: 'slowStartRateMetricSet',
                dimensions: ['date'],
                filter: '(startType = "COLD")',
            });
        });

        test('runs with Start type selected', () => {
            const { request } = slowStarts.compile(
                slowStarts.query(['start_type'], ['slow_start_rate_7d']),
            );
            expect(request.dimensions).toEqual(['startType']);
        });
    });

    describe('errors', () => {
        const errors = build('errors');

        test('refuses a query without Report type', () => {
            expect(() =>
                errors.compile(errors.query(['date'], ['error_reports'])),
            ).toThrow(
                'Google Play reports errors per report type. Add Report type to the query, or filter it to one of CRASH, ANR or NON_FATAL.',
            );
        });

        test('asks for a date, having no rolling metric', () => {
            expect(() =>
                errors.compile(
                    errors.query(['report_type'], ['error_reports']),
                ),
            ).toThrow(
                'Google Play reports Error reports per day. Add Date to the query.',
            );
        });

        test('compiles by day and report type', () => {
            const { request } = errors.compile(
                errors.query(
                    ['date', 'report_type', 'issue_id'],
                    ['error_reports'],
                ),
            );
            expect(request).toMatchObject({
                metricSet: 'errorCountMetricSet',
                dimensions: ['date', 'reportType', 'issueId'],
            });
        });
    });
});
