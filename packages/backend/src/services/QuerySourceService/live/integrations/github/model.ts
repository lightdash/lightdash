import {
    ApiConnectorType,
    DimensionType,
    FilterOperator,
    MetricType,
} from '@lightdash/common';
import {
    ADDITIVE,
    dimension,
    metric,
    type LiveExploreDefinition,
    type LiveModel,
} from '../../sdk';

// Search matches whole words, so only word matches are offered
export const GITHUB_TEXT_FILTERS = [
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
];

export const GITHUB_VALUE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
];

// A state is one qualifier; "not merged" has no single one
export const GITHUB_STATE_FILTERS = [FilterOperator.EQUALS];

export const GITHUB_NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.GREATER_THAN,
    FilterOperator.LESS_THAN,
];

export const GITHUB_BOOLEAN_FILTERS = [FilterOperator.EQUALS];

export const GITHUB_DATE_FILTERS = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.EQUALS,
    // Open-ended: the missing side is today or GitHub's first day
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
];

export const GITHUB_PULL_REQUESTS_EXPLORE: LiveExploreDefinition = {
    name: 'pull_requests',
    label: 'Pull requests',
    description: 'Pull requests in one GitHub repository.',
    aiHint: "Read live from GitHub search. Count is GitHub's total for the filters and cannot be split by any dimension: query Count alone with filters, or list rows without Count. Listing reads at most 1,000 pull requests. Text filters match whole words. Dates are UTC days.",
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [
        {
            fields: ['count'],
            with: [
                'number',
                'title',
                'url',
                'author',
                'assignee',
                'labels',
                'comments',
                'created_at',
                'updated_at',
                'closed_at',
                'search',
                'state',
                'draft',
                'merged_at',
            ],
            reason: "GitHub search returns one total, so Count can't be split by a dimension. Filter by it instead, or list rows without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'number',
            label: 'Number',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'The pull request number in the repository.',
        }),
        dimension({
            name: 'title',
            label: 'Title',
            type: DimensionType.STRING,
            filterOperators: GITHUB_TEXT_FILTERS,
            description: 'Title of the pull request.',
            aiHint: 'Text filters match whole words only (GitHub search).',
        }),
        dimension({
            name: 'url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to the pull request on GitHub.',
        }),
        dimension({
            name: 'author',
            label: 'Author',
            type: DimensionType.STRING,
            filterOperators: GITHUB_VALUE_FILTERS,
            description:
                'GitHub username of the person who opened the pull request.',
        }),
        dimension({
            name: 'assignee',
            label: 'Assignee',
            type: DimensionType.STRING,
            filterOperators: GITHUB_VALUE_FILTERS,
            description:
                'GitHub username of the first person assigned to the pull request.',
            aiHint: 'Only the first assignee is shown; filtering by it matches any assignee.',
        }),
        dimension({
            name: 'labels',
            label: 'Labels',
            type: DimensionType.STRING,
            filterOperators: GITHUB_VALUE_FILTERS,
            description: 'Labels on the pull request, separated by commas.',
            aiHint: '"Is" keeps pull requests that have the label.',
        }),
        dimension({
            name: 'comments',
            label: 'Comments',
            type: DimensionType.NUMBER,
            filterOperators: GITHUB_NUMBER_FILTERS,
            description: 'Number of comments.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Day the pull request was opened, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            label: 'Updated',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Day the pull request last changed, in UTC.',
        }),
        dimension({
            name: 'closed_at',
            label: 'Closed',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Day the pull request was closed, in UTC.',
        }),
        dimension({
            name: 'search',
            label: 'Search text',
            type: DimensionType.STRING,
            filterOperators: GITHUB_TEXT_FILTERS,
            description: 'Words to look for in the title or description.',
            aiHint: 'Filter only: matches whole words. Empty when selected.',
        }),
        dimension({
            name: 'state',
            label: 'State',
            type: DimensionType.STRING,
            filterOperators: GITHUB_STATE_FILTERS,
            description:
                'Whether the pull request is open, merged, or closed without merging.',
            aiHint: 'Filter with equals only.',
        }),
        dimension({
            name: 'draft',
            label: 'Draft',
            type: DimensionType.BOOLEAN,
            filterOperators: GITHUB_BOOLEAN_FILTERS,
            description: 'Whether the pull request is a draft.',
        }),
        dimension({
            name: 'merged_at',
            label: 'Merged',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Day the pull request was merged, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total_count',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of pull requests that match the filters.',
            aiHint: "Comes from GitHub search's total, so it cannot be split by any dimension: use it alone (with filters) or list rows without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const GITHUB_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'Issues in one GitHub repository, not including pull requests.',
    aiHint: "Read live from GitHub search. Count is GitHub's total for the filters and cannot be split by any dimension: query Count alone with filters, or list rows without Count. Listing reads at most 1,000 issues. Text filters match whole words. Dates are UTC days.",
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [
        {
            fields: ['count'],
            with: [
                'number',
                'title',
                'url',
                'author',
                'assignee',
                'labels',
                'comments',
                'created_at',
                'updated_at',
                'closed_at',
                'search',
                'state',
                'state_reason',
            ],
            reason: "GitHub search returns one total, so Count can't be split by a dimension. Filter by it instead, or list rows without Count.",
            selectedOnly: true,
        },
    ],
    dimensions: [
        dimension({
            name: 'number',
            label: 'Number',
            type: DimensionType.NUMBER,
            filterOperators: [],
            description: 'The issue number in the repository.',
        }),
        dimension({
            name: 'title',
            label: 'Title',
            type: DimensionType.STRING,
            filterOperators: GITHUB_TEXT_FILTERS,
            description: 'Title of the issue.',
            aiHint: 'Text filters match whole words only (GitHub search).',
        }),
        dimension({
            name: 'url',
            label: 'URL',
            type: DimensionType.STRING,
            filterOperators: [],
            description: 'Link to the issue on GitHub.',
        }),
        dimension({
            name: 'author',
            label: 'Author',
            type: DimensionType.STRING,
            filterOperators: GITHUB_VALUE_FILTERS,
            description: 'GitHub username of the person who opened the issue.',
        }),
        dimension({
            name: 'assignee',
            label: 'Assignee',
            type: DimensionType.STRING,
            filterOperators: GITHUB_VALUE_FILTERS,
            description:
                'GitHub username of the first person assigned to the issue.',
            aiHint: 'Only the first assignee is shown; filtering by it matches any assignee.',
        }),
        dimension({
            name: 'labels',
            label: 'Labels',
            type: DimensionType.STRING,
            filterOperators: GITHUB_VALUE_FILTERS,
            description: 'Labels on the issue, separated by commas.',
            aiHint: '"Is" keeps issues that have the label.',
        }),
        dimension({
            name: 'comments',
            label: 'Comments',
            type: DimensionType.NUMBER,
            filterOperators: GITHUB_NUMBER_FILTERS,
            description: 'Number of comments.',
        }),
        dimension({
            name: 'created_at',
            label: 'Created',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Day the issue was opened, in UTC.',
        }),
        dimension({
            name: 'updated_at',
            label: 'Updated',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Day the issue last changed, in UTC.',
        }),
        dimension({
            name: 'closed_at',
            label: 'Closed',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Day the issue was closed, in UTC.',
        }),
        dimension({
            name: 'search',
            label: 'Search text',
            type: DimensionType.STRING,
            filterOperators: GITHUB_TEXT_FILTERS,
            description: 'Words to look for in the title or description.',
            aiHint: 'Filter only: matches whole words. Empty when selected.',
        }),
        dimension({
            name: 'state',
            label: 'State',
            type: DimensionType.STRING,
            filterOperators: GITHUB_STATE_FILTERS,
            description: 'Whether the issue is open or closed.',
            aiHint: 'Filter with equals only.',
        }),
        dimension({
            name: 'state_reason',
            label: 'State reason',
            type: DimensionType.STRING,
            filterOperators: GITHUB_STATE_FILTERS,
            description:
                'Why a closed issue was closed: completed, not_planned or reopened.',
        }),
    ],
    metrics: [
        metric({
            name: 'count',
            apiName: 'total_count',
            label: 'Count',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of issues that match the filters.',
            aiHint: "Comes from GitHub search's total, so it cannot be split by any dimension: use it alone (with filters) or list rows without it.",
            aggregation: ADDITIVE,
        }),
    ],
};

export const GITHUB_CONTRIBUTORS_EXPLORE: LiveExploreDefinition = {
    name: 'contributors',
    label: 'Contributors',
    description:
        "Weekly commits, lines added and lines deleted per author on the repository's default branch.",
    aiHint: "From GitHub's contributor statistics: covers only the top 100 contributors, weeks start on Sunday (UTC), and Lines added and Lines deleted are 0 for repositories with 10,000 or more commits. Without a Week filter it returns the full history; filter Week to choose the weeks. GitHub may compute statistics in the background on first request.",
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
    dimensions: [
        dimension({
            name: 'author',
            label: 'Author',
            type: DimensionType.STRING,
            filterOperators: GITHUB_VALUE_FILTERS,
            description: 'GitHub username of the commit author.',
        }),
        dimension({
            name: 'week',
            label: 'Week',
            type: DimensionType.DATE,
            filterOperators: GITHUB_DATE_FILTERS,
            description: 'Week of the commits, shown as its Sunday, in UTC.',
        }),
    ],
    metrics: [
        metric({
            name: 'commits',
            label: 'Commits',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of commits on the default branch.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'additions',
            label: 'Lines added',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of lines added.',
            aiHint: 'GitHub reports 0 for repositories with 10,000 or more commits.',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'deletions',
            label: 'Lines deleted',
            type: MetricType.NUMBER,
            filterOperators: [],
            description: 'Number of lines deleted.',
            aiHint: 'GitHub reports 0 for repositories with 10,000 or more commits.',
            aggregation: ADDITIVE,
        }),
    ],
};

export const GITHUB_EXPLORES = [
    GITHUB_PULL_REQUESTS_EXPLORE,
    GITHUB_ISSUES_EXPLORE,
    GITHUB_CONTRIBUTORS_EXPLORE,
] as const;

export const githubModel: LiveModel<ApiConnectorType.GITHUB> = {
    explores: GITHUB_EXPLORES,
    plannedNames: ['workflow_runs', 'releases'],
};
