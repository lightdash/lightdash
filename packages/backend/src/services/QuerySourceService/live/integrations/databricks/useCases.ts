// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const databricksUseCases: LiveUseCases = {
    questions: [
        {
            id: 'databricks-q-1',
            question: 'How many DBUs did we use last month?',
            possible: true,
        },
        {
            id: 'databricks-q-2',
            question:
                'What did Databricks cost us at list price last month, in dollars?',
            possible: true,
        },
        {
            id: 'databricks-q-3',
            question: 'Which workspaces cost the most this quarter?',
            possible: true,
        },
        {
            id: 'databricks-q-4',
            question:
                'Which products drive spend: jobs, SQL, Lakeflow pipelines, model serving or notebooks?',
            possible: true,
        },
        {
            id: 'databricks-q-5',
            question: 'How did daily DBU usage trend over the last 90 days?',
            possible: true,
        },
        {
            id: 'databricks-q-6',
            question: 'Which jobs cost the most last month?',
            possible: true,
        },
        {
            id: 'databricks-q-7',
            question: 'Which users or service principals run up the most cost?',
            possible: true,
        },
        {
            id: 'databricks-q-8',
            question: 'What do we spend per team, by our cost-center tag?',
            possible: false,
        },
        {
            id: 'databricks-q-9',
            question:
                'How much of our spend is serverless versus classic compute?',
            possible: true,
        },
        {
            id: 'databricks-q-10',
            question: 'What will we spend this month at the current rate?',
            possible: false,
        },
        {
            id: 'databricks-q-11',
            question: 'How many queries ran on each SQL warehouse yesterday?',
            possible: true,
        },
        {
            id: 'databricks-q-12',
            question:
                'What were the slowest queries this week, and who ran them?',
            possible: true,
        },
        {
            id: 'databricks-q-13',
            question:
                'What is the 95th percentile query duration per SQL warehouse?',
            possible: true,
        },
        {
            id: 'databricks-q-14',
            question: 'How long do queries wait for compute before they start?',
            possible: true,
        },
        {
            id: 'databricks-q-15',
            question: 'Which users run the most queries?',
            possible: true,
        },
        {
            id: 'databricks-q-16',
            question: 'What share of queries failed last week?',
            possible: true,
        },
        {
            id: 'databricks-q-17',
            question:
                'Which tools send the most queries: BI tools, notebooks or dbt?',
            possible: true,
        },
        {
            id: 'databricks-q-18',
            question: 'How much data did queries read per day?',
            possible: true,
        },
        {
            id: 'databricks-q-19',
            question: 'Which job runs failed yesterday?',
            possible: true,
        },
        {
            id: 'databricks-q-20',
            question:
                'What is the success rate of each job over the last 30 days?',
            possible: true,
        },
        {
            id: 'databricks-q-21',
            question: 'Which jobs run the longest?',
            possible: true,
        },
        {
            id: 'databricks-q-22',
            question:
                'Which users made the most workspace actions last week, by service?',
            possible: true,
        },
        {
            id: 'databricks-q-23',
            question:
                'How many permission-denied requests were there last week, and from whom?',
            possible: true,
        },
        {
            id: 'databricks-q-24',
            question:
                'How many tables does each catalog hold, managed versus external?',
            possible: true,
        },
        {
            id: 'databricks-q-25',
            question: 'Which tables have not changed in 90 days?',
            possible: true,
        },
        {
            id: 'databricks-q-26',
            question: 'Which SQL warehouses ran idle the longest last week?',
            possible: false,
        },
        {
            id: 'databricks-q-27',
            question: 'What is the revenue in our orders table by month?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'databricks-d-1',
            name: 'Databricks spend',
            purpose:
                'The platform or FinOps lead opens it monthly to see where DBUs and dollars go.',
            charts: [
                {
                    id: 'databricks-d-1-c-1',
                    title: 'List cost by month and product',
                    detail: 'Stacked bars of list-price cost per month, split by billing origin product.',
                    possible: true,
                },
                {
                    id: 'databricks-d-1-c-2',
                    title: 'Daily DBUs',
                    detail: 'Line of DBUs per day over the last 90 days.',
                    possible: true,
                },
                {
                    id: 'databricks-d-1-c-3',
                    title: 'Top workspaces',
                    detail: 'Table of workspaces by list cost this month.',
                    possible: true,
                },
                {
                    id: 'databricks-d-1-c-4',
                    title: 'Top identities',
                    detail: 'Users and service principals by list cost.',
                    possible: true,
                },
                {
                    id: 'databricks-d-1-c-5',
                    title: 'Serverless share',
                    detail: 'Share of list cost on serverless compute.',
                    possible: true,
                },
            ],
        },
        {
            id: 'databricks-d-2',
            name: 'SQL warehouse performance',
            purpose:
                'The analytics platform engineer checks it weekly, and when users complain dashboards are slow.',
            charts: [
                {
                    id: 'databricks-d-2-c-1',
                    title: 'Queries per day by warehouse',
                    detail: 'Bars of finished queries per day, split by warehouse.',
                    possible: true,
                },
                {
                    id: 'databricks-d-2-c-2',
                    title: 'p95 duration by warehouse',
                    detail: '95th percentile of total duration per warehouse per day.',
                    possible: true,
                },
                {
                    id: 'databricks-d-2-c-3',
                    title: 'Queue time',
                    detail: 'Average time waiting for compute and at capacity, per warehouse.',
                    possible: true,
                },
                {
                    id: 'databricks-d-2-c-4',
                    title: 'Failed queries',
                    detail: 'Failed queries per day, by client application.',
                    possible: true,
                },
                {
                    id: 'databricks-d-2-c-5',
                    title: 'Heaviest users',
                    detail: 'Users by query count and bytes read.',
                    possible: true,
                },
            ],
        },
        {
            id: 'databricks-d-3',
            name: 'Jobs reliability',
            purpose:
                'The on-call data engineer opens it each morning to see what failed overnight.',
            charts: [
                {
                    id: 'databricks-d-3-c-1',
                    title: 'Failed runs per day',
                    detail: 'Bars of runs per day by result state.',
                    possible: true,
                },
                {
                    id: 'databricks-d-3-c-2',
                    title: 'Success rate per job',
                    detail: 'Table of jobs with runs, failures and success rate over 30 days.',
                    possible: true,
                },
                {
                    id: 'databricks-d-3-c-3',
                    title: 'Longest jobs',
                    detail: 'Jobs by total run time.',
                    possible: true,
                },
                {
                    id: 'databricks-d-3-c-4',
                    title: 'Cost per job',
                    detail: 'Jobs by list cost this month.',
                    possible: true,
                },
            ],
        },
        {
            id: 'databricks-d-4',
            name: 'Governance and catalog',
            purpose:
                'The data governance lead reviews it monthly for catalog growth, stale tables and access problems.',
            charts: [
                {
                    id: 'databricks-d-4-c-1',
                    title: 'Tables per catalog',
                    detail: 'Bars of tables per catalog, split by table type.',
                    possible: true,
                },
                {
                    id: 'databricks-d-4-c-2',
                    title: 'Stale tables',
                    detail: 'Tables whose last change is more than 90 days old.',
                    possible: true,
                },
                {
                    id: 'databricks-d-4-c-3',
                    title: 'Actions per user',
                    detail: 'Audit events per user and service last week.',
                    possible: true,
                },
                {
                    id: 'databricks-d-4-c-4',
                    title: 'Permission denied',
                    detail: 'Audit events answered with 403, by user and action.',
                    possible: true,
                },
                {
                    id: 'databricks-d-4-c-5',
                    title: 'Tag cost split',
                    detail: 'List cost by a custom tag such as team.',
                    possible: false,
                },
            ],
        },
    ],
};
