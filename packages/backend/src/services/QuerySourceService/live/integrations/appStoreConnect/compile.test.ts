import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    ParameterError,
    SupportedDbtAdapter,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { appStoreConnectIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { compileAppStoreConnectQuery } from './compile';
import {
    APP_STORE_CONNECT_BUILDS_EXPLORE,
    APP_STORE_CONNECT_CUSTOMER_REVIEWS_EXPLORE,
    APP_STORE_CONNECT_REVIEW_SUBMISSIONS_EXPLORE,
    APP_STORE_CONNECT_VERSIONS_EXPLORE,
} from './explores';
import { APP_STORE_CONNECT_MAX_QUERY_ROWS } from './run';

const build = (definition: LiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `asc_${definition.name}`,
        label: 'App Store Connect',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.APP_STORE_CONNECT,
        baseVersion: 1,
        capabilities: appStoreConnectIntegration.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });

const VERSIONS = build(APP_STORE_CONNECT_VERSIONS_EXPLORE);
const BUILDS = build(APP_STORE_CONNECT_BUILDS_EXPLORE);
const REVIEWS = build(APP_STORE_CONNECT_CUSTOMER_REVIEWS_EXPLORE);
const SUBMISSIONS = build(APP_STORE_CONNECT_REVIEW_SUBMISSIONS_EXPLORE);

const rule = (
    fieldId: string,
    operator: FilterOperator,
    values: unknown[],
): FilterRule => ({
    id: `${fieldId}-${operator}-${values.join(',')}`,
    target: { fieldId },
    operator,
    values,
});

const query = (
    exploreName: string,
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName,
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 100,
    tableCalculations: [],
    ...overrides,
});

const filters = (...rules: FilterRule[]): MetricQuery['filters'] => ({
    dimensions: { id: 'root', and: rules },
});

const compile = (explore: typeof VERSIONS, metricQuery: MetricQuery) => {
    const { query: request, localSorts } = compileAppStoreConnectQuery({
        explore,
        metricQuery,
    });
    return { request: JSON.parse(request), localSorts };
};

const version = (name: string) => `asc_versions_${name}`;
const buildField = (name: string) => `asc_builds_${name}`;
const review = (name: string) => `asc_customer_reviews_${name}`;
const submission = (name: string) => `asc_review_submissions_${name}`;

