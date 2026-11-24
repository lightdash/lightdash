// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const postHogUseCases: LiveUseCases = {
    questions: [
        {
            id: 'PHG-01',
            question:
                'How many daily and monthly active users do we have, and how is the ratio between the two trending?',
            possible: true,
        },
        {
            id: 'PHG-02',
            question:
                'How many unique users used the export feature between 3 March and 19 April, counting each person once?',
            possible: true,
        },
        {
            id: 'PHG-03',
            question:
                'What share of users who signed up went on to finish onboarding and create their first project within 14 days, and which step loses the most people?',
            possible: true,
        },
        {
            id: 'PHG-04',
            question:
                'Of the users who signed up each week, what percentage came back and did the key action in each of the following eight weeks?',
            possible: true,
        },
        {
            id: 'PHG-05',
            question:
                'What do users do right after signing up, and where do they get stuck before they reach the new feature?',
            possible: true,
        },
        {
            id: 'PHG-06',
            question:
                'On how many days per month do users use the dashboard feature, and how many use it on five or more days?',
            possible: true,
        },
        {
            id: 'PHG-07',
            question:
                'How many new, returning, resurrected and dormant users did we have each week?',
            possible: true,
        },
        {
            id: 'PHG-08',
            question:
                'Which companies were most active this month, and how many active users does each one have?',
            possible: false,
        },
        {
            id: 'PHG-09',
            question:
                'Which companies that were active last month have had no activity at all in the past 14 days?',
            possible: false,
        },
        {
            id: 'PHG-10',
            question:
                'How is one named customer using the product: how many of its people are active, which features they use and when they were last seen?',
            possible: false,
        },
        {
            id: 'PHG-11',
            question:
                'Did the new checkout variant beat the control on conversion, by how much, and is the result statistically significant?',
            possible: false,
        },
        {
            id: 'PHG-12',
            question:
                'Which channels and UTM campaigns bring the most visitors, and which of them convert to sign-up best?',
            possible: true,
        },
        {
            id: 'PHG-13',
            question:
                "Does crediting sign-ups to a user's first-touch source instead of their last-touch source change which channel looks best?",
            possible: true,
        },
        {
            id: 'PHG-14',
            question:
                'Which entry pages have the highest bounce rate and the lowest conversion to sign-up?',
            possible: false,
        },
        {
            id: 'PHG-15',
            question:
                'What is the average session length and number of events per session, by device type?',
            possible: false,
        },
        {
            id: 'PHG-16',
            question:
                'Which sessions in the last week had a rage click or an error from users on the Enterprise plan?',
            possible: true,
        },
        {
            id: 'PHG-17',
            question:
                'How did monthly recurring revenue move each month, split into new, expansion, contraction and churned revenue?',
            possible: false,
        },
        {
            id: 'PHG-18',
            question:
                'How do visitors, page views, sessions, bounce rate and session duration this week compare with last week?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'DB-31',
            name: 'Product analytics',
            purpose:
                'Default overview of how people use the app: active users, retention, where they come from and a first funnel.',
            charts: [
                {
                    id: 'DB-31.1',
                    title: 'Active users (last 30 days)',
                    detail: 'unique users with a pageview or screen in 30 days',
                    possible: true,
                },
                {
                    id: 'DB-31.2',
                    title: 'Sessions (last 7 days)',
                    detail: 'unique sessions, compared with the previous 7 days',
                    possible: true,
                },
                {
                    id: 'DB-31.3',
                    title: 'Pageviews (last 7 days)',
                    detail: 'total pageviews, compared with the previous 7 days',
                    possible: true,
                },
                {
                    id: 'DB-31.4',
                    title: 'Daily active users (DAUs)',
                    detail: 'unique users per day, last 30 days',
                    possible: true,
                },
                {
                    id: 'DB-31.5',
                    title: 'Weekly active users (WAUs)',
                    detail: 'unique users per week, last 90 days',
                    possible: true,
                },
                {
                    id: 'DB-31.6',
                    title: 'Retention',
                    detail: 'weekly retention based on pageviews',
                    possible: true,
                },
                {
                    id: 'DB-31.7',
                    title: 'Growth accounting',
                    detail: 'new, returning, resurrecting and dormant users per week',
                    possible: true,
                },
                {
                    id: 'DB-31.8',
                    title: 'Top referrers',
                    detail: 'unique users by referring domain, last 7 to 14 days',
                    possible: true,
                },
                {
                    id: 'DB-31.9',
                    title: 'Users by country',
                    detail: 'unique users by country, last 7 days',
                    possible: true,
                },
                {
                    id: 'DB-31.10',
                    title: 'Visit to interaction funnel',
                    detail: 'pageview to first interaction, last 7 days; older version: three pageviews by browser',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-32',
            name: 'Web analytics',
            purpose:
                'Day-to-day view of website traffic: visitors, top and entry pages, channels, campaigns and conversions against a goal.',
            charts: [
                {
                    id: 'DB-32.1',
                    title: 'Overview',
                    detail: 'visitors, views, sessions, average session duration, bounce rate; conversions and conversion rate when a goal is set; each vs previous period',
                    possible: false,
                },
                {
                    id: 'DB-32.2',
                    title: 'Top paths',
                    detail: 'per path: views, visitors, bounce rate, scroll depth',
                    possible: false,
                },
                {
                    id: 'DB-32.3',
                    title: 'Entry and end paths',
                    detail: 'first and last pageview of each session; outbound clicks',
                    possible: false,
                },
                {
                    id: 'DB-32.4',
                    title: 'Channels and referrers',
                    detail: 'channel types and top referrers',
                    possible: false,
                },
                {
                    id: 'DB-32.5',
                    title: 'UTMs',
                    detail: 'source, medium, campaign, content, term',
                    possible: true,
                },
                {
                    id: 'DB-32.6',
                    title: 'Geography',
                    detail: 'world map with countries, regions, cities, timezones, languages',
                    possible: true,
                },
                {
                    id: 'DB-32.7',
                    title: 'Retention',
                    detail: 'users who first did any event in the last week',
                    possible: true,
                },
                {
                    id: 'DB-32.8',
                    title: 'Active hours',
                    detail: 'unique users or pageviews by hour and day of week',
                    possible: true,
                },
                {
                    id: 'DB-32.9',
                    title: 'Goals',
                    detail: 'pinned or recent actions and their conversion counts',
                    possible: true,
                },
                {
                    id: 'DB-32.10',
                    title: 'LCP score',
                    detail: '75th percentile of first-pageview LCP per session',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-33',
            name: 'Company (group) overview',
            purpose:
                'Per-account page showing how one customer company uses the product, for account reviews and renewals.',
            charts: [
                {
                    id: 'DB-33.1',
                    title: 'Top paths',
                    detail: 'unique sessions by page path for the selected company',
                    possible: false,
                },
                {
                    id: 'DB-33.2',
                    title: 'Top events',
                    detail: 'event totals by event name',
                    possible: false,
                },
                {
                    id: 'DB-33.3',
                    title: 'Weekly active users',
                    detail: 'unique users per week within the company',
                    possible: false,
                },
                {
                    id: 'DB-33.4',
                    title: 'Monthly active users',
                    detail: 'unique users per month within the company',
                    possible: false,
                },
                {
                    id: 'DB-33.5',
                    title: 'Retained users',
                    detail: "retention of the company's users based on pageviews",
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-34',
            name: 'User research',
            purpose:
                'Shows who the users are, how they reach and move through the product and where they get frustrated, to pick people for interviews.',
            charts: [
                {
                    id: 'DB-34.1',
                    title: 'How do most users access my product?',
                    detail: 'seven most common paths from the first pageview, last 30 days',
                    possible: true,
                },
                {
                    id: 'DB-34.2',
                    title: 'Which users are highly engaged?',
                    detail: 'lifecycle of identified users with a pageview in the last 30 days',
                    possible: true,
                },
                {
                    id: 'DB-34.3',
                    title: 'Where are my users experiencing frustration?',
                    detail: 'rage clicks by page',
                    possible: true,
                },
                {
                    id: 'DB-34.4',
                    title: 'How do users find my product?',
                    detail: 'unique users by referring domain',
                    possible: true,
                },
                {
                    id: 'DB-34.5',
                    title: 'What devices do users access my product with?',
                    detail: 'unique users by device type',
                    possible: true,
                },
                {
                    id: 'DB-34.6',
                    title: 'What browsers do users prefer?',
                    detail: 'unique users by browser',
                    possible: true,
                },
                {
                    id: 'DB-34.7',
                    title: 'What screen size do users have?',
                    detail: 'unique users by screen height',
                    possible: true,
                },
                {
                    id: 'DB-34.8',
                    title: 'What languages do users prefer?',
                    detail: 'unique users by browser language',
                    possible: true,
                },
                {
                    id: 'DB-34.9',
                    title: 'Where are my users located?',
                    detail: 'pageviews by country',
                    possible: true,
                },
            ],
        },
    ],
};
