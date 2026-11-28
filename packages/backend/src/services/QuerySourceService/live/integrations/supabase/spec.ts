// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const supabaseUseCases: LiveUseCases = {
    questions: [
        {
            id: 'supabase-q-1',
            question:
                'Which records were created in the last 7 days, newest first?',
            possible: true,
        },
        {
            id: 'supabase-q-2',
            question:
                'How many new users signed up each day over the last 30 days?',
            possible: false,
        },
        {
            id: 'supabase-q-3',
            question:
                'Show the 50 most recent orders with their status and amount.',
            possible: true,
        },
        {
            id: 'supabase-q-4',
            question: 'What is the total order amount per month this year?',
            possible: false,
        },
        {
            id: 'supabase-q-5',
            question: 'Which customers have a status of churned or paused?',
            possible: true,
        },
        {
            id: 'supabase-q-6',
            question: 'How many rows does each table have?',
            possible: false,
        },
        {
            id: 'supabase-q-7',
            question: 'Which accounts were updated today?',
            possible: true,
        },
        {
            id: 'supabase-q-8',
            question: 'What is the average order value by plan?',
            possible: false,
        },
        {
            id: 'supabase-q-9',
            question:
                'Which users have never logged in (last sign-in is empty)?',
            possible: true,
        },
        {
            id: 'supabase-q-10',
            question: 'Show orders over 1,000 placed between two dates.',
            possible: true,
        },
        {
            id: 'supabase-q-11',
            question: 'How many open support tickets does each team have?',
            possible: false,
        },
        {
            id: 'supabase-q-12',
            question: 'Which records have a name containing a given word?',
            possible: true,
        },
        {
            id: 'supabase-q-13',
            question: 'What share of users are on each subscription plan?',
            possible: false,
        },
        {
            id: 'supabase-q-14',
            question:
                'List every row of a small lookup table, such as plans or regions.',
            possible: true,
        },
        {
            id: 'supabase-q-15',
            question: 'Which products are out of stock (quantity is 0)?',
            possible: true,
        },
        {
            id: 'supabase-q-16',
            question: 'What are the top 10 customers by lifetime spend?',
            possible: false,
        },
        {
            id: 'supabase-q-17',
            question:
                'Which events of a given type happened in the last 24 hours?',
            possible: true,
        },
        {
            id: 'supabase-q-18',
            question: 'How many distinct users were active each week?',
            possible: false,
        },
        {
            id: 'supabase-q-19',
            question:
                'Show the rows behind a number someone asked about, filtered by id.',
            possible: true,
        },
        {
            id: 'supabase-q-20',
            question:
                'How did daily revenue change compared with the previous period?',
            possible: false,
        },
        {
            id: 'supabase-q-21',
            question: 'Which subscriptions renew in the next 14 days?',
            possible: true,
        },
        {
            id: 'supabase-q-22',
            question: 'What is the median time between signup and first order?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'supabase-d-1',
            name: 'Recent activity',
            purpose:
                'Someone running the app opens it to see what changed in the last day.',
            charts: [
                {
                    id: 'supabase-d-1-c-1',
                    title: 'Latest signups',
                    detail: 'Table of users created in the last 24 hours, newest first.',
                    possible: true,
                },
                {
                    id: 'supabase-d-1-c-2',
                    title: 'Latest orders',
                    detail: 'Table of orders placed today with status and amount.',
                    possible: true,
                },
                {
                    id: 'supabase-d-1-c-3',
                    title: 'Signups per day',
                    detail: 'Bar chart of new users per day over 30 days.',
                    possible: false,
                },
            ],
        },
        {
            id: 'supabase-d-2',
            name: 'Order operations',
            purpose: 'An operations lead checks orders that need attention.',
            charts: [
                {
                    id: 'supabase-d-2-c-1',
                    title: 'Stuck orders',
                    detail: 'Orders still pending after two days.',
                    possible: true,
                },
                {
                    id: 'supabase-d-2-c-2',
                    title: 'Large orders',
                    detail: 'Orders over a threshold amount this week.',
                    possible: true,
                },
                {
                    id: 'supabase-d-2-c-3',
                    title: 'Revenue by month',
                    detail: 'Total order amount per month.',
                    possible: false,
                },
                {
                    id: 'supabase-d-2-c-4',
                    title: 'Orders by status',
                    detail: 'Count of orders in each status.',
                    possible: false,
                },
            ],
        },
        {
            id: 'supabase-d-3',
            name: 'Customer lookup',
            purpose: "Support looks up one customer's records before replying.",
            charts: [
                {
                    id: 'supabase-d-3-c-1',
                    title: 'Customer profile',
                    detail: "The customer's row, filtered by email or id.",
                    possible: true,
                },
                {
                    id: 'supabase-d-3-c-2',
                    title: 'Customer orders',
                    detail: 'Every order of the customer, newest first.',
                    possible: true,
                },
                {
                    id: 'supabase-d-3-c-3',
                    title: 'Spend to date',
                    detail: 'Total spend of the customer.',
                    possible: false,
                },
            ],
        },
    ],
};

export const supabaseSpec: LiveIntegrationSpec = {
    auth: {
        description:
            'No vendor review is needed. Reading the table list needs a secret or service_role key.',
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'none',
    },
    useCases: supabaseUseCases,
};
