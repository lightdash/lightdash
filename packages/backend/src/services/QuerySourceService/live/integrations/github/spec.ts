// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const githubSpec: LiveIntegrationSpec = {
    level: 2,
    auth: {
        testWith: 'test_account',
        needs: ['gmail', 'phone'],
        oauthReview: null,
    },
    api: {
        description:
            'GitHub REST search and GraphQL, through a GitHub App or OAuth. GraphQL has a points budget.',
        serverSideTotals:
            'Counts only. Search returns a total count for a filter; anything else is aggregated locally after paging.',
        vendorLimit:
            'Search: 30 calls a minute per token. REST: 5,000 an hour.',
        paging: '100 results a page, up to 10 pages; search stops at 1,000 results.',
        whyOurLimits:
            "Matches search's 30 a minute exactly, which leaves no room for the token's other users.",
    },
    questions: [
        {
            id: 'GHB-01',
            question:
                'How many pull requests were opened, merged and closed without merging each week in each repository?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://github.com/fivetran/dbt_github',
        },
        {
            id: 'GHB-02',
            question:
                'How long do our pull requests spend coding, waiting for a first review, in review and waiting to merge?',
            expect: 'needs_change',
            source: 'https://linearb.helpdocs.io/article/1s38stsugw-glossary-metrics',
        },
        {
            id: 'GHB-03',
            question:
                'Who were our top contributors by commits to the main branch in the last 30 days?',
            expect: 'answer',
            source: 'https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/using-pulse-to-view-a-summary-of-repository-activity',
        },
        {
            id: 'GHB-04',
            question:
                'How many pull requests did each engineer review last month, and how quickly did they respond to review requests?',
            expect: 'needs_change',
            source: 'https://graphite.com/docs/insights',
        },
        {
            id: 'GHB-05',
            question:
                'Which open pull requests have had no activity for more than a week or are still waiting for their first review?',
            expect: 'needs_change',
            source: 'https://help.swarmia.com/use-cases/improve-pull-request-flow/managing-pull-requests-in-progress-with-the-pull-request-view',
        },
        {
            id: 'GHB-06',
            question:
                'How has the number of open issues changed over the last six months compared with issues completed?',
            expect: 'needs_change',
            source: 'https://docs.github.com/en/issues/planning-and-tracking-with-projects/viewing-insights-from-your-project/about-insights-for-projects',
        },
        {
            id: 'GHB-07',
            question:
                'Of the people who first contributed in each quarter, how many are still contributing six months later and how many have gone inactive?',
            expect: 'answer',
            tags: ['capped'],
            source: 'https://chaoss.community/metric-inactive-contributors/',
        },
        {
            id: 'GHB-08',
            question:
                'How many releases did we publish each month over the last year, split by major, minor and patch?',
            expect: 'needs_change',
            source: 'https://chaoss.community/kb/metric-release-frequency/',
        },
        {
            id: 'GHB-09',
            question:
                'What are the failure rate, average run time and average queue time of each GitHub Actions workflow over the last 30 days?',
            expect: 'needs_change',
            source: 'https://docs.github.com/en/actions/concepts/metrics',
        },
        {
            id: 'GHB-10',
            question:
                'Which CI jobs most often fail and then pass when re-run on the same commit?',
            expect: 'needs_change',
            source: 'https://www.metabase.com/metrics/flaky-test-rate',
        },
        {
            id: 'GHB-11',
            question:
                'What is the median number of lines changed per pull request for each team, and how many pull requests exceeded 500 lines?',
            expect: 'needs_change',
            source: 'https://help.swarmia.com/features/metrics/code-metrics',
        },
        {
            id: 'GHB-12',
            question:
                'How often did we deploy to production each week, and how long did a change take from first commit to running in production?',
            expect: 'needs_change',
            source: 'https://devlake.apache.org/docs/DORA',
        },
        {
            id: 'GHB-13',
            question:
                'What percentage of our deployments last quarter failed, and how long did it take to ship the fix each time?',
            expect: 'needs_change',
            source: 'https://help.swarmia.com/definitions/dora-metrics.md',
        },
        {
            id: 'GHB-14',
            question:
                "How long do issues stay labelled 'needs triage' or 'blocked' before the label is removed, and how often is it re-applied?",
            expect: 'needs_change',
            source: 'https://github.com/fivetran/dbt_github',
        },
        {
            id: 'GHB-15',
            question:
                'How do issues closed and average days to close this quarter compare with last quarter, per repository?',
            expect: 'needs_change',
            source: 'https://fivetran.com/docs/transformations/data-models/github-data-model',
        },
        {
            id: 'GHB-16',
            question:
                'How many GitHub Actions minutes did each repository and workflow use this month, by runner type and operating system?',
            expect: 'needs_change',
            source: 'https://docs.github.com/en/actions/concepts/metrics',
        },
    ],
    dashboards: [
        {
            id: 'DB-39',
            name: 'DORA metrics',
            source: 'https://devlake.apache.org/docs/DORA',
            charts: [
                {
                    id: 'DB-39.1',
                    title: 'Deployment Frequency',
                    detail: 'successful production deployments per period, from GitHub deployments or deploy workflow runs',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-39.2',
                    title: 'Lead Time for Changes',
                    detail: 'time from commit to running in production, per period',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-39.3',
                    title: 'Change Failure Rate',
                    detail: 'share of deployments that caused a failure',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-39.4',
                    title: 'Median Time to Restore Service (Failed Deployment Recovery Time)',
                    detail: 'time from the failed deployment to resolution of the incident it caused',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-39.5',
                    title: 'Benchmark rating',
                    detail: 'each of the four metrics rated Elite, High, Medium or Low',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-40',
            name: 'Pull request flow',
            source: 'https://help.swarmia.com/guides/improve-pull-request-flow/pull-request-insights',
            charts: [
                {
                    id: 'DB-40.1',
                    title: 'Cycle time average',
                    detail: 'average time to close pull requests over time',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.2',
                    title: 'Pull requests in progress',
                    detail: 'number of pull requests open at once over time',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.3',
                    title: 'Cycle time distribution',
                    detail: 'share of pull requests by cycle-time bucket, showing those that take longer than expected',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.4',
                    title: 'Cycle time scatter plot',
                    detail: 'each pull request plotted by cycle time against a rolling average',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.5',
                    title: 'Review rate',
                    detail: 'pull requests merged without review',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-40.6',
                    title: 'Pull requests',
                    detail: 'pull request list with review time per row, sortable by review time',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-41',
            name: 'Repository activity overview',
            source: 'https://grafana.com/docs/plugins/grafana-github-datasource/latest/',
            charts: [
                {
                    id: 'DB-41.1',
                    title: 'Commit count',
                    detail: 'commits in the selected time range',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.2',
                    title: 'Release count and tag count',
                    detail: 'releases and tags in the selected time range',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-41.3',
                    title: 'Pull requests created over time',
                    detail: 'pull requests opened per period',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.4',
                    title: 'Active pull requests',
                    detail: 'currently open pull requests',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-41.5',
                    title: 'Average pull request open time',
                    detail: 'average time pull requests stay open',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.6',
                    title: 'Pull request open durations',
                    detail: 'open duration of each pull request',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.7',
                    title: 'Issues created over time',
                    detail: 'issues opened per period',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.8',
                    title: 'Active issues',
                    detail: 'currently open issues',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-41.9',
                    title: 'Average open time for closed issues',
                    detail: 'average time from open to close',
                    expect: 'answer',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.10',
                    title: 'Issues by milestone',
                    detail: 'issue count grouped by milestone',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-42',
            name: 'CI health (GitHub Actions)',
            source: 'https://grafana.com/grafana/dashboards/24157-github-actions-insights/',
            charts: [
                {
                    id: 'DB-42.1',
                    title: 'Repository success rate',
                    detail: 'share of workflow runs that succeeded, per repository',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.2',
                    title: 'Minutes overhead',
                    detail: 'billed minutes versus actual runtime',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.3',
                    title: 'Usage over time',
                    detail: 'runtime minutes per period across repositories',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.4',
                    title: 'Breakdown by trigger',
                    detail: 'minutes and run counts by trigger: push, pull request, schedule and others',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.5',
                    title: 'Queue wait times',
                    detail: 'time jobs wait for a runner',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.6',
                    title: 'Minutes by workflow',
                    detail: 'minutes consumed by each workflow in the chosen repository',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.7',
                    title: 'Execution results',
                    detail: 'runs split into success, failure, skipped and cancelled',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.8',
                    title: 'High-percentile job durations',
                    detail: 'slowest jobs by high-percentile duration',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-42.9',
                    title: 'Workflow outcomes over time',
                    detail: 'run outcomes per period',
                    expect: 'needs_change',
                },
            ],
        },
    ],
};
