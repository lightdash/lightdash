// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveUseCases } from '../../sdk';

export const githubUseCases: LiveUseCases = {
    questions: [
        {
            id: 'GHB-01',
            question:
                'How many pull requests were opened, merged and closed without merging each week in each repository?',
            possible: true,
        },
        {
            id: 'GHB-02',
            question:
                'How long do our pull requests spend coding, waiting for a first review, in review and waiting to merge?',
            possible: false,
        },
        {
            id: 'GHB-03',
            question:
                'Who were our top contributors by commits to the main branch in the last 30 days?',
            possible: true,
        },
        {
            id: 'GHB-04',
            question:
                'How many pull requests did each engineer review last month, and how quickly did they respond to review requests?',
            possible: false,
        },
        {
            id: 'GHB-05',
            question:
                'Which open pull requests have had no activity for more than a week or are still waiting for their first review?',
            possible: false,
        },
        {
            id: 'GHB-06',
            question:
                'How has the number of open issues changed over the last six months compared with issues completed?',
            possible: false,
        },
        {
            id: 'GHB-07',
            question:
                'Of the people who first contributed in each quarter, how many are still contributing six months later and how many have gone inactive?',
            possible: true,
        },
        {
            id: 'GHB-08',
            question:
                'How many releases did we publish each month over the last year, split by major, minor and patch?',
            possible: false,
        },
        {
            id: 'GHB-09',
            question:
                'What are the failure rate, average run time and average queue time of each GitHub Actions workflow over the last 30 days?',
            possible: false,
        },
        {
            id: 'GHB-10',
            question:
                'Which CI jobs most often fail and then pass when re-run on the same commit?',
            possible: false,
        },
        {
            id: 'GHB-11',
            question:
                'What is the median number of lines changed per pull request for each team, and how many pull requests exceeded 500 lines?',
            possible: false,
        },
        {
            id: 'GHB-12',
            question:
                'How often did we deploy to production each week, and how long did a change take from first commit to running in production?',
            possible: false,
        },
        {
            id: 'GHB-13',
            question:
                'What percentage of our deployments last quarter failed, and how long did it take to ship the fix each time?',
            possible: false,
        },
        {
            id: 'GHB-14',
            question:
                "How long do issues stay labelled 'needs triage' or 'blocked' before the label is removed, and how often is it re-applied?",
            possible: false,
        },
        {
            id: 'GHB-15',
            question:
                'How do issues closed and average days to close this quarter compare with last quarter, per repository?',
            possible: false,
        },
        {
            id: 'GHB-16',
            question:
                'How many GitHub Actions minutes did each repository and workflow use this month, by runner type and operating system?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'DB-39',
            name: 'DORA metrics',
            purpose:
                'Monthly or quarterly engineering review: how fast and how safely the team ships to production.',
            charts: [
                {
                    id: 'DB-39.1',
                    title: 'Deployment Frequency',
                    detail: 'successful production deployments per period, from GitHub deployments or deploy workflow runs',
                    possible: false,
                },
                {
                    id: 'DB-39.2',
                    title: 'Lead Time for Changes',
                    detail: 'time from commit to running in production, per period',
                    possible: false,
                },
                {
                    id: 'DB-39.3',
                    title: 'Change Failure Rate',
                    detail: 'share of deployments that caused a failure',
                    possible: false,
                },
                {
                    id: 'DB-39.4',
                    title: 'Median Time to Restore Service (Failed Deployment Recovery Time)',
                    detail: 'time from the failed deployment to resolution of the incident it caused',
                    possible: false,
                },
                {
                    id: 'DB-39.5',
                    title: 'Benchmark rating',
                    detail: 'each of the four metrics rated Elite, High, Medium or Low',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-40',
            name: 'Pull request flow',
            purpose:
                'Team retro and daily review: where pull requests get stuck and which ones need attention.',
            charts: [
                {
                    id: 'DB-40.1',
                    title: 'Cycle time average',
                    detail: 'average time to close pull requests over time',
                    possible: true,
                },
                {
                    id: 'DB-40.2',
                    title: 'Pull requests in progress',
                    detail: 'number of pull requests open at once over time',
                    possible: true,
                },
                {
                    id: 'DB-40.3',
                    title: 'Cycle time distribution',
                    detail: 'share of pull requests by cycle-time bucket, showing those that take longer than expected',
                    possible: true,
                },
                {
                    id: 'DB-40.4',
                    title: 'Cycle time scatter plot',
                    detail: 'each pull request plotted by cycle time against a rolling average',
                    possible: true,
                },
                {
                    id: 'DB-40.5',
                    title: 'Review rate',
                    detail: 'pull requests merged without review',
                    possible: false,
                },
                {
                    id: 'DB-40.6',
                    title: 'Pull requests',
                    detail: 'pull request list with review time per row, sortable by review time',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-41',
            name: 'Repository activity overview',
            purpose:
                'At-a-glance health of a repository: commits, releases, open pull requests and open issues.',
            charts: [
                {
                    id: 'DB-41.1',
                    title: 'Commit count',
                    detail: 'commits in the selected time range',
                    possible: true,
                },
                {
                    id: 'DB-41.2',
                    title: 'Release count and tag count',
                    detail: 'releases and tags in the selected time range',
                    possible: false,
                },
                {
                    id: 'DB-41.3',
                    title: 'Pull requests created over time',
                    detail: 'pull requests opened per period',
                    possible: true,
                },
                {
                    id: 'DB-41.4',
                    title: 'Active pull requests',
                    detail: 'currently open pull requests',
                    possible: false,
                },
                {
                    id: 'DB-41.5',
                    title: 'Average pull request open time',
                    detail: 'average time pull requests stay open',
                    possible: true,
                },
                {
                    id: 'DB-41.6',
                    title: 'Pull request open durations',
                    detail: 'open duration of each pull request',
                    possible: true,
                },
                {
                    id: 'DB-41.7',
                    title: 'Issues created over time',
                    detail: 'issues opened per period',
                    possible: true,
                },
                {
                    id: 'DB-41.8',
                    title: 'Active issues',
                    detail: 'currently open issues',
                    possible: false,
                },
                {
                    id: 'DB-41.9',
                    title: 'Average open time for closed issues',
                    detail: 'average time from open to close',
                    possible: true,
                },
                {
                    id: 'DB-41.10',
                    title: 'Issues by milestone',
                    detail: 'issue count grouped by milestone',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-42',
            name: 'CI health (GitHub Actions)',
            purpose:
                'Keep CI reliable and affordable: spot failing workflows, slow jobs, queue delays and wasted minutes.',
            charts: [
                {
                    id: 'DB-42.1',
                    title: 'Repository success rate',
                    detail: 'share of workflow runs that succeeded, per repository',
                    possible: false,
                },
                {
                    id: 'DB-42.2',
                    title: 'Minutes overhead',
                    detail: 'billed minutes versus actual runtime',
                    possible: false,
                },
                {
                    id: 'DB-42.3',
                    title: 'Usage over time',
                    detail: 'runtime minutes per period across repositories',
                    possible: false,
                },
                {
                    id: 'DB-42.4',
                    title: 'Breakdown by trigger',
                    detail: 'minutes and run counts by trigger: push, pull request, schedule and others',
                    possible: false,
                },
                {
                    id: 'DB-42.5',
                    title: 'Queue wait times',
                    detail: 'time jobs wait for a runner',
                    possible: false,
                },
                {
                    id: 'DB-42.6',
                    title: 'Minutes by workflow',
                    detail: 'minutes consumed by each workflow in the chosen repository',
                    possible: false,
                },
                {
                    id: 'DB-42.7',
                    title: 'Execution results',
                    detail: 'runs split into success, failure, skipped and cancelled',
                    possible: false,
                },
                {
                    id: 'DB-42.8',
                    title: 'High-percentile job durations',
                    detail: 'slowest jobs by high-percentile duration',
                    possible: false,
                },
                {
                    id: 'DB-42.9',
                    title: 'Workflow outcomes over time',
                    detail: 'run outcomes per period',
                    possible: false,
                },
            ],
        },
    ],
};