describe('compileAppStoreConnectQuery record lists', () => {
    it('lists versions with the selected attributes and one filter value', () => {
        const { request, localSorts } = compile(
            VERSIONS,
            query('asc_versions', {
                dimensions: [
                    version('version_id'),
                    version('version'),
                    version('state'),
                    version('created_at'),
                ],
                filters: filters(
                    rule(version('platform'), FilterOperator.EQUALS, ['IOS']),
                ),
            }),
        );
        expect(request).toEqual({
            resource: 'appStoreVersions',
            fields: ['id', 'versionString', 'appVersionState', 'createdDate'],
            filters: { platform: ['IOS'] },
        });
        expect(localSorts).toEqual([]);
    });

    it('sends several values of one filter, and sorts versions locally', () => {
        const metricQuery = query('asc_versions', {
            dimensions: [version('version')],
            filters: filters(
                rule(version('state'), FilterOperator.EQUALS, [
                    'WAITING_FOR_REVIEW',
                    'IN_REVIEW',
                ]),
            ),
            sorts: [{ fieldId: version('created_at'), descending: true }],
        });
        const { request, localSorts } = compile(VERSIONS, metricQuery);
        expect(request).toEqual({
            resource: 'appStoreVersions',
            fields: ['versionString'],
            filters: { appVersionState: ['WAITING_FOR_REVIEW', 'IN_REVIEW'] },
        });
        expect(localSorts).toEqual(metricQuery.sorts);
    });

    it('lists builds with no filters', () => {
        const { request } = compile(
            BUILDS,
            query('asc_builds', {
                dimensions: [
                    buildField('build_number'),
                    buildField('processing_state'),
                    buildField('expires_at'),
                ],
            }),
        );
        expect(request).toEqual({
            resource: 'builds',
            fields: ['version', 'processingState', 'expirationDate'],
        });
    });

    it('lists review submissions filtered by platform and state', () => {
        const { request } = compile(
            SUBMISSIONS,
            query('asc_review_submissions', {
                dimensions: [
                    submission('submission_id'),
                    submission('submitted_at'),
                ],
                filters: filters(
                    rule(submission('platform'), FilterOperator.EQUALS, [
                        'IOS',
                    ]),
                    rule(submission('state'), FilterOperator.EQUALS, [
                        'COMPLETE',
                    ]),
                ),
            }),
        );
        expect(request).toEqual({
            resource: 'reviewSubmissions',
            fields: ['id', 'submittedDate'],
            filters: { platform: ['IOS'], state: ['COMPLETE'] },
        });
    });

    it.each([
        ['created_at', true, '-createdDate'],
        ['created_at', false, 'createdDate'],
        ['rating', true, '-rating'],
    ])(
        'sends one customer review sort on %s (descending %s) to the API',
        (field, descending, sort) => {
            const { request, localSorts } = compile(
                REVIEWS,
                query('asc_customer_reviews', {
                    dimensions: [review('title'), review('rating')],
                    filters: filters(
                        rule(review('rating'), FilterOperator.EQUALS, [1, 2]),
                        rule(review('territory'), FilterOperator.EQUALS, [
                            'GBR',
                        ]),
                    ),
                    sorts: [{ fieldId: review(field), descending }],
                }),
            );
            expect(request).toEqual({
                resource: 'customerReviews',
                fields: ['title', 'rating'],
                filters: { rating: ['1', '2'], territory: ['GBR'] },
                sort,
            });
            expect(localSorts).toEqual([]);
        },
    );

    it('sorts customer reviews locally on another field or several sorts, reading every row it may', () => {
        const sorts = [
            [{ fieldId: review('territory'), descending: false }],
            [
                { fieldId: review('rating'), descending: false },
                { fieldId: review('created_at'), descending: true },
            ],
        ];
        sorts.forEach((sort) => {
            const metricQuery = query('asc_customer_reviews', {
                dimensions: [review('territory')],
                sorts: sort,
            });
            const compiled = compileLiveMetricQuery({
                explore: REVIEWS,
                metricQuery,
                timezone: 'UTC',
                now: new Date('2026-11-24T12:00:00Z'),
            });
            expect(JSON.parse(compiled.query)).not.toHaveProperty('sort');
            expect(compiled.localSorts).toEqual(sort);
            expect(compiled.requestLimit).toBe(
                APP_STORE_CONNECT_MAX_QUERY_ROWS,
            );
        });
    });

    it('keeps the values two filters on one field share', () => {
        const { request } = compile(
            REVIEWS,
            query('asc_customer_reviews', {
                dimensions: [review('title')],
                filters: filters(
                    rule(review('rating'), FilterOperator.EQUALS, [1, 2]),
                    rule(review('rating'), FilterOperator.EQUALS, [2, 3]),
                ),
            }),
        );
        expect(request.filters).toEqual({ rating: ['2'] });
    });

    it('refuses a filter value that contains a comma', () => {
        let error: unknown;
        try {
            compile(
                VERSIONS,
                query('asc_versions', {
                    dimensions: [version('version')],
                    filters: filters(
                        rule(version('version'), FilterOperator.EQUALS, [
                            '1,2',
                        ]),
                    ),
                }),
            );
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(ParameterError);
        expect(error).toMatchObject({
            message:
                "App Store Connect can't filter on a value that contains a comma.",
            data: {
                liveSourceErrorCode: 'live_source.refused.filter_operator',
            },
        });
    });
});

describe('compileAppStoreConnectQuery counts', () => {
    it('counts from the list total, keeping the filters', () => {
        const compiled = compileLiveMetricQuery({
            explore: REVIEWS,
            metricQuery: query('asc_customer_reviews', {
                metrics: [review('count')],
                filters: filters(
                    rule(review('rating'), FilterOperator.EQUALS, [1]),
                ),
            }),
            timezone: 'UTC',
            now: new Date('2026-11-24T12:00:00Z'),
        });
        expect(JSON.parse(compiled.query)).toEqual({
            resource: 'customerReviews',
            fields: [],
            filters: { rating: ['1'] },
            count: true,
        });
        expect(compiled.fieldIdsByColumn).toEqual({
            total: review('count'),
        });
    });

    it('counts builds with no filter', () => {
        const { request } = compile(
            BUILDS,
            query('asc_builds', { metrics: [buildField('count')] }),
        );
        expect(request).toEqual({
            resource: 'builds',
            fields: [],
            count: true,
        });
    });
});

describe('the shared check on App Store Connect explores', () => {
    const issues = (metricQuery: MetricQuery) =>
        getApiSourceQueryIssues(VERSIONS.apiSource!, metricQuery).map(
            ({ code }) => code,
        );

    it('refuses Count split by a dimension', () => {
        expect(
            issues(
                query('asc_versions', {
                    dimensions: [version('platform')],
                    metrics: [version('count')],
                }),
            ),
        ).toEqual(['live_source.refused.field_combination']);
    });

    it('allows Count filtered by several values of a dimension', () => {
        expect(
            issues(
                query('asc_versions', {
                    metrics: [version('count')],
                    filters: filters(
                        rule(version('platform'), FilterOperator.EQUALS, [
                            'IOS',
                            'MAC_OS',
                        ]),
                    ),
                }),
            ),
        ).toEqual([]);
    });

    it('refuses filters App Store Connect cannot apply', () => {
        expect(
            issues(
                query('asc_versions', {
                    dimensions: [version('version')],
                    filters: filters(
                        rule(version('platform'), FilterOperator.NOT_EQUALS, [
                            'IOS',
                        ]),
                        rule(
                            version('created_at'),
                            FilterOperator.IN_THE_PAST,
                            [7],
                        ),
                    ),
                }),
            ),
        ).toEqual([
            'live_source.refused.filter_operator',
            'live_source.refused.filter_operator',
        ]);
    });
});
