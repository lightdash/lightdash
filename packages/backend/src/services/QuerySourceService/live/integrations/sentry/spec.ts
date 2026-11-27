// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const sentryUseCases: LiveUseCases = {
    questions: [
        {
            id: 'SNT-01',
            question:
                'How many issues and error events did each release of our mobile app have in the last 30 days?',
            possible: true,
        },
        {
            id: 'SNT-02',
            question:
                'What is the crash-free session rate and crash-free user rate of each release?',
            possible: true,
        },
        {
            id: 'SNT-03',
            question:
                'How has the number of error events changed day by day over the last two weeks, by project and level?',
            possible: true,
        },
        {
            id: 'SNT-04',
            question:
                'Which unresolved issues affected the most users this month, and when was each first seen?',
            possible: true,
        },
        {
            id: 'SNT-05',
            question: 'Which new issues were first seen in the latest release?',
            possible: true,
        },
        {
            id: 'SNT-06',
            question:
                'How many sessions and users did each release have each day, and how fast is the newest release being adopted?',
            possible: true,
        },
        {
            id: 'SNT-07',
            question:
                'Which operating systems and device families have the most crashes?',
            possible: true,
        },
        {
            id: 'SNT-08',
            question:
                'How long does it take us to resolve an issue after it is first seen, by project?',
            possible: false,
        },
        {
            id: 'SNT-09',
            question:
                'What are the p75 and p95 durations of our slowest transactions, and how have they changed this week?',
            possible: false,
        },
        {
            id: 'SNT-10',
            question:
                'Which alerts fired most often last month, and how long did each incident stay open?',
            possible: false,
        },
        {
            id: 'SNT-11',
            question:
                'Who is each open issue assigned to, and how many issues does each team own?',
            possible: false,
        },
        {
            id: 'SNT-12',
            question:
                'Which user accounts hit the most errors this week, so that support can contact them?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'DB-58',
            name: 'Mobile release health',
            purpose:
                'Release review: whether the newest app release is safe to roll out further.',
            charts: [
                {
                    id: 'DB-58.1',
                    title: 'Crash-free sessions by release',
                    detail: 'crash-free session rate of each release over the period',
                    possible: true,
                },
                {
                    id: 'DB-58.2',
                    title: 'Crash-free users by release',
                    detail: 'crash-free user rate of each release over the period',
                    possible: true,
                },
                {
                    id: 'DB-58.3',
                    title: 'Sessions by release over time',
                    detail: 'daily sessions per release, showing adoption of the newest one',
                    possible: true,
                },
                {
                    id: 'DB-58.4',
                    title: 'Issues by release',
                    detail: 'distinct issues and error events per release',
                    possible: true,
                },
                {
                    id: 'DB-58.5',
                    title: 'Release adoption',
                    detail: 'share of all sessions and users on each release',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-59',
            name: 'Error monitoring',
            purpose:
                'Weekly engineering review: where errors come from and which issues to fix first.',
            charts: [
                {
                    id: 'DB-59.1',
                    title: 'Error events over time',
                    detail: 'daily error events by project or level',
                    possible: true,
                },
                {
                    id: 'DB-59.2',
                    title: 'Top issues by users affected',
                    detail: 'unresolved issues ranked by users, with events and first seen',
                    possible: true,
                },
                {
                    id: 'DB-59.3',
                    title: 'New issues',
                    detail: 'issues first seen in the period, by project',
                    possible: true,
                },
                {
                    id: 'DB-59.4',
                    title: 'Errors by operating system and device',
                    detail: 'error events and users affected per operating system and device family',
                    possible: true,
                },
                {
                    id: 'DB-59.5',
                    title: 'Time to resolve',
                    detail: 'time from first seen to resolved, per project',
                    possible: false,
                },
            ],
        },
    ],
};

export const sentrySpec: LiveIntegrationSpec = {
    auth: {
        description:
            'A token from an internal integration needs no vendor review. OAuth needs a public integration, and Sentry must publish it before another organization can install it.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'needs_review',
    },
    useCases: sentryUseCases,
};
