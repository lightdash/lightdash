import {
    ApiConnectorType,
    FilterOperator,
    getApiSourceQueryIssues,
    SupportedDbtAdapter,
    UnitOfTime,
    type FilterRule,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { githubIntegration } from '.';
import { compileLiveMetricQuery } from '../../explores/build';
import {
    buildLiveExplore,
    type LiveExploreDefinition,
} from '../../explores/definition';
import { compileGithubQuery } from './compile';
import {
    GITHUB_CONTRIBUTORS_EXPLORE,
    GITHUB_ISSUES_EXPLORE,
    GITHUB_PULL_REQUESTS_EXPLORE,
} from './model';
import { GITHUB_MAX_QUERY_ROWS } from './run';

const build = (definition: LiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `github_${definition.name}`,
        label: 'GitHub',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.GITHUB,
        baseVersion: 1,
        capabilities: githubIntegration.query.capabilities,
        warehouseSqlBuilder: warehouseSqlBuilderFromType(
            SupportedDbtAdapter.DUCKDB,
        ),
    });

const PULL_REQUESTS = build(GITHUB_PULL_REQUESTS_EXPLORE);
const ISSUES = build(GITHUB_ISSUES_EXPLORE);
const CONTRIBUTORS = build(GITHUB_CONTRIBUTORS_EXPLORE);

