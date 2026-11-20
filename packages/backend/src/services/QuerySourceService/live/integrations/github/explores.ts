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
): LiveDimensionDefinition => ({
    name,
    apiName: name,
    label,
    description,
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

const SEARCH_COUNT: LiveMetricDefinition = {
    name: 'count',
    apiName: 'total_count',
    label: 'Count',
    description:
        "How many match the filters. Exact and fast from GitHub's own total when filtered only by State and Labels (and Author and Assignee on issues); otherwise counted from the listed items, or the search total with a Title or Search text filter.",
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
};

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
        `The ${noun} title. Filters match whole words through GitHub search, which can miss older items.`,
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
        `GitHub login of whoever opened the ${noun}.`,
    ),
    dimension(
        'assignee',
        'Assignee',
        DimensionType.STRING,
        GITHUB_VALUE_FILTERS,
        `GitHub login of the first assignee.`,
    ),
    dimension(
        'labels',
        'Labels',
        DimensionType.STRING,
        GITHUB_VALUE_FILTERS,
        `The ${noun}'s labels, comma separated. "Is" keeps ${noun}s that have the label.`,
    ),
    dimension(
        'comments',
        'Comments',
        DimensionType.NUMBER,
        GITHUB_NUMBER_FILTERS,
        'Number of comments.',
    ),
    date('created_at', 'Created', `The day the ${noun} was opened, in UTC.`),
    date('updated_at', 'Updated', `The day the ${noun} last changed, in UTC.`),
    date('closed_at', 'Closed', `The day the ${noun} was closed, in UTC.`),
    dimension(
        'search',
        'Search text',
        DimensionType.STRING,
        GITHUB_TEXT_FILTERS,
        'Filter only: words in the title or description. Matches whole words through GitHub search, which can miss older items. Empty when selected.',
    ),
];

const countIncompatibility = (dimensions: LiveDimensionDefinition[]) => ({
    fields: [SEARCH_COUNT.name],
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
        'open, merged or closed (closed without merging).',
    ),
    dimension(
        'draft',
        'Draft',
        DimensionType.BOOLEAN,
        GITHUB_BOOLEAN_FILTERS,
        'Whether the pull request is a draft.',
    ),
    date('merged_at', 'Merged', 'The day the pull request was merged, in UTC.'),
];

export const GITHUB_PULL_REQUESTS_EXPLORE: LiveExploreDefinition = {
    name: 'pull_requests',
    label: 'Pull requests',
    description:
        "Pull requests of one GitHub repository, read live from GitHub's pull request list, newest first. One query reads at most 5,000 pull requests, so filter Created or Updated on a busy repository. Title and Search text filters use GitHub search instead, which reads at most 1,000 and can miss older pull requests.",
    dimensions: PULL_REQUEST_DIMENSIONS,
    metrics: [SEARCH_COUNT],
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
        'open or closed.',
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
        "Issues of one GitHub repository, without pull requests, read live from GitHub's issue list, newest first. One query reads at most 5,000 issues and pull requests, so filter Created or Updated on a busy repository. Title and Search text filters use GitHub search instead, which reads at most 1,000 and can miss older issues.",
    dimensions: ISSUE_DIMENSIONS,
    metrics: [SEARCH_COUNT],
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
): LiveMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    type: MetricType.NUMBER,
    filterOperators: [],
    aggregation: { aggregation: 'additive' },
});

export const GITHUB_CONTRIBUTORS_EXPLORE: LiveExploreDefinition = {
    name: 'contributors',
    label: 'Contributors',
    description:
        "Commits per author and week on the repository's default branch, from GitHub's contributor statistics. Covers the top contributors GitHub reports; lines added and deleted are 0 on repositories with 10,000 commits or more.",
    dimensions: [
        dimension(
            'author',
            'Author',
            DimensionType.STRING,
            GITHUB_VALUE_FILTERS,
            'GitHub login of the commit author.',
        ),
        dimension(
            'week',
            'Week',
            DimensionType.DATE,
            GITHUB_DATE_FILTERS,
            'The week of the commits, starting on Sunday, in UTC.',
        ),
    ],
    metrics: [
        contributorMetric(
            'commits',
            'commits',
            'Commits',
            'Commits on the default branch.',
        ),
        contributorMetric(
            'additions',
            'additions',
            'Lines added',
            'Lines added. GitHub reports 0 for repositories with 10,000 commits or more.',
        ),
        contributorMetric(
            'deletions',
            'deletions',
            'Lines deleted',
            'Lines deleted. GitHub reports 0 for repositories with 10,000 commits or more.',
        ),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};
