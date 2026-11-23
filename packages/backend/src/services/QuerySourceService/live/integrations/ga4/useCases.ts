// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const ga4UseCases: LiveUseCases = {
    questions: [
        {
            id: 'GA4-01',
            question:
                'How many sessions, engaged sessions, key events and how much revenue did each source / medium drive last month?',
            possible: true,
        },
        {
            id: 'GA4-02',
            question:
                'For users who converted this quarter, which channel first brought them to the site versus which channel drove the session where they converted?',
            possible: false,
        },
        {
            id: 'GA4-03',
            question:
                'How many new users did each first-touch source / medium bring in each week this year?',
            possible: false,
        },
        {
            id: 'GA4-04',
            question:
                'Which landing pages start the most sessions, and what share of those sessions go on to complete a key event?',
            possible: false,
        },
        {
            id: 'GA4-05',
            question:
                'Where do shoppers drop out between begin checkout, add shipping, add payment and purchase, split by device?',
            possible: false,
        },
        {
            id: 'GA4-06',
            question:
                'Of visitors who viewed the pricing page, how many started and then completed sign-up within 7 days, and how long did each step take on average?',
            possible: false,
        },
        {
            id: 'GA4-07',
            question:
                'What percentage of users first seen in each week came back in each of the following eight weeks?',
            possible: false,
        },
        {
            id: 'GA4-08',
            question:
                'What is the average lifetime revenue of users by the month and campaign that first acquired them?',
            possible: false,
        },
        {
            id: 'GA4-09',
            question:
                'What are the most common page sequences people follow after landing on the homepage, and where do those journeys end?',
            possible: false,
        },
        {
            id: 'GA4-10',
            question:
                'How many unique active users did we have in the last 7, 28 and 90 days, counting each person once?',
            possible: true,
        },
        {
            id: 'GA4-11',
            question:
                'Which pages got the most views last month, and how long did people actually engage with each one?',
            possible: false,
        },
        {
            id: 'GA4-12',
            question:
                'How do new users, sessions, conversion rate and revenue this month compare with last month and with the same month last year?',
            possible: true,
        },
        {
            id: 'GA4-13',
            question:
                'How many users are both mobile visitors and purchasers and also came from paid search, compared with users in only one of those groups?',
            possible: false,
        },
        {
            id: 'GA4-14',
            question:
                'What did this one visitor do across all their sessions before they submitted the demo request?',
            possible: false,
        },
        {
            id: 'GA4-15',
            question:
                'Which campaigns sent us more than 500 sessions last month but did not produce a single conversion?',
            possible: true,
        },
        {
            id: 'GA4-16',
            question:
                'How does the credit each channel gets for conversions change between last-click and data-driven attribution, and which channel sequences most often lead to a conversion?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'DB-21',
            name: 'Web analytics overview',
            purpose:
                'Weekly check on how much traffic the site gets, how engaged it is and which channels, countries and landing pages drive key events.',
            charts: [
                {
                    id: 'DB-21.1',
                    title: 'Headline KPIs',
                    detail: 'active users, new users, sessions, average session duration, key events, engaged sessions, engagement rate',
                    possible: true,
                },
                {
                    id: 'DB-21.2',
                    title: 'Active vs new users by week',
                    detail: 'weekly active users next to new users',
                    possible: true,
                },
                {
                    id: 'DB-21.3',
                    title: 'Sessions vs engaged sessions by week',
                    detail: 'weekly sessions next to engaged sessions',
                    possible: true,
                },
                {
                    id: 'DB-21.4',
                    title: 'Active users and key events by channel over time',
                    detail: 'stacked by channel group',
                    possible: true,
                },
                {
                    id: 'DB-21.5',
                    title: 'Channel performance',
                    detail: 'per channel: active users, new users, sessions, session duration, key events, engagement rate',
                    possible: true,
                },
                {
                    id: 'DB-21.6',
                    title: 'All events',
                    detail: 'per event: active users, event count',
                    possible: true,
                },
                {
                    id: 'DB-21.7',
                    title: 'Key events',
                    detail: 'key events only: active users, event count, completion rate',
                    possible: true,
                },
                {
                    id: 'DB-21.8',
                    title: 'Users by country',
                    detail: 'world map plus country table: active users, sessions, key events, session duration, engagement rate',
                    possible: true,
                },
                {
                    id: 'DB-21.9',
                    title: 'Landing pages',
                    detail: 'per landing page: users, sessions, session duration, key events, engagement rate',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-22',
            name: 'Acquisition overview',
            purpose:
                'Shows where site and app users come from and which channels deserve more or less support.',
            charts: [
                {
                    id: 'DB-22.1',
                    title: 'New users',
                    detail: 'new users in the period against earlier periods',
                    possible: true,
                },
                {
                    id: 'DB-22.2',
                    title: 'Unique users with sessions',
                    detail: 'distinct users who started a session in the period',
                    possible: true,
                },
                {
                    id: 'DB-22.3',
                    title: 'Traffic by channel',
                    detail: 'sessions or users by marketing channel',
                    possible: true,
                },
                {
                    id: 'DB-22.4',
                    title: 'Traffic by source',
                    detail: 'users by traffic source',
                    possible: true,
                },
                {
                    id: 'DB-22.5',
                    title: 'Users by location',
                    detail: 'users by country',
                    possible: true,
                },
                {
                    id: 'DB-22.6',
                    title: 'Total revenue',
                    detail: 'revenue in the period against earlier periods',
                    possible: true,
                },
                {
                    id: 'DB-22.7',
                    title: 'Conversion rate',
                    detail: 'conversion rate over time',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-23',
            name: 'Ecommerce sales funnel',
            purpose:
                'Finds where shoppers drop out between first visit and purchase, by country, device and product.',
            charts: [
                {
                    id: 'DB-23.1',
                    title: 'Full sales funnel',
                    detail: 'five stages: first session, product view, add to cart, checkout, purchase, with step-to-step conversion rates',
                    possible: false,
                },
                {
                    id: 'DB-23.2',
                    title: 'Purchase revenue',
                    detail: 'total purchase revenue',
                    possible: true,
                },
                {
                    id: 'DB-23.3',
                    title: 'Purchasers',
                    detail: 'total purchasers, first-time purchasers and purchaser rate',
                    possible: false,
                },
                {
                    id: 'DB-23.4',
                    title: 'Average revenue per user',
                    detail: 'ARPU',
                    possible: true,
                },
                {
                    id: 'DB-23.5',
                    title: 'Sales funnel by country',
                    detail: 'funnel stages and revenue per country',
                    possible: false,
                },
                {
                    id: 'DB-23.6',
                    title: 'Sales funnel by device',
                    detail: 'funnel stages and revenue per device',
                    possible: false,
                },
                {
                    id: 'DB-23.7',
                    title: 'Sales by item',
                    detail: 'per product: views, add-to-carts, checkouts, purchases, revenue',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-24',
            name: 'Key event (conversion) insights',
            purpose:
                'Tracks how many users complete key events and which sources, devices and regions those conversions come from.',
            charts: [
                {
                    id: 'DB-24.1',
                    title: 'Key event users',
                    detail: 'total users who completed a key event',
                    possible: true,
                },
                {
                    id: 'DB-24.2',
                    title: 'Average engagement time',
                    detail: 'average engagement time of those users',
                    possible: false,
                },
                {
                    id: 'DB-24.3',
                    title: 'Event completion rate',
                    detail: 'share of users completing the key event',
                    possible: true,
                },
                {
                    id: 'DB-24.4',
                    title: 'Key event completions over time',
                    detail: 'daily, weekly or monthly',
                    possible: true,
                },
                {
                    id: 'DB-24.5',
                    title: 'Key event users by device',
                    detail: 'device type, browser and screen resolution',
                    possible: false,
                },
                {
                    id: 'DB-24.6',
                    title: 'Key events by traffic source',
                    detail: 'organic search, paid, social, email',
                    possible: true,
                },
                {
                    id: 'DB-24.7',
                    title: 'Key events by country and region',
                    detail: 'where most completions come from',
                    possible: true,
                },
            ],
        },
    ],
};
