// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const ga4UseCases: LiveUseCases = {
    questions: [
        {
            id: 'GA4-01',
            question:
                'How many sessions, engaged sessions, key events and how much revenue did each source / medium drive last month?',
            expect: 'answer',
            why: "Session source, session medium, sessions, engaged sessions, key events and total revenue are all fields of the GA4 explore, and 'last completed month' is a supported date filter. One call, totals computed by Google.",
        },
        {
            id: 'GA4-02',
            question:
                'For users who converted this quarter, which channel first brought them to the site versus which channel drove the session where they converted?',
            expect: 'needs_change',
            why: "The explore has first-touch source but not first-touch channel, so no query can pair the channel that first brought a user with the channel of the converting session. GA4's report API has the field; it is a standard field, which the field scan does not pick up, so it needs adding in code.",
        },
        {
            id: 'GA4-03',
            question:
                'How many new users did each first-touch source / medium bring in each week this year?',
            expect: 'needs_change',
            why: "New users by ISO week and first-touch source works in the explore today, but first-touch medium is not a field and the field scan only adds custom fields, so 'source / medium' cannot be answered.",
        },
        {
            id: 'GA4-04',
            question:
                'Which landing pages start the most sessions, and what share of those sessions go on to complete a key event?',
            expect: 'needs_change',
            why: "Top landing pages by sessions with key event counts works in the explore. The share of sessions that convert is GA4's session key event rate, which is not a field; key events divided by sessions in DuckDB is events per session, a different and higher number.",
        },
        {
            id: 'GA4-05',
            question:
                'Where do shoppers drop out between begin checkout, add shipping, add payment and purchase, split by device?',
            expect: 'needs_change',
            why: "An ordered checkout funnel is GA4's separate funnel report, which the integration cannot call. A person can chart users per checkout event by device in Explore, but that is not ordered, and the agent is told to decline funnels on live data sources rather than approximate them from event counts.",
        },
        {
            id: 'GA4-06',
            question:
                'Of visitors who viewed the pricing page, how many started and then completed sign-up within 7 days, and how long did each step take on average?',
            expect: 'needs_change',
            why: "This needs an ordered funnel mixing a page view and two events with a 7-day window. That is GA4's funnel report, a separate endpoint the integration cannot reach; the report API we call only gives unordered counts. Average time per step is, as far as I know, not returned by the funnel API either.",
        },
        {
            id: 'GA4-07',
            question:
                'What percentage of users first seen in each week came back in each of the following eight weeks?',
            expect: 'needs_change',
            why: "Weekly retention needs GA4's cohort request (cohortSpec on the same runReport endpoint). The explore has no cohort fields and the strict request schema rejects cohortSpec, so nothing today can express it; DuckDB cannot rebuild it because no user-level rows exist.",
        },
        {
            id: 'GA4-08',
            question:
                'What is the average lifetime revenue of users by the month and campaign that first acquired them?',
            expect: 'needs_change',
            why: "Lifetime revenue per user by acquisition month and campaign needs cohort requests with cumulative revenue plus the first-touch campaign field. The API has no lifetime-value metric, so 'lifetime' can only mean the months the cohort request covers.",
        },
        {
            id: 'GA4-09',
            question:
                'What are the most common page sequences people follow after landing on the homepage, and where do those journeys end?',
            expect: 'api_cant',
            why: "Page sequences and journey ends are GA4's path exploration, which the Data API does not offer; reports give totals per page, never the order of pages within a session. Only the BigQuery event export has it.",
        },
        {
            id: 'GA4-10',
            question:
                'How many unique active users did we have in the last 7, 28 and 90 days, counting each person once?',
            expect: 'answer',
            why: 'Active users with no breakdown and one date range is a correct de-duplicated count from Google. Three windows need three such queries: three nodes joined in a DuckDB step, or three charts. Nothing is summed locally, so the non-additive count stays right.',
        },
        {
            id: 'GA4-11',
            question:
                'Which pages got the most views last month, and how long did people actually engage with each one?',
            expect: 'needs_change',
            why: "Views per page works in the explore. Engagement time per page needs GA4's user engagement duration, which is not a field; average session duration is a session metric and is wrong when split by page.",
        },
        {
            id: 'GA4-12',
            question:
                'How do new users, sessions, conversion rate and revenue this month compare with last month and with the same month last year?',
            expect: 'answer',
            why: "Period over period is refused on the explore, but three nodes (this month, last month, same month last year), each with no breakdown, joined in DuckDB give the comparison with Google-computed totals. Conversion rate is computed there as key events (or purchases) per session; GA4's own session key event rate is not a field.",
        },
        {
            id: 'GA4-13',
            question:
                'How many users are both mobile visitors and purchasers and also came from paid search, compared with users in only one of those groups?',
            expect: 'needs_change',
            why: "Report filters apply to events, not to users, so 'users who are in all three groups' and 'users in only one' cannot be expressed in the report call. User-level segments with include and exclude rules exist only in GA4's funnel report endpoint.",
        },
        {
            id: 'GA4-14',
            question:
                'What did this one visitor do across all their sessions before they submitted the demo request?',
            expect: 'api_cant',
            why: "The GA4 Data API returns aggregates only: there is no visitor identifier and no event-by-event rows, so one person's journey cannot be read live. It exists only in the BigQuery export or the GA4 user explorer screen.",
        },
        {
            id: 'GA4-15',
            question:
                'Which campaigns sent us more than 500 sessions last month but did not produce a single conversion?',
            expect: 'answer',
            why: 'Session campaign with sessions and key events, filtered to sessions above 500 and key events equal to 0, is one explore query: GA4 accepts filters on metrics and applies them after totalling. Last month is a supported date filter.',
        },
        {
            id: 'GA4-16',
            question:
                'How does the credit each channel gets for conversions change between last-click and data-driven attribution, and which channel sequences most often lead to a conversion?',
            expect: 'api_cant',
            why: "Comparing attribution models and listing conversion paths live only in GA4's Advertising screens; the Data API reports key events under the property's one configured model and has no path data.",
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
                    expect: 'answer',
                    why: 'All seven metrics with no breakdown are one explore query, de-duplicated by Google.',
                },
                {
                    id: 'DB-21.2',
                    title: 'Active vs new users by week',
                    detail: 'weekly active users next to new users',
                    expect: 'answer',
                    why: 'ISO week with active users and new users is a native grain, computed per week by Google.',
                },
                {
                    id: 'DB-21.3',
                    title: 'Sessions vs engaged sessions by week',
                    detail: 'weekly sessions next to engaged sessions',
                    expect: 'answer',
                    why: 'ISO week with sessions and engaged sessions, one query.',
                },
                {
                    id: 'DB-21.4',
                    title: 'Active users and key events by channel over time',
                    detail: 'stacked by channel group',
                    expect: 'answer',
                    why: 'The numbers are one query (week by channel), but stacking by channel is a pivot, which live explores refuse; a DuckDB node pivots the result.',
                },
                {
                    id: 'DB-21.5',
                    title: 'Channel performance',
                    detail: 'per channel: active users, new users, sessions, session duration, key events, engagement rate',
                    expect: 'answer',
                    why: 'Channel group with six metrics is one query.',
                },
                {
                    id: 'DB-21.6',
                    title: 'All events',
                    detail: 'per event: active users, event count',
                    expect: 'answer',
                    why: 'Event name with active users and event count is one query.',
                },
                {
                    id: 'DB-21.7',
                    title: 'Key events',
                    detail: 'key events only: active users, event count, completion rate',
                    expect: 'answer',
                    why: 'Key events only is a metric filter (key events above 0) by event name; the completion rate is users with the event divided by all active users from a second node.',
                },
                {
                    id: 'DB-21.8',
                    title: 'Users by country',
                    detail: 'world map plus country table: active users, sessions, key events, session duration, engagement rate',
                    expect: 'answer',
                    why: "Country with the five metrics is one query; the map depends on Lightdash matching GA4's country names.",
                },
                {
                    id: 'DB-21.9',
                    title: 'Landing pages',
                    detail: 'per landing page: users, sessions, session duration, key events, engagement rate',
                    expect: 'answer',
                    why: 'Landing page with users, sessions, duration, key events and engagement rate is one query, sorted by Google.',
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
                    expect: 'answer',
                    why: 'New users by month or week (computed per row by Google) as a big number compared with the previous row; a native period comparison is refused.',
                },
                {
                    id: 'DB-22.2',
                    title: 'Unique users with sessions',
                    detail: 'distinct users who started a session in the period',
                    expect: 'answer',
                    why: 'Total or active users with no breakdown is one exact query.',
                },
                {
                    id: 'DB-22.3',
                    title: 'Traffic by channel',
                    detail: 'sessions or users by marketing channel',
                    expect: 'answer',
                    why: 'Channel group with sessions or users, one query.',
                },
                {
                    id: 'DB-22.4',
                    title: 'Traffic by source',
                    detail: 'users by traffic source',
                    expect: 'answer',
                    why: 'Session source with users, sorted by Google.',
                },
                {
                    id: 'DB-22.5',
                    title: 'Users by location',
                    detail: 'users by country',
                    expect: 'answer',
                    why: 'Country with users; the map depends on country-name matching.',
                },
                {
                    id: 'DB-22.6',
                    title: 'Total revenue',
                    detail: 'revenue in the period against earlier periods',
                    expect: 'answer',
                    why: 'Total revenue by month or week rows compared with the previous row.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-22.7',
                    title: 'Conversion rate',
                    detail: 'conversion rate over time',
                    expect: 'answer',
                    why: "Conversion rate over time is key events (or purchases) divided by sessions per week in DuckDB; calculations are refused on the explore and GA4's own rate metric is not a field.",
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
                    expect: 'needs_change',
                    why: "An ordered funnel (the five stages) is GA4's separate funnel report. Explore can chart users per stage event, but that is unordered and the agent declines to build funnels from event counts.",
                },
                {
                    id: 'DB-23.2',
                    title: 'Purchase revenue',
                    detail: 'total purchase revenue',
                    expect: 'answer',
                    why: 'Total revenue with no breakdown; it equals purchase revenue unless the property also records ad or subscription revenue.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-23.3',
                    title: 'Purchasers',
                    detail: 'total purchasers, first-time purchasers and purchaser rate',
                    expect: 'needs_change',
                    why: 'Total purchasers, first-time purchasers and purchaser rate are not explore fields (users filtered to the purchase event gives total purchasers only).',
                },
                {
                    id: 'DB-23.4',
                    title: 'Average revenue per user',
                    detail: 'ARPU',
                    expect: 'answer',
                    why: 'Total revenue divided by active users, both whole-period totals from one node, in a DuckDB step.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-23.5',
                    title: 'Sales funnel by country',
                    detail: 'funnel stages and revenue per country',
                    expect: 'needs_change',
                    why: "An ordered funnel (stages per country) is GA4's separate funnel report. Explore can chart users per stage event, but that is unordered and the agent declines to build funnels from event counts.",
                },
                {
                    id: 'DB-23.6',
                    title: 'Sales funnel by device',
                    detail: 'funnel stages and revenue per device',
                    expect: 'needs_change',
                    why: "An ordered funnel (stages per device) is GA4's separate funnel report. Explore can chart users per stage event, but that is unordered and the agent declines to build funnels from event counts.",
                },
                {
                    id: 'DB-23.7',
                    title: 'Sales by item',
                    detail: 'per product: views, add-to-carts, checkouts, purchases, revenue',
                    expect: 'needs_change',
                    why: 'Item name with items viewed, items purchased and item revenue works today; items added to cart and checked out are not fields.',
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
                    expect: 'answer',
                    why: 'Total users filtered to the key event name (or a list of key event names) is one exact query.',
                },
                {
                    id: 'DB-24.2',
                    title: 'Average engagement time',
                    detail: 'average engagement time of those users',
                    expect: 'needs_change',
                    why: 'Average engagement time needs user engagement duration, which the explore lacks. Restricting it to users who converted is not possible in the report API, so it would be the all-user average.',
                },
                {
                    id: 'DB-24.3',
                    title: 'Event completion rate',
                    detail: 'share of users completing the key event',
                    expect: 'answer',
                    why: 'Users with the key event divided by all active users, two nodes and a DuckDB division.',
                },
                {
                    id: 'DB-24.4',
                    title: 'Key event completions over time',
                    detail: 'daily, weekly or monthly',
                    expect: 'answer',
                    why: 'Date, week or month with key events; the grain is fixed per tile because date zoom is refused.',
                },
                {
                    id: 'DB-24.5',
                    title: 'Key event users by device',
                    detail: 'device type, browser and screen resolution',
                    expect: 'needs_change',
                    why: 'Key event users by device category works today; browser and screen resolution are not fields.',
                },
                {
                    id: 'DB-24.6',
                    title: 'Key events by traffic source',
                    detail: 'organic search, paid, social, email',
                    expect: 'answer',
                    why: 'Session channel group or source with key events, one query.',
                },
                {
                    id: 'DB-24.7',
                    title: 'Key events by country and region',
                    detail: 'where most completions come from',
                    expect: 'answer',
                    why: 'Country (and city) with key events, one query; region is not a field.',
                },
            ],
        },
    ],
};
