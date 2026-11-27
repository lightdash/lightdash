// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveUseCases } from '../../sdk';

export const mixpanelUseCases: LiveUseCases = {
    questions: [
        {
            id: 'mixpanel-q-1',
            question:
                'How many sign-up events did we get each day over the last 30 days?',
            possible: true,
        },
        {
            id: 'mixpanel-q-2',
            question:
                'How many unique users used the export feature each month this year?',
            possible: true,
        },
        {
            id: 'mixpanel-q-3',
            question:
                'Which countries sent the most purchase events last month?',
            possible: true,
        },
        {
            id: 'mixpanel-q-4',
            question:
                'What was total revenue from purchase events each month this year?',
            possible: false,
        },
        {
            id: 'mixpanel-q-5',
            question:
                'What is the average order value per day over the last two weeks?',
            possible: false,
        },
        {
            id: 'mixpanel-q-6',
            question:
                'Which browsers do users who viewed the pricing page use?',
            possible: true,
        },
        {
            id: 'mixpanel-q-7',
            question:
                'What share of users who signed up in each week came back in weeks 1 to 8?',
            possible: true,
        },
        {
            id: 'mixpanel-q-8',
            question:
                'Of users who created a project, how many did it again the following month?',
            possible: true,
        },
        {
            id: 'mixpanel-q-9',
            question: 'Which events are fired most often today?',
            possible: true,
        },
        {
            id: 'mixpanel-q-10',
            question: 'How many user profiles do we have in each plan?',
            possible: false,
        },
        {
            id: 'mixpanel-q-11',
            question:
                'Which users last seen more than 30 days ago are on a paid plan?',
            possible: false,
        },
        {
            id: 'mixpanel-q-12',
            question:
                'How many daily active users did we have each day, counting any event?',
            possible: false,
        },
        {
            id: 'mixpanel-q-13',
            question:
                'How many purchase events did we get by country and by device at the same time?',
            possible: false,
        },
        {
            id: 'mixpanel-q-14',
            question:
                'What is our saved sign-up to activation funnel conversion this month, step by step?',
            possible: true,
        },
        {
            id: 'mixpanel-q-15',
            question:
                'Where do users drop off between viewing pricing, starting checkout and paying?',
            possible: true,
        },
        {
            id: 'mixpanel-q-16',
            question:
                'How long, on average, is a session, and how many events happen per session?',
            possible: false,
        },
        {
            id: 'mixpanel-q-17',
            question: 'What paths do users take after their first login?',
            possible: false,
        },
        {
            id: 'mixpanel-q-18',
            question:
                'How many users did each of event A and event B, and how many did both?',
            possible: false,
        },
        {
            id: 'mixpanel-q-19',
            question:
                'Which cohort of users, defined ad hoc by behaviour, retained best?',
            possible: false,
        },
        {
            id: 'mixpanel-q-20',
            question:
                'What is the median time between sign-up and first purchase?',
            possible: false,
        },
        {
            id: 'mixpanel-q-21',
            question:
                "What does our saved 'Weekly KPIs' Insights report show for the last 8 weeks?",
            possible: false,
        },
        {
            id: 'mixpanel-q-22',
            question:
                'How many events per user does each plan generate per week?',
            possible: false,
        },
        {
            id: 'mixpanel-q-23',
            question:
                'How many sign-ups came from each UTM source in the last 30 days?',
            possible: true,
        },
        {
            id: 'mixpanel-q-24',
            question:
                'How many times did each user trigger "Create Report" on average each day?',
            possible: true,
        },
        {
            id: 'mixpanel-q-25',
            question:
                'How does checkout funnel conversion this month compare with last month?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'mixpanel-d-1',
            name: 'Product usage',
            purpose:
                'The product team checks weekly how core features are used.',
            charts: [
                {
                    id: 'mixpanel-d-1-c-1',
                    title: 'Daily active users',
                    detail: 'Unique users per day, any event, last 90 days.',
                    possible: false,
                },
                {
                    id: 'mixpanel-d-1-c-2',
                    title: 'Feature events by day',
                    detail: 'Counts of up to three key feature events per day.',
                    possible: true,
                },
                {
                    id: 'mixpanel-d-1-c-3',
                    title: 'Usage by platform',
                    detail: 'Unique users per key event, split by OS.',
                    possible: true,
                },
                {
                    id: 'mixpanel-d-1-c-4',
                    title: 'Events per session',
                    detail: 'Average events in a session per week.',
                    possible: false,
                },
            ],
        },
        {
            id: 'mixpanel-d-2',
            name: 'Activation and retention',
            purpose: 'The growth team watches whether new sign-ups stick.',
            charts: [
                {
                    id: 'mixpanel-d-2-c-1',
                    title: 'Weekly retention cohorts',
                    detail: 'Users born on sign-up, returning on any event, weeks 1 to 8.',
                    possible: true,
                },
                {
                    id: 'mixpanel-d-2-c-2',
                    title: 'Activation funnel',
                    detail: 'A saved sign-up to first project to invite funnel, conversion per step.',
                    possible: true,
                },
                {
                    id: 'mixpanel-d-2-c-3',
                    title: 'Time to activate',
                    detail: 'Median days from sign-up to first project.',
                    possible: false,
                },
            ],
        },
        {
            id: 'mixpanel-d-3',
            name: 'Revenue',
            purpose: 'Finance and growth review purchase trends monthly.',
            charts: [
                {
                    id: 'mixpanel-d-3-c-1',
                    title: 'Revenue by month',
                    detail: 'Sum of purchase amount per month.',
                    possible: false,
                },
                {
                    id: 'mixpanel-d-3-c-2',
                    title: 'Purchases by month',
                    detail: 'Purchase events and unique buyers per month.',
                    possible: true,
                },
                {
                    id: 'mixpanel-d-3-c-3',
                    title: 'Purchases by country',
                    detail: 'Purchase events by country, last 30 days.',
                    possible: true,
                },
                {
                    id: 'mixpanel-d-3-c-4',
                    title: 'Checkout funnel',
                    detail: 'A saved pricing view to checkout to purchase funnel.',
                    possible: true,
                },
            ],
        },
    ],
};
