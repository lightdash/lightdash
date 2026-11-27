// What testers expect to ask the Hydra test integration and the dashboards
// they build on it, and whether each is possible today. Hydra's reports total
// events and users by any of their dimensions; anything that needs rows in
// order or per-user state is not possible. Flip `possible` in the same PR as
// the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const hydraUseCases: LiveUseCases = {
    questions: [
        {
            id: 'hydra-q-1',
            question:
                'How many events happened each day over the last 30 days?',
            possible: true,
        },
        {
            id: 'hydra-q-2',
            question: 'How many events of each type did we get this month?',
            possible: true,
        },
        {
            id: 'hydra-q-3',
            question: 'How much revenue came from purchases each week?',
            possible: true,
        },
        {
            id: 'hydra-q-4',
            question: 'Which countries bring the most revenue?',
            possible: true,
        },
        {
            id: 'hydra-q-5',
            question: 'How many unique users were active in the last 7 days?',
            possible: true,
        },
        {
            id: 'hydra-q-6',
            question:
                'How does revenue split between free, pro and enterprise?',
            possible: true,
        },
        {
            id: 'hydra-q-7',
            question: 'Which 10 users sent the most events last month?',
            possible: true,
        },
        {
            id: 'hydra-q-8',
            question: 'How many sign-ups did we get each month?',
            possible: true,
        },
        {
            id: 'hydra-q-9',
            question:
                'How many events came from users outside the US, excluding page views?',
            possible: true,
        },
        {
            id: 'hydra-q-10',
            question: 'How many users are on each plan?',
            possible: true,
        },
        {
            id: 'hydra-q-11',
            question: 'How many seats does each country pay for?',
            possible: true,
        },
        {
            id: 'hydra-q-12',
            question: 'What is the revenue per user on each plan?',
            possible: true,
        },
        {
            id: 'hydra-q-13',
            question:
                'Which plans have the most users, and how many events did each plan send last week?',
            possible: true,
        },
        {
            id: 'hydra-q-14',
            question: 'What share of events were purchases each day?',
            possible: true,
        },
        {
            id: 'hydra-q-15',
            question:
                'How many events did we get between two given dates, by event type?',
            possible: true,
        },
        {
            id: 'hydra-q-16',
            question:
                'What share of users who added to cart went on to purchase within a day?',
            possible: false,
        },
        {
            id: 'hydra-q-17',
            question:
                'How many users who signed up in a given week were still active four weeks later?',
            possible: false,
        },
        {
            id: 'hydra-q-18',
            question: 'What is the median purchase value?',
            possible: false,
        },
        {
            id: 'hydra-q-19',
            question: "What was each user's first event type?",
            possible: false,
        },
        {
            id: 'hydra-q-20',
            question:
                'How many days pass between a sign-up and a first purchase?',
            possible: false,
        },
        {
            id: 'hydra-q-21',
            question: 'Which events happened in the last hour?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'hydra-d-1',
            name: 'Product activity',
            purpose:
                'A tester opens it to check that same-query tiles share one call and that a reload reads the results cache.',
            charts: [
                {
                    id: 'hydra-d-1-c-1',
                    title: 'Events per day',
                    detail: 'Line of event count by date, last 30 days.',
                    possible: true,
                },
                {
                    id: 'hydra-d-1-c-2',
                    title: 'Events per day (same query)',
                    detail: 'The same query as the first tile, to test that identical tiles share a call.',
                    possible: true,
                },
                {
                    id: 'hydra-d-1-c-3',
                    title: 'Events by type',
                    detail: 'Bar of event count by event type.',
                    possible: true,
                },
                {
                    id: 'hydra-d-1-c-4',
                    title: 'Unique users per week',
                    detail: 'Bar of unique users by date week.',
                    possible: true,
                },
            ],
        },
        {
            id: 'hydra-d-2',
            name: 'Revenue',
            purpose:
                'A tester opens it to check totals, sorting and row caps on a report with several dimensions.',
            charts: [
                {
                    id: 'hydra-d-2-c-1',
                    title: 'Revenue per week',
                    detail: 'Bar of revenue by date week.',
                    possible: true,
                },
                {
                    id: 'hydra-d-2-c-2',
                    title: 'Revenue by country and plan',
                    detail: 'Table of revenue by country and plan, largest first.',
                    possible: true,
                },
                {
                    id: 'hydra-d-2-c-3',
                    title: 'Top users by revenue',
                    detail: 'Table of revenue by user, top 20.',
                    possible: true,
                },
                {
                    id: 'hydra-d-2-c-4',
                    title: 'Purchase funnel',
                    detail: 'Conversion from add to cart to purchase per user.',
                    possible: false,
                },
            ],
        },
        {
            id: 'hydra-d-3',
            name: 'Users and plans',
            purpose:
                'A tester opens it to check joins and merges between the events and users explores.',
            charts: [
                {
                    id: 'hydra-d-3-c-1',
                    title: 'Users by plan',
                    detail: 'Bar of user count by plan.',
                    possible: true,
                },
                {
                    id: 'hydra-d-3-c-2',
                    title: 'Seats by country',
                    detail: 'Bar of seats by country.',
                    possible: true,
                },
                {
                    id: 'hydra-d-3-c-3',
                    title: 'Events and users by plan',
                    detail: 'Event count from events merged with user count from users on plan.',
                    possible: true,
                },
                {
                    id: 'hydra-d-3-c-4',
                    title: 'Weekly retention by sign-up week',
                    detail: 'Cohort grid of users active each week after signing up.',
                    possible: false,
                },
            ],
        },
    ],
};

export const hydraSpec: LiveIntegrationSpec = {
    auth: {
        description:
            'A test integration: any token signs in, and each token seeds its own rows.',
        testWith: 'test_account',
        needs: ['invite'],
        token: true,
        oauth: 'none',
    },
    useCases: hydraUseCases,
};
