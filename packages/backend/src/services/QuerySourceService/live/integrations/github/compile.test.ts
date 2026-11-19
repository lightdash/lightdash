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
} from './explores';
import { GITHUB_MAX_QUERY_ROWS } from './run';

const build = (definition: LiveExploreDefinition) =>
    buildLiveExplore({
        definition,
        exploreName: `github_${definition.name}`,
        label: 'GitHub',
        connectionUuid: 'connection-uuid',
        integration: ApiConnectorType.GITHUB,
        baseVersion: 1,
        capabilities: githubIntegration.capabilities,
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
    it('counts from the pull request list, with one filter per rule', () => {
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
            kind: 'list',
            type: 'pr',
            filters: [
                { column: 'state', op: 'eq', value: 'merged' },
                { column: 'author', op: 'eq', value: 'octocat' },
                {
                    column: 'merged_at',
                    op: 'between',
                    start: '2026-10-01',
                    end: '2026-10-31',
                },
            ],
            columns: ['total_count'],
        });
    });

    it('searches when a word filter needs it, with negations and label matches', () => {
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

    it('counts with one GraphQL total when GraphQL applies every filter', () => {
        const { request } = compile(
            PULL_REQUESTS,
            query('github_pull_requests', {
                metrics: [pr('count')],
                filters: filters(
                    rule(pr('state'), FilterOperator.EQUALS, ['merged']),
                    rule(pr('labels'), FilterOperator.EQUALS, ['🐛 bug']),
                ),
            }),
        );
        expect(request).toEqual({
            kind: 'count',
            type: 'pr',
            state: 'merged',
            label: '🐛 bug',
        });
        expect(
            compile(
                PULL_REQUESTS,
                query('github_pull_requests', { metrics: [pr('count')] }),
            ).request,
        ).toEqual({ kind: 'count', type: 'pr' });
    });

    it('counts from the list when GraphQL cannot apply a filter', () => {
        const { request } = compile(
            PULL_REQUESTS,
            query('github_pull_requests', {
                metrics: [pr('count')],
                filters: filters(
                    rule(pr('labels'), FilterOperator.NOT_EQUALS, ['chore']),
                ),
            }),
        );
        expect(request.kind).toBe('list');
    });

    it('maps closed to closed without merging in a search', () => {
        const { request } = compile(
            PULL_REQUESTS,
            query('github_pull_requests', {
                metrics: [pr('count')],
                filters: filters(
                    rule(pr('title'), FilterOperator.INCLUDE, ['fix']),
                    rule(pr('state'), FilterOperator.EQUALS, ['closed']),
                ),
            }),
        );
        expect(request.q).toBe('"fix" in:title is:closed is:unmerged');
    });

    it('sorts comments locally, since GitHub orders them by a count it does not return', () => {
        const metricQuery = query('github_pull_requests', {
            dimensions: [pr('number'), pr('comments')],
            sorts: [{ fieldId: pr('comments'), descending: true }],
        });
        const { request, localSorts } = compile(PULL_REQUESTS, metricQuery);
        expect(request).not.toHaveProperty('sort');
        expect(localSorts).toEqual(metricQuery.sorts);
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
        expect(request.filters).toEqual([
            {
                column: 'created_at',
                op: 'between',
                start: expect.stringMatching(/^2026-11-1\d$/),
                end: expect.stringMatching(/^2026-11-1\d$/),
            },
            {
                column: 'closed_at',
                op: 'between',
                start: '2008-01-01',
                end: '2025-12-31',
            },
        ]);
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
    it('counts issues by author and assignee with one GraphQL total', () => {
        const { request } = compile(
            ISSUES,
            query('github_issues', {
                metrics: [issue('count')],
                filters: filters(
                    rule(issue('state'), FilterOperator.EQUALS, ['open']),
                    rule(issue('author'), FilterOperator.EQUALS, ['octocat']),
                    rule(issue('assignee'), FilterOperator.EQUALS, ['jo']),
                ),
            }),
        );
        expect(request).toEqual({
            kind: 'count',
            type: 'issue',
            state: 'open',
            author: 'octocat',
            assignee: 'jo',
        });
    });

    it('lists issues with state and state reason filters', () => {
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
            kind: 'list',
            type: 'issue',
            filters: [
                { column: 'state', op: 'eq', value: 'closed' },
                { column: 'state_reason', op: 'eq', value: 'not_planned' },
            ],
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