const rule = (
    fieldId: string,
    operator: FilterOperator,
    values: unknown[],
    settings?: FilterRule['settings'],
): FilterRule => ({
    id: `${fieldId}-${operator}-${values.join(',')}`,
    target: { fieldId },
    operator,
    values,
    ...(settings ? { settings } : {}),
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

const compile = (
    explore: typeof PULL_REQUESTS,
    metricQuery: MetricQuery,
    today = '2026-11-17',
) => {
    const { query: request, localSorts } = compileGithubQuery({
        explore,
        metricQuery,
        today,
    });
    return { request: JSON.parse(request), localSorts };
};

const pr = (name: string) => `github_pull_requests_${name}`;
const issue = (name: string) => `github_issues_${name}`;
const contributor = (name: string) => `github_contributors_${name}`;

describe('compileGithubQuery on pull requests', () => {
    it('counts with the search total, filters as qualifiers', () => {
        const { request } = compile(
            PULL_REQUESTS,
            query('github_pull_requests', {
                metrics: [pr('count')],
                filters: filters(
                    rule(pr('state'), FilterOperator.EQUALS, ['merged']),
                    rule(pr('author'), FilterOperator.EQUALS, ['octocat']),
                    rule(pr('merged_at'), FilterOperator.IN_BETWEEN, [
                        '2026-10-01',
                        '2026-10-31',
                    ]),
                ),
            }),
        );
        expect(request).toEqual({
            kind: 'search',
            type: 'pr',
            q: 'is:merged author:octocat merged:2026-10-01..2026-10-31',
            columns: ['total_count'],
        });
    });

    it('lists rows with a text search, negations and label matches', () => {
        const { request, localSorts } = compile(
            PULL_REQUESTS,
            query('github_pull_requests', {
                dimensions: [pr('number'), pr('title'), pr('author')],
                filters: filters(
                    rule(pr('search'), FilterOperator.INCLUDE, ['embed']),
                    rule(pr('title'), FilterOperator.NOT_INCLUDE, ['chore']),
                    rule(pr('author'), FilterOperator.NOT_EQUALS, [
                        'app/dependabot',
                    ]),
                    rule(pr('labels'), FilterOperator.EQUALS, ['🐛 bug']),
                    rule(pr('draft'), FilterOperator.EQUALS, [false]),
                    rule(pr('comments'), FilterOperator.GREATER_THAN, [5]),
                ),
                sorts: [{ fieldId: pr('created_at'), descending: true }],
            }),
        );
        expect(request).toEqual({
            kind: 'search',
            type: 'pr',
            q: '"embed" in:title,body NOT "chore" in:title -author:app/dependabot label:"🐛 bug" draft:false comments:>5',
            columns: ['number', 'title', 'author'],
            sort: 'created',
            order: 'desc',
        });
        expect(localSorts).toEqual([]);
    });

    it('sorts locally what search cannot, reading every row it may', () => {
        const metricQuery = query('github_pull_requests', {
            dimensions: [pr('title')],
            sorts: [{ fieldId: pr('title'), descending: false }],
        });
        const compiled = compileLiveMetricQuery({
            explore: PULL_REQUESTS,
            metricQuery,
            timezone: 'UTC',
            now: new Date('2026-11-17T12:00:00Z'),
        });
        expect(JSON.parse(compiled.query)).not.toHaveProperty('sort');
        expect(compiled.localSorts).toEqual(metricQuery.sorts);
        expect(compiled.requestLimit).toBe(GITHUB_MAX_QUERY_ROWS);
    });

    it('maps closed to closed without merging', () => {
        const { request } = compile(
            PULL_REQUESTS,
            query('github_pull_requests', {
                metrics: [pr('count')],
                filters: filters(
                    rule(pr('state'), FilterOperator.EQUALS, ['closed']),
                ),
            }),
        );
        expect(request.q).toBe('is:closed is:unmerged');
    });

    it('turns relative and open-ended dates into ranges', () => {
        const { request } = compile(
            PULL_REQUESTS,
            query('github_pull_requests', {
                metrics: [pr('count')],
                filters: filters(
                    rule(pr('created_at'), FilterOperator.IN_THE_PAST, [7], {
                        unitOfTime: UnitOfTime.days,
                        completed: false,
                    }),
                    rule(pr('closed_at'), FilterOperator.LESS_THAN, [
                        '2026-01-01',
                    ]),
                ),
            }),
        );
        expect(request.q).toMatch(/^created:2026-11-\d\d\.\.2026-11-1\d /);
        expect(request.q).toContain('closed:2008-01-01..2025-12-31');
    });

    it('refuses an unknown state with the ones it knows', () => {
        expect(() =>
            compile(
                PULL_REQUESTS,
                query('github_pull_requests', {
                    metrics: [pr('count')],
                    filters: filters(
                        rule(pr('state'), FilterOperator.EQUALS, ['draft']),
                    ),
                }),
            ),
        ).toThrow('State must be one of: open, merged, closed.');
    });
});

describe('the shared check on pull requests', () => {
    const issues = (metricQuery: MetricQuery) =>
        getApiSourceQueryIssues(PULL_REQUESTS.apiSource!, metricQuery).map(
            ({ code }) => code,
        );

    it('refuses Count split by a dimension', () => {
        expect(
            issues(
                query('github_pull_requests', {
                    dimensions: [pr('author')],
                    metrics: [pr('count')],
                }),
            ),
        ).toEqual(['live_source.refused.field_combination']);
    });

    it('allows Count filtered by a dimension', () => {
        expect(
            issues(
                query('github_pull_requests', {
                    metrics: [pr('count')],
                    filters: filters(
                        rule(pr('author'), FilterOperator.EQUALS, ['octocat']),
                    ),
                }),
            ),
        ).toEqual([]);
    });

    it('refuses prefix matches, which search cannot do', () => {
        expect(
            issues(
                query('github_pull_requests', {
                    metrics: [pr('count')],
                    filters: filters(
                        rule(pr('search'), FilterOperator.STARTS_WITH, ['emb']),
                    ),
                }),
            ),
        ).toEqual(['live_source.refused.filter_operator']);
    });
});

describe('compileGithubQuery on issues', () => {
    it('searches issues and maps state reasons', () => {
        const { request } = compile(
            ISSUES,
            query('github_issues', {
                dimensions: [issue('number'), issue('state_reason')],
                filters: filters(
                    rule(issue('state'), FilterOperator.EQUALS, ['closed']),
                    rule(issue('state_reason'), FilterOperator.EQUALS, [
                        'not_planned',
                    ]),
                ),
            }),
        );
        expect(request).toEqual({
            kind: 'search',
            type: 'issue',
            q: 'is:closed reason:"not planned"',
            columns: ['number', 'state_reason'],
        });
    });
});

describe('compileGithubQuery on contributors', () => {
    it('reads statistics for the weeks and authors filtered, sorting locally', () => {
        const metricQuery = query('github_contributors', {
            dimensions: [contributor('author')],
            metrics: [contributor('commits')],
            filters: filters(
                rule(contributor('week'), FilterOperator.IN_BETWEEN, [
                    '2026-08-01',
                    '2026-10-31',
                ]),
                rule(contributor('author'), FilterOperator.NOT_EQUALS, [
                    'semantic-release-bot',
                ]),
            ),
            sorts: [{ fieldId: contributor('commits'), descending: true }],
        });
        const { request, localSorts } = compile(CONTRIBUTORS, metricQuery);
        expect(request).toEqual({
            kind: 'contributors',
            columns: ['author', 'commits'],
            since: '2026-08-01',
            until: '2026-10-31',
            excludeAuthors: ['semantic-release-bot'],
        });
        expect(localSorts).toEqual(metricQuery.sorts);
    });
});
