import { DimensionType, FilterOperator, MetricType } from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

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

const dimension = (
    name: string,
    label: string,
    type: DimensionType,
    filterOperators: FilterOperator[],
    description: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators,
});

const date = (name: string, label: string, description: string) =>
    dimension(
        name,
        label,
        DimensionType.DATE,
        GITHUB_DATE_FILTERS,
        description,
    );

const SEARCH_COUNT_NAME = 'count';

const searchCount = (noun: string): LiveMetricDefinition => ({
    name: SEARCH_COUNT_NAME,
    apiName: 'total_count',
    label: 'Count',
    description: `Number of ${noun}s that match the filters.`,
    aiHint: "Comes from GitHub search's total, so it cannot be split by any dimension: use it alone (with filters) or list rows without it.",
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
});

const searchDimensions = (noun: string): LiveDimensionDefinition[] => [
    dimension(
        'number',
        'Number',
        DimensionType.NUMBER,
        [],
        `The ${noun} number in the repository.`,
    ),
    dimension(
        'title',
        'Title',
        DimensionType.STRING,
        GITHUB_TEXT_FILTERS,
        `Title of the ${noun}.`,
        'Text filters match whole words only (GitHub search).',
    ),
    dimension(
        'url',
        'URL',
        DimensionType.STRING,
        [],
        `Link to the ${noun} on GitHub.`,
    ),
    dimension(
        'author',
        'Author',
        DimensionType.STRING,
        GITHUB_VALUE_FILTERS,
        `GitHub username of the person who opened the ${noun}.`,
    ),
    dimension(
        'assignee',
        'Assignee',
        DimensionType.STRING,
        GITHUB_VALUE_FILTERS,
        `GitHub username of the first person assigned to the ${noun}.`,
        'Only the first assignee is shown; filtering by it matches any assignee.',
    ),
    dimension(
        'labels',
        'Labels',
        DimensionType.STRING,
        GITHUB_VALUE_FILTERS,
        `Labels on the ${noun}, separated by commas.`,
        `"Is" keeps ${noun}s that have the label.`,
    ),
    dimension(
        'comments',
        'Comments',
        DimensionType.NUMBER,
        GITHUB_NUMBER_FILTERS,
        'Number of comments.',
    ),
    date('created_at', 'Created', `Day the ${noun} was opened, in UTC.`),
    date('updated_at', 'Updated', `Day the ${noun} last changed, in UTC.`),
    date('closed_at', 'Closed', `Day the ${noun} was closed, in UTC.`),
    dimension(
        'search',
        'Search text',
        DimensionType.STRING,
        GITHUB_TEXT_FILTERS,
        'Words to look for in the title or description.',
        'Filter only: matches whole words. Empty when selected.',
    ),
];

const countIncompatibility = (dimensions: LiveDimensionDefinition[]) => ({
    fields: [SEARCH_COUNT_NAME],
    with: dimensions.map(({ name }) => name),
    reason: "GitHub search returns one total, so Count can't be split by a dimension. Filter by it instead, or list rows without Count.",
    selectedOnly: true as const,
});

const PULL_REQUEST_DIMENSIONS: LiveDimensionDefinition[] = [
    ...searchDimensions('pull request'),
    dimension(
        'state',
        'State',
        DimensionType.STRING,
        GITHUB_STATE_FILTERS,
        'Whether the pull request is open, merged, or closed without merging.',
        'Filter with equals only.',
    ),
    dimension(
        'draft',
        'Draft',
        DimensionType.BOOLEAN,
        GITHUB_BOOLEAN_FILTERS,
        'Whether the pull request is a draft.',
    ),
    date('merged_at', 'Merged', 'Day the pull request was merged, in UTC.'),
];

export const GITHUB_PULL_REQUESTS_EXPLORE: LiveExploreDefinition = {
    name: 'pull_requests',
    label: 'Pull requests',
    description: 'Pull requests in one GitHub repository.',
    aiHint: "Read live from GitHub search. Count is GitHub's total for the filters and cannot be split by any dimension: query Count alone with filters, or list rows without Count. Text filters match whole words. Dates are UTC days.",
    dimensions: PULL_REQUEST_DIMENSIONS,
    metrics: [searchCount('pull request')],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [countIncompatibility(PULL_REQUEST_DIMENSIONS)],
};

const ISSUE_DIMENSIONS: LiveDimensionDefinition[] = [
    ...searchDimensions('issue'),
    dimension(
        'state',
        'State',
        DimensionType.STRING,
        GITHUB_STATE_FILTERS,
        'Whether the issue is open or closed.',
        'Filter with equals only.',
    ),
    dimension(
        'state_reason',
        'State reason',
        DimensionType.STRING,
        GITHUB_STATE_FILTERS,
        'Why a closed issue was closed: completed, not_planned or reopened.',
    ),
];

export const GITHUB_ISSUES_EXPLORE: LiveExploreDefinition = {
    name: 'issues',
    label: 'Issues',
    description:
        'Issues in one GitHub repository, not including pull requests.',
    aiHint: "Read live from GitHub search. Count is GitHub's total for the filters and cannot be split by any dimension: query Count alone with filters, or list rows without Count. Text filters match whole words. Dates are UTC days.",
    dimensions: ISSUE_DIMENSIONS,
    metrics: [searchCount('issue')],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [countIncompatibility(ISSUE_DIMENSIONS)],
};

const contributorMetric = (
    name: string,
    apiName: string,
    label: string,
    description: string,
    aiHint?: string,
): LiveMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
});

export const GITHUB_CONTRIBUTORS_EXPLORE: LiveExploreDefinition = {
    name: 'contributors',
    label: 'Contributors',
    description:
        "Weekly commits, lines added and lines deleted per author on the repository's default branch.",
    aiHint: "From GitHub's contributor statistics: covers only the top 100 contributors, weeks start on Sunday (UTC), and Lines added and Lines deleted are 0 for repositories with 10,000 or more commits. Without a Week filter it returns the full history; filter Week to choose the weeks. GitHub may compute statistics in the background on first request.",
    dimensions: [
        dimension(
            'author',
            'Author',
            DimensionType.STRING,
            GITHUB_VALUE_FILTERS,
            'GitHub username of the commit author.',
        ),
        dimension(
            'week',
            'Week',
            DimensionType.DATE,
            GITHUB_DATE_FILTERS,
            'Week of the commits, shown as its Sunday, in UTC.',
        ),
    ],
    metrics: [
        contributorMetric(
            'commits',
            'commits',
            'Commits',
            'Number of commits on the default branch.',
        ),
        contributorMetric(
            'additions',
            'additions',
            'Lines added',
            'Number of lines added.',
            'GitHub reports 0 for repositories with 10,000 or more commits.',
        ),
        contributorMetric(
            'deletions',
            'deletions',
            'Lines deleted',
            'Number of lines deleted.',
            'GitHub reports 0 for repositories with 10,000 or more commits.',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};
