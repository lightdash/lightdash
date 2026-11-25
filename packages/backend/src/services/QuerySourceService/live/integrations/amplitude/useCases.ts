// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const amplitudeUseCases: LiveUseCases = {
    questions: [
        {
            id: 'amplitude-q-1',
            question:
                'How many daily, weekly and monthly active users did we have over the last 90 days?',
            possible: true,
        },
        {
            id: 'amplitude-q-2',
            question: 'How many new users did we get each week this quarter?',
            possible: true,
        },
        {
            id: 'amplitude-q-3',
            question:
                'How many times was "Export Report" triggered each day last month, and by how many unique users?',
            possible: true,
        },
        {
            id: 'amplitude-q-4',
            question: 'Which countries had the most active users last month?',
            possible: true,
        },
        {
            id: 'amplitude-q-5',
            question:
                'How many unique users did "Purchase" by platform (iOS, Android, Web) in the last 30 days?',
            possible: true,
        },
        {
            id: 'amplitude-q-6',
            question:
                'Compare weekly unique users of "Create Dashboard" and "Share Dashboard" over the last 12 weeks.',
            possible: true,
        },
        {
            id: 'amplitude-q-7',
            question:
                'How many "Sign Up" events came from users on the free plan versus paid plans last week?',
            possible: false,
        },
        {
            id: 'amplitude-q-8',
            question:
                'What share of users who did "Sign Up" went on to "Complete Onboarding" and then "Create Project", and which step loses the most people?',
            possible: true,
        },
        {
            id: 'amplitude-q-9',
            question:
                'How does the sign-up to purchase funnel convert by country this month?',
            possible: false,
        },
        {
            id: 'amplitude-q-10',
            question:
                'How long does it take on average to go from "Sign Up" to "Purchase"?',
            possible: true,
        },
        {
            id: 'amplitude-q-11',
            question:
                'Of the users who signed up each week, what share came back in each of the next eight weeks?',
            possible: true,
        },
        {
            id: 'amplitude-q-12',
            question:
                'What is our day 1, day 7 and day 30 retention for new users over the last quarter?',
            possible: true,
        },
        {
            id: 'amplitude-q-13',
            question:
                'Of users who did "Create Dashboard", how many came back to "View Dashboard" within the next four weeks?',
            possible: true,
        },
        {
            id: 'amplitude-q-14',
            question: 'What is the average session length each day this month?',
            possible: true,
        },
        {
            id: 'amplitude-q-15',
            question:
                'How many sessions does an active user have per day on average?',
            possible: true,
        },
        {
            id: 'amplitude-q-16',
            question:
                'What is the ratio of daily to monthly active users (stickiness) this quarter?',
            possible: true,
        },
        {
            id: 'amplitude-q-17',
            question:
                'How many new, returning, resurrected and dormant users did we have each week?',
            possible: false,
        },
        {
            id: 'amplitude-q-18',
            question:
                'On how many days per week do users use the dashboard feature?',
            possible: false,
        },
        {
            id: 'amplitude-q-19',
            question:
                'What do users do right after signing up, and which paths lead to a purchase?',
            possible: false,
        },
        {
            id: 'amplitude-q-20',
            question:
                'What is the lifetime value of users who signed up each month?',
            possible: false,
        },
        {
            id: 'amplitude-q-21',
            question:
                'How much revenue did "Purchase" events bring in each day?',
            possible: false,
        },
        {
            id: 'amplitude-q-22',
            question: 'Which accounts (companies) were most active this month?',
            possible: false,
        },
        {
            id: 'amplitude-q-23',
            question:
                'How many users are in our "Power users" cohort, and how many of them were active this week?',
            possible: false,
        },
        {
            id: 'amplitude-q-24',
            question: 'Which events did a given user do in the last week?',
            possible: false,
        },
        {
            id: 'amplitude-q-25',
            question:
                'What are the results of the "Weekly KPIs" chart we already saved in Amplitude?',
            possible: false,
        },
        {
            id: 'amplitude-q-26',
            question:
                'How many users from each app version were active last week, so we know when to drop old versions?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'amplitude-d-1',
            name: 'Product KPIs',
            purpose:
                'Leadership opens it weekly to see whether usage is growing and sticky.',
            charts: [
                {
                    id: 'amplitude-d-1-c-1',
                    title: 'Daily active users',
                    detail: 'Line of active users per day for 90 days.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-1-c-2',
                    title: 'New users per week',
                    detail: 'Bars of new users per week.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-1-c-3',
                    title: 'DAU / MAU',
                    detail: 'Daily over monthly active users, as a ratio.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-1-c-4',
                    title: 'Active users by country',
                    detail: 'Top countries by active users this month.',
                    possible: true,
                },
            ],
        },
        {
            id: 'amplitude-d-2',
            name: 'Feature adoption',
            purpose:
                'A product manager checks whether a launched feature is being used, and by whom.',
            charts: [
                {
                    id: 'amplitude-d-2-c-1',
                    title: 'Feature event uniques per day',
                    detail: 'Unique users of the feature event per day.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-2-c-2',
                    title: 'Feature event totals by platform',
                    detail: 'Event count split by platform.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-2-c-3',
                    title: 'Feature events per user',
                    detail: 'Event totals divided by unique users, per week.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-2-c-4',
                    title: 'Adoption by plan',
                    detail: 'Unique users of the feature by a custom user property such as plan.',
                    possible: false,
                },
            ],
        },
        {
            id: 'amplitude-d-3',
            name: 'Activation funnel',
            purpose:
                'Growth reviews where new users drop off between sign-up and first value.',
            charts: [
                {
                    id: 'amplitude-d-3-c-1',
                    title: 'Sign-up to activation funnel',
                    detail: 'Users at each step and conversion from the first step.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-3-c-2',
                    title: 'Step conversion',
                    detail: 'Conversion from the previous step, per step.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-3-c-3',
                    title: 'Funnel by country',
                    detail: 'Users who finished the funnel, per country.',
                    possible: false,
                },
                {
                    id: 'amplitude-d-3-c-4',
                    title: 'Funnel conversion over time',
                    detail: 'Overall conversion for each week of sign-ups.',
                    possible: false,
                },
            ],
        },
        {
            id: 'amplitude-d-4',
            name: 'Retention',
            purpose:
                'Product and growth check whether new users keep coming back.',
            charts: [
                {
                    id: 'amplitude-d-4-c-1',
                    title: 'Weekly retention curve',
                    detail: 'Share of new users active in each week after their first.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-4-c-2',
                    title: 'Retention by sign-up cohort',
                    detail: 'Table of cohorts by week, with retention per week after.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-4-c-3',
                    title: 'Feature retention',
                    detail: 'Users of a feature who used it again in later weeks.',
                    possible: true,
                },
            ],
        },
        {
            id: 'amplitude-d-5',
            name: 'Engagement',
            purpose:
                'The product team watches how much time people spend in the product.',
            charts: [
                {
                    id: 'amplitude-d-5-c-1',
                    title: 'Average session length',
                    detail: 'Average session length per day.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-5-c-2',
                    title: 'Sessions per user',
                    detail: 'Average sessions per active user per day.',
                    possible: true,
                },
                {
                    id: 'amplitude-d-5-c-3',
                    title: 'Lifecycle',
                    detail: 'New, current, resurrected and dormant users per week.',
                    possible: false,
                },
                {
                    id: 'amplitude-d-5-c-4',
                    title: 'Stickiness',
                    detail: 'Users by number of active days per week.',
                    possible: false,
                },
            ],
        },
    ],
};
