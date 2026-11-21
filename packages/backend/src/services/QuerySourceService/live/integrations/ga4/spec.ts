// What this integration's code can't know: how much its API answers by
// itself, how hard access is, and what people expect to ask it. A blueprint
// for agents testing the integration; change it with the code it describes.
import type { LiveIntegrationSpec } from '../../spec/types';

export const ga4Spec: LiveIntegrationSpec = {
    level: 3,
    auth: {
        testWith: 'test_account',
        needs: ['gmail'],
        oauthReview:
            'Needs Google verification of the scope (in review since 17 Nov). Until then: a warning screen and a 100-user cap.',
    },
    api: {
        description: 'GA4 Data API runReport, with Google sign-in.',
        serverSideTotals: 'Yes. Reports return totals per dimension.',
        vendorLimit:
            'Standard properties: 10 requests at once, plus hourly and daily tokens per property.',
        paging: 'One report call, up to 24,999 rows.',
        whyOurLimits:
            'Half the concurrent limit; Google reports token use back.',
    },
    questions: [
        {
            id: 'GA4-01',
            question:
                'How many sessions, engaged sessions, key events and how much revenue did each source / medium drive last month?',
            expect: 'answer',
            source: 'https://github.com/fivetran/dbt_ga4_export',
        },
        {
            id: 'GA4-02',
            question:
                'For users who converted this quarter, which channel first brought them to the site versus which channel drove the session where they converted?',
            expect: 'needs_change',
            source: 'https://github.com/Velir/dbt-ga4',
        },
        {
            id: 'GA4-03',
            question:
                'How many new users did each first-touch source / medium bring in each week this year?',
            expect: 'needs_change',
            source: 'https://github.com/fivetran/dbt_ga4_export',
        },
        {
            id: 'GA4-04',
            question:
                'Which landing pages start the most sessions, and what share of those sessions go on to complete a key event?',
            expect: 'needs_change',
            source: 'https://support.google.com/analytics/answer/12931766',
        },
        {
            id: 'GA4-05',
            question:
                'Where do shoppers drop out between begin checkout, add shipping, add payment and purchase, split by device?',
            expect: 'needs_change',
            source: 'https://support.google.com/analytics/answer/14000977',
        },
        {
            id: 'GA4-06',
            question:
                'Of visitors who viewed the pricing page, how many started and then completed sign-up within 7 days, and how long did each step take on average?',
            expect: 'needs_change',
            source: 'https://support.google.com/analytics/answer/9327974',
        },
        {
            id: 'GA4-07',
            question:
                'What percentage of users first seen in each week came back in each of the following eight weeks?',
            expect: 'needs_change',
            source: 'https://support.google.com/analytics/answer/9670133',
        },
        {
            id: 'GA4-08',
            question:
                'What is the average lifetime revenue of users by the month and campaign that first acquired them?',
            expect: 'needs_change',
            source: 'https://support.google.com/analytics/answer/9947257',
        },
        {
            id: 'GA4-09',
            question:
                'What are the most common page sequences people follow after landing on the homepage, and where do those journeys end?',
            expect: 'api_cant',
            source: 'https://support.google.com/analytics/answer/9317498',
        },
        {
            id: 'GA4-10',
            question:
                'How many unique active users did we have in the last 7, 28 and 90 days, counting each person once?',
            expect: 'answer',
            source: 'https://coupler.io/dashboard-examples/web-analytics-dashboard',
        },
        {
            id: 'GA4-11',
            question:
                'Which pages got the most views last month, and how long did people actually engage with each one?',
            expect: 'needs_change',
            source: 'https://github.com/Velir/dbt-ga4',
        },
        {
            id: 'GA4-12',
            question:
                'How do new users, sessions, conversion rate and revenue this month compare with last month and with the same month last year?',
            expect: 'answer',
            source: 'https://databox.com/template/google-analytics-4-acquisition-overview-dashboard-template',
        },
        {
            id: 'GA4-13',
            question:
                'How many users are both mobile visitors and purchasers and also came from paid search, compared with users in only one of those groups?',
            expect: 'needs_change',
            source: 'https://support.google.com/analytics/answer/9328055',
        },
        {
            id: 'GA4-14',
            question:
                'What did this one visitor do across all their sessions before they submitted the demo request?',
            expect: 'api_cant',
            source: 'https://support.google.com/analytics/answer/7579450',
        },
        {
            id: 'GA4-15',
            question:
                'Which campaigns sent us more than 500 sessions last month but did not produce a single conversion?',
            expect: 'answer',
            source: 'https://github.com/Velir/dbt-ga4',
        },
        {
            id: 'GA4-16',
            question:
                'How does the credit each channel gets for conversions change between last-click and data-driven attribution, and which channel sequences most often lead to a conversion?',
            expect: 'api_cant',
            source: 'https://support.google.com/analytics/answer/11080067',
        },
    ],
    dashboards: [
        {
            id: 'DB-21',
            name: 'Web analytics overview',
            source: 'https://blog.coupler.io/ga4-report-templates/',
            charts: [
                {
                    id: 'DB-21.1',
                    title: 'Headline KPIs',
                    detail: 'active users, new users, sessions, average session duration, key events, engaged sessions, engagement rate',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.2',
                    title: 'Active vs new users by week',
                    detail: 'weekly active users next to new users',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.3',
                    title: 'Sessions vs engaged sessions by week',
                    detail: 'weekly sessions next to engaged sessions',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.4',
                    title: 'Active users and key events by channel over time',
                    detail: 'stacked by channel group',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.5',
                    title: 'Channel performance',
                    detail: 'per channel: active users, new users, sessions, session duration, key events, engagement rate',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.6',
                    title: 'All events',
                    detail: 'per event: active users, event count',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.7',
                    title: 'Key events',
                    detail: 'key events only: active users, event count, completion rate',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.8',
                    title: 'Users by country',
                    detail: 'world map plus country table: active users, sessions, key events, session duration, engagement rate',
                    expect: 'answer',
                },
                {
                    id: 'DB-21.9',
                    title: 'Landing pages',
                    detail: 'per landing page: users, sessions, session duration, key events, engagement rate',
                    expect: 'answer',
                },
            ],
        },
        {
            id: 'DB-22',
            name: 'Acquisition overview',
            source: 'https://databox.com/template/google-analytics-4-acquisition-overview-dashboard-template',
            charts: [
                {
                    id: 'DB-22.1',
                    title: 'New users',
                    detail: 'new users in the period against earlier periods',
                    expect: 'answer',
                },
                {
                    id: 'DB-22.2',
                    title: 'Unique users with sessions',
                    detail: 'distinct users who started a session in the period',
                    expect: 'answer',
                },
                {
                    id: 'DB-22.3',
                    title: 'Traffic by channel',
                    detail: 'sessions or users by marketing channel',
                    expect: 'answer',
                },
                {
                    id: 'DB-22.4',
                    title: 'Traffic by source',
                    detail: 'users by traffic source',
                    expect: 'answer',
                },
                {
                    id: 'DB-22.5',
                    title: 'Users by location',
                    detail: 'users by country',
                    expect: 'answer',
                },
                {
                    id: 'DB-22.6',
                    title: 'Total revenue',
                    detail: 'revenue in the period against earlier periods',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-22.7',
                    title: 'Conversion rate',
                    detail: 'conversion rate over time',
                    expect: 'answer',
                },
            ],
        },
        {
            id: 'DB-23',
            name: 'Ecommerce sales funnel',
            source: 'https://blog.coupler.io/ga4-report-templates/',
            charts: [
                {
                    id: 'DB-23.1',
                    title: 'Full sales funnel',
                    detail: 'five stages: first session, product view, add to cart, checkout, purchase, with step-to-step conversion rates',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-23.2',
                    title: 'Purchase revenue',
                    detail: 'total purchase revenue',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-23.3',
                    title: 'Purchasers',
                    detail: 'total purchasers, first-time purchasers and purchaser rate',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-23.4',
                    title: 'Average revenue per user',
                    detail: 'ARPU',
                    expect: 'answer',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-23.5',
                    title: 'Sales funnel by country',
                    detail: 'funnel stages and revenue per country',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-23.6',
                    title: 'Sales funnel by device',
                    detail: 'funnel stages and revenue per device',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-23.7',
                    title: 'Sales by item',
                    detail: 'per product: views, add-to-carts, checkouts, purchases, revenue',
                    expect: 'needs_change',
                },
            ],
        },
        {
            id: 'DB-24',
            name: 'Key event (conversion) insights',
            source: 'https://blog.coupler.io/ga4-report-templates/',
            charts: [
                {
                    id: 'DB-24.1',
                    title: 'Key event users',
                    detail: 'total users who completed a key event',
                    expect: 'answer',
                },
                {
                    id: 'DB-24.2',
                    title: 'Average engagement time',
                    detail: 'average engagement time of those users',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-24.3',
                    title: 'Event completion rate',
                    detail: 'share of users completing the key event',
                    expect: 'answer',
                },
                {
                    id: 'DB-24.4',
                    title: 'Key event completions over time',
                    detail: 'daily, weekly or monthly',
                    expect: 'answer',
                },
                {
                    id: 'DB-24.5',
                    title: 'Key event users by device',
                    detail: 'device type, browser and screen resolution',
                    expect: 'needs_change',
                },
                {
                    id: 'DB-24.6',
                    title: 'Key events by traffic source',
                    detail: 'organic search, paid, social, email',
                    expect: 'answer',
                },
                {
                    id: 'DB-24.7',
                    title: 'Key events by country and region',
                    detail: 'where most completions come from',
                    expect: 'answer',
                },
            ],
        },
    ],
};
