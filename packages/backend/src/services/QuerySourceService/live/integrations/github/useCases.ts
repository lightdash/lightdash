// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const githubUseCases: LiveUseCases = {
    questions: [
        {
            id: 'GHB-01',
            question:
                'How many pull requests were opened, merged and closed without merging each week in each repository?',
            expect: 'answer',
            why: 'Count cannot be split by week, so each week and outcome is its own one-call count (or the PRs are read and grouped in DuckDB, up to 999 per search). Counts are exact, but 30 searches a minute allow about 8 weeks of three series per run, and each repository is a separate live data source.',
            tags: ['capped'],
        },
        {
            id: 'GHB-02',
            question:
                'How long do our pull requests spend coding, waiting for a first review, in review and waiting to merge?',
            expect: 'needs_change',
            why: "Search results carry only opened, merged and closed days. First commit, review request, first review and approval times need each pull request's commits and reviews, which the integration does not read.",
        },
        {
            id: 'GHB-03',
            question:
                'Who were our top contributors by commits to the main branch in the last 30 days?',
            expect: 'answer',
            why: "The contributors explore returns commits per author on the default branch, so author plus commits filtered to the last weeks answers it directly. It covers GitHub's top 100 authors only and works in whole weeks starting Sunday, so 30 days becomes five weeks.",
        },
        {
            id: 'GHB-04',
            question:
                'How many pull requests did each engineer review last month, and how quickly did they respond to review requests?',
            expect: 'needs_change',
            why: "Reviews are not in search results. A count of pull requests each person reviewed could come from one search per person (GitHub's reviewed-by filter, not offered on the explore), but response time to a review request needs review timestamps per pull request.",
        },
        {
            id: 'GHB-05',
            question:
                'Which open pull requests have had no activity for more than a week or are still waiting for their first review?',
            expect: 'needs_change',
            why: "Stale open pull requests list fine on the explore today (state open, updated before a date). 'Waiting for first review' needs GitHub's review filter, which search supports but the explore does not offer, so that half cannot be asked.",
        },
        {
            id: 'GHB-06',
            question:
                'How has the number of open issues changed over the last six months compared with issues completed?',
            expect: 'needs_change',
            why: 'No history is needed: open issues at a month end is issues created by then minus issues closed by then, each a one-call search total, and completed per month is another total. Six monthly points use about 24 calls; weekly points do not fit in 30 searches a minute. The field test found GitHub search undercounting older months, so older points may be too low.',
        },
        {
            id: 'GHB-07',
            question:
                'Of the people who first contributed in each quarter, how many are still contributing six months later and how many have gone inactive?',
            expect: 'answer',
            why: "One contributors node per quarter (author and commits) and a DuckDB step give first-contribution cohorts and who is still committing. GitHub's statistics cover only the top 100 authors, and occasional contributors, the ones who go inactive, are exactly those left out.",
            tags: ['capped'],
        },
        {
            id: 'GHB-08',
            question:
                'How many releases did we publish each month over the last year, split by major, minor and patch?',
            expect: 'needs_change',
            why: 'There is no releases explore yet; the name is only reserved. GitHub lists releases in bulk with tag and publish date, and the major, minor or patch split is a DuckDB step on the tag name.',
        },
        {
            id: 'GHB-09',
            question:
                'What are the failure rate, average run time and average queue time of each GitHub Actions workflow over the last 30 days?',
            expect: 'needs_change',
            why: 'No workflow data is read today. Failure rate per workflow would be cheap (GitHub returns run totals per filter), but average run time means paging every run and queue time means a jobs call per run, which for a month of CI is thousands of calls.',
        },
        {
            id: 'GHB-10',
            question:
                'Which CI jobs most often fail and then pass when re-run on the same commit?',
            expect: 'needs_change',
            why: 'Needs every run attempt and its jobs, matched on commit. Nothing of this is read today, and the API gives it only as a jobs call per run attempt.',
        },
        {
            id: 'GHB-11',
            question:
                'What is the median number of lines changed per pull request for each team, and how many pull requests exceeded 500 lines?',
            expect: 'needs_change',
            why: "Lines added and deleted per pull request are not in search results, and teams are not read at all. GitHub's GraphQL API returns both in bulk; REST needs one call per pull request.",
        },
        {
            id: 'GHB-12',
            question:
                'How often did we deploy to production each week, and how long did a change take from first commit to running in production?',
            expect: 'needs_change',
            why: 'Deployments and deploy workflow runs are not read. Deployment frequency would be a contained addition, but lead time needs the first commit of every change and which deployment shipped it, stitched per pull request and per deployment.',
        },
        {
            id: 'GHB-13',
            question:
                'What percentage of our deployments last quarter failed, and how long did it take to ship the fix each time?',
            expect: 'needs_change',
            why: 'Needs deployments with their outcome and the next successful one after each failure. None of this is read; outcomes sit on deployment statuses (one call per deployment in REST) or on deploy workflow runs.',
        },
        {
            id: 'GHB-14',
            question:
                "How long do issues stay labelled 'needs triage' or 'blocked' before the label is removed, and how often is it re-applied?",
            expect: 'needs_change',
            why: "Search shows the labels an issue has now. When a label was added, removed or re-applied is only in each issue's event timeline.",
        },
        {
            id: 'GHB-15',
            question:
                'How do issues closed and average days to close this quarter compare with last quarter, per repository?',
            expect: 'needs_change',
            why: 'Issues closed per quarter are exact one-call totals. Average days to close needs the closed issues read with their opened and closed days (999 per search) and averaged in DuckDB; whole days are fine here. Each repository is its own live data source.',
        },
        {
            id: 'GHB-16',
            question:
                'How many GitHub Actions minutes did each repository and workflow use this month, by runner type and operating system?',
            expect: 'needs_change',
            why: 'Actions minutes are billing data that the integration does not read, and it lives at organisation level, not on the one repository a live data source points at. Per-workflow minutes are a separate call per workflow.',
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
                    expect: 'needs_change',
                    why: 'Deployments and workflow runs are not read; GitHub returns run totals per workflow, outcome and date range.',
                },
                {
                    id: 'DB-39.2',
                    title: 'Lead Time for Changes',
                    detail: 'time from commit to running in production, per period',
                    expect: 'needs_change',
                    why: 'Needs the first commit of each change and the deployment that shipped it, stitched per pull request and deployment.',
                },
                {
                    id: 'DB-39.3',
                    title: 'Change Failure Rate',
                    detail: 'share of deployments that caused a failure',
                    expect: 'needs_change',
                    why: 'Which deployment caused a failure is not GitHub data unless failures are recorded as deployment statuses or labelled issues.',
                },
                {
                    id: 'DB-39.4',
                    title: 'Median Time to Restore Service (Failed Deployment Recovery Time)',
                    detail: 'time from the failed deployment to resolution of the incident it caused',
                    expect: 'needs_change',
                    why: 'Needs failed deployments and the recovery after each; incident resolution times usually live outside GitHub.',
                },
                {
                    id: 'DB-39.5',
                    title: 'Benchmark rating',
                    detail: 'each of the four metrics rated Elite, High, Medium or Low',
                    expect: 'needs_change',
                    why: 'Rates the four metrics above against fixed thresholds, so it waits on all of them.',
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
                    expect: 'answer',
                    why: 'Read merged or closed pull requests with opened and closed days and average per week in DuckDB; whole days only, up to 999 per search.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.2',
                    title: 'Pull requests in progress',
                    detail: 'number of pull requests open at once over time',
                    expect: 'answer',
                    why: 'Rebuilt from opened and closed days of pull requests open now plus those closed in the range; no history needed, up to 999 per search.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.3',
                    title: 'Cycle time distribution',
                    detail: 'share of pull requests by cycle-time bucket, showing those that take longer than expected',
                    expect: 'answer',
                    why: 'Buckets in DuckDB over the pull requests read; dates are whole days, so no sub-day buckets.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.4',
                    title: 'Cycle time scatter plot',
                    detail: 'each pull request plotted by cycle time against a rolling average',
                    expect: 'answer',
                    why: 'One row per pull request with a rolling average from a DuckDB window; at most 999 points, whole days.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-40.5',
                    title: 'Review rate',
                    detail: 'pull requests merged without review',
                    expect: 'needs_change',
                    why: "One search total with GitHub's review filter would answer it, but the explore has no review field, so it cannot be asked today.",
                },
                {
                    id: 'DB-40.6',
                    title: 'Pull requests',
                    detail: 'pull request list with review time per row, sortable by review time',
                    expect: 'needs_change',
                    why: "Review time per pull request needs each pull request's reviews, which search does not return.",
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
                    expect: 'answer',
                    why: "The contributors explore sums commits on the default branch for the weeks in range; whole weeks and GitHub's top 100 authors only.",
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.2',
                    title: 'Release count and tag count',
                    detail: 'releases and tags in the selected time range',
                    expect: 'needs_change',
                    why: 'No releases explore exists yet; GitHub lists releases with dates in bulk. Tags have no dates in the tag list.',
                },
                {
                    id: 'DB-41.3',
                    title: 'Pull requests created over time',
                    detail: 'pull requests opened per period',
                    expect: 'answer',
                    why: 'Read pull requests opened in the range and group by period in DuckDB (999 per search), or one count per period.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.4',
                    title: 'Active pull requests',
                    detail: 'currently open pull requests',
                    expect: 'needs_change',
                    why: 'Count with state open is one search total, exact at any size.',
                },
                {
                    id: 'DB-41.5',
                    title: 'Average pull request open time',
                    detail: 'average time pull requests stay open',
                    expect: 'answer',
                    why: 'Average of closed minus opened days over the pull requests read, in DuckDB; whole days, 999 per search.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.6',
                    title: 'Pull request open durations',
                    detail: 'open duration of each pull request',
                    expect: 'answer',
                    why: 'The list is there, but the duration column is a calculation, which the explore refuses, so a DuckDB node adds it; at most 999 rows.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.7',
                    title: 'Issues created over time',
                    detail: 'issues opened per period',
                    expect: 'answer',
                    why: 'Read issues opened in the range and group by period in DuckDB (999 per search), or one count per period.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.8',
                    title: 'Active issues',
                    detail: 'currently open issues',
                    expect: 'needs_change',
                    why: 'Count with state open is one search total.',
                },
                {
                    id: 'DB-41.9',
                    title: 'Average open time for closed issues',
                    detail: 'average time from open to close',
                    expect: 'answer',
                    why: 'Average of closed minus opened days over the closed issues read, in DuckDB; 999 per search.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-41.10',
                    title: 'Issues by milestone',
                    detail: 'issue count grouped by milestone',
                    expect: 'needs_change',
                    why: 'Milestone is not a field on the issues explore, though each search result carries it.',
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
                    expect: 'needs_change',
                    why: 'Workflow runs are not read; GitHub returns run totals by outcome, so success rate is two calls once the explore exists.',
                },
                {
                    id: 'DB-42.2',
                    title: 'Minutes overhead',
                    detail: 'billed minutes versus actual runtime',
                    expect: 'needs_change',
                    why: 'Billed minutes are billing data at organisation level; actual runtime means reading every run.',
                },
                {
                    id: 'DB-42.3',
                    title: 'Usage over time',
                    detail: 'runtime minutes per period across repositories',
                    expect: 'needs_change',
                    why: 'Minutes per period need billing usage or the duration of every run; neither is read.',
                },
                {
                    id: 'DB-42.4',
                    title: 'Breakdown by trigger',
                    detail: 'minutes and run counts by trigger: push, pull request, schedule and others',
                    expect: 'needs_change',
                    why: "Run counts by trigger would be totals, but minutes by trigger need every run's duration.",
                },
                {
                    id: 'DB-42.5',
                    title: 'Queue wait times',
                    detail: 'time jobs wait for a runner',
                    expect: 'needs_change',
                    why: 'Queue time is on jobs, one call per run.',
                },
                {
                    id: 'DB-42.6',
                    title: 'Minutes by workflow',
                    detail: 'minutes consumed by each workflow in the chosen repository',
                    expect: 'needs_change',
                    why: 'Minutes per workflow come from a timing call per workflow, for the current billing cycle only.',
                },
                {
                    id: 'DB-42.7',
                    title: 'Execution results',
                    detail: 'runs split into success, failure, skipped and cancelled',
                    expect: 'needs_change',
                    why: 'Runs by outcome are four run totals once a workflow runs explore exists.',
                },
                {
                    id: 'DB-42.8',
                    title: 'High-percentile job durations',
                    detail: 'slowest jobs by high-percentile duration',
                    expect: 'needs_change',
                    why: 'Job durations need the jobs of every run, one call per run.',
                },
                {
                    id: 'DB-42.9',
                    title: 'Workflow outcomes over time',
                    detail: 'run outcomes per period',
                    expect: 'needs_change',
                    why: 'Outcomes per period are run totals, one call per period and outcome, once the explore exists.',
                },
            ],
        },
    ],
};
