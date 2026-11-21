// What people expect to ask this integration and the dashboards they expect
// to build, and whether it answers each today. Flip `expect` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const postHogUseCases: LiveUseCases = {
    questions: [
        {
            id: 'PHG-01',
            question:
                'How many daily and monthly active users do we have, and how is the ratio between the two trending?',
            expect: 'answer',
            why: "Daily active users by day and monthly active users by calendar month are each one PostHog query, and a DuckDB step divides them; Explore alone cannot show both grains and the ratio together. The window must be set on the Event date field (a filter on week or month is silently cut to the last 30 days), and monthly actives are calendar months, not PostHog's rolling 30 days.",
        },
        {
            id: 'PHG-02',
            question:
                'How many unique users used the export feature between 3 March and 19 April, counting each person once?',
            expect: 'answer',
            why: 'One query: unique users filtered to the export event and the date range, counted once each by PostHog. The range must be on the Event date field; the same range on Event time is silently cut to the last 30 days and would return zero.',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'PHG-03',
            question:
                'What share of users who signed up went on to finish onboarding and create their first project within 14 days, and which step loses the most people?',
            expect: 'answer',
            why: 'There is no funnel query. A composer query can read one row per signed-up user with the first time of each step (custom metrics are native on PostHog) and work out the funnel and the 14-day rule in DuckDB. Explore alone cannot, and PostHog SQL, which would do it in one query, cannot be sent by the AI agent.',
            tags: ['capped'],
        },
        {
            id: 'PHG-04',
            question:
                'Of the users who signed up each week, what percentage came back and did the key action in each of the following eight weeks?',
            expect: 'answer',
            why: 'Retention needs one row per user per active week for everyone who did the key action, because the explore cannot limit the read to the sign-up cohort; that passes the row limit at a typical company. PostHog SQL would return the cohort grid directly, but the AI agent cannot send it.',
            tags: ['capped'],
        },
        {
            id: 'PHG-05',
            question:
                'What do users do right after signing up, and where do they get stuck before they reach the new feature?',
            expect: 'answer',
            why: "There is no paths query. A composer query can order each user's first use of a list of named events, which approximates the path, but it reads a row per active user and cannot limit itself to new sign-ups. True step-by-step paths need PostHog SQL or PostHog's paths query.",
            tags: ['capped'],
        },
        {
            id: 'PHG-06',
            question:
                'On how many days per month do users use the dashboard feature, and how many use it on five or more days?',
            expect: 'answer',
            why: 'A node reads one row per user with the number of distinct days they used the feature in the month (PostHog counts the days), and DuckDB builds the distribution and the five-or-more count. Explore alone gives the per-user rows but not the distribution.',
            tags: ['capped'],
        },
        {
            id: 'PHG-07',
            question:
                'How many new, returning, resurrected and dormant users did we have each week?',
            expect: 'answer',
            why: "Splitting users into new, returning, resurrected and dormant needs each user's activity week by week plus when they were first seen. The explore has no first-seen field, and a row per user per week passes the row limit at a typical company, so only a small product with a long look-back gets a fair answer. PostHog SQL would do it server-side.",
            tags: ['capped'],
        },
        {
            id: 'PHG-08',
            question:
                'Which companies were most active this month, and how many active users does each one have?',
            expect: 'needs_change',
            why: "The events explore has no company field: PostHog's group key is not among the scanned properties and group names live in another PostHog table. With such a field, unique users per company is one query counted by PostHog. Today it works only if the customer also sends the company as an ordinary event or person property and an admin switches it on.",
        },
        {
            id: 'PHG-09',
            question:
                'Which companies that were active last month have had no activity at all in the past 14 days?',
            expect: 'needs_change',
            why: "Same missing company field. With it, one node gives each company's latest active date (a custom metric PostHog computes) and a DuckDB step keeps those active last month and silent for 14 days; the result is a row per company, well under the row limit.",
        },
        {
            id: 'PHG-10',
            question:
                'How is one named customer using the product: how many of its people are active, which features they use and when they were last seen?',
            expect: 'needs_change',
            why: 'The questions themselves are simple (active people, events by name, latest event date), but they must be filtered to one company and the explore has no company field or company name. With one, the AI agent answers it in three small queries.',
        },
        {
            id: 'PHG-11',
            question:
                'Did the new checkout variant beat the control on conversion, by how much, and is the result statistically significant?',
            expect: 'needs_change',
            why: "PostHog's own experiment results cannot be read. A composer query can rebuild them: one row per exposed user with the variant and whether they converted, then DuckDB works out rates, lift and a significance test. An admin must first switch on the feature flag properties (they are scanned but not in use), and the test is ours, not PostHog's statistics.",
        },
        {
            id: 'PHG-12',
            question:
                'Which channels and UTM campaigns bring the most visitors, and which of them convert to sign-up best?',
            expect: 'answer',
            why: "One query: visitors and sign-ups as two filtered unique-user counts by UTM source or campaign, with the conversion rate as a table calculation (all native on PostHog). UTM fields other than source and the first-touch person properties are scanned fields an admin switches on. PostHog's own channel grouping is not offered, so channels are read from referring domain and UTM source, and sign-up events sent from a server carry no UTM (use the first-touch properties then).",
        },
        {
            id: 'PHG-13',
            question:
                "Does crediting sign-ups to a user's first-touch source instead of their last-touch source change which channel looks best?",
            expect: 'answer',
            why: "Two nodes count sign-ups by the person's first-touch source (PostHog's initial UTM and referrer person properties, switched on by an admin) and by the source on the sign-up event, and DuckDB puts them side by side. Explore alone shows one attribution at a time. Last touch comes back blank if sign-up events are sent from a server.",
        },
        {
            id: 'PHG-14',
            question:
                'Which entry pages have the highest bounce rate and the lowest conversion to sign-up?',
            expect: 'needs_change',
            why: 'Entry page and bounce are facts about a session, and the events explore has no session fields. They can be rebuilt from a row per session and page, which passes the row limit on any site with real traffic. The planned sessions explore would make this one small query.',
        },
        {
            id: 'PHG-15',
            question:
                'What is the average session length and number of events per session, by device type?',
            expect: 'needs_change',
            why: 'Events per session by device type works today in one query (events divided by unique sessions, a native table calculation). Average session length does not: there is no duration field, and rebuilding it needs a row per session, which passes the row limit. The planned sessions explore would fix it.',
        },
        {
            id: 'PHG-16',
            question:
                'Which sessions in the last week had a rage click or an error from users on the Enterprise plan?',
            expect: 'answer',
            why: 'One query: events filtered to rage clicks and errors in the last 7 days and to the Enterprise plan person property, listed by session ID and person. The session ID and plan properties are scanned fields an admin switches on. It returns session IDs, not replay links, and does not work if the plan is stored on the company rather than the person.',
            tags: ['unverified', 'no_data'],
        },
        {
            id: 'PHG-17',
            question:
                'How did monthly recurring revenue move each month, split into new, expansion, contraction and churned revenue?',
            expect: 'needs_change',
            why: "MRR movements come from PostHog's revenue analytics, which is built on billing data and its own revenue queries, not on events. Nothing in the events explore holds subscriptions or revenue.",
        },
        {
            id: 'PHG-18',
            question:
                'How do visitors, page views, sessions, bounce rate and session duration this week compare with last week?',
            expect: 'answer',
            why: 'Visitors, page views and sessions this week against last week are one query (period over period is native on PostHog). Bounce rate and session duration are not: there are no session fields, and rebuilding them needs a row per session for two weeks, which passes the row limit. The planned sessions explore would fix it.',
            tags: ['unverified', 'no_data', 'capped'],
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
                    expect: 'answer',
                    why: 'Unique users filtered to pageview and screen events over 30 days, one PostHog query.',
                },
                {
                    id: 'DB-31.2',
                    title: 'Sessions (last 7 days)',
                    detail: 'unique sessions, compared with the previous 7 days',
                    expect: 'answer',
                    why: 'Unique sessions with a native period-over-period comparison; an exact rolling 7 days against the 7 before is easier as two nodes in a composer chart. Events with no session add one to the count.',
                },
                {
                    id: 'DB-31.3',
                    title: 'Pageviews (last 7 days)',
                    detail: 'total pageviews, compared with the previous 7 days',
                    expect: 'answer',
                    why: 'Pageview count with the same native comparison; counts are additive, so daily values also add up correctly.',
                },
                {
                    id: 'DB-31.4',
                    title: 'Daily active users (DAUs)',
                    detail: 'unique users per day, last 30 days',
                    expect: 'answer',
                    why: 'Unique users by day for 30 days, one query; days follow the PostHog project time zone.',
                },
                {
                    id: 'DB-31.5',
                    title: 'Weekly active users (WAUs)',
                    detail: 'unique users per week, last 90 days',
                    expect: 'answer',
                    why: 'Unique users by week; the 90-day window must be set on the Event date field, because a filter on the week field is silently cut to the last 30 days.',
                },
                {
                    id: 'DB-31.6',
                    title: 'Retention',
                    detail: 'weekly retention based on pageviews',
                    expect: 'answer',
                    why: 'Needs a row per user per active week for every visitor before DuckDB can build the grid; that passes the 5,000-row node limit on any site with real traffic and is cut off with no warning. PostHog SQL would return the grid directly. As a tile it also needs stored composer charts to accept that node.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-31.7',
                    title: 'Growth accounting',
                    detail: 'new, returning, resurrecting and dormant users per week',
                    expect: 'answer',
                    why: "Needs each user's weekly activity plus a first-seen date the explore does not have; user-week rows pass the row limit at a typical company and long-standing users are counted as new. As a tile it also needs stored composer charts to accept that node.",
                    tags: ['capped'],
                },
                {
                    id: 'DB-31.8',
                    title: 'Top referrers',
                    detail: 'unique users by referring domain, last 7 to 14 days',
                    expect: 'answer',
                    why: 'Unique users by referring domain, sorted, one query.',
                },
                {
                    id: 'DB-31.9',
                    title: 'Users by country',
                    detail: 'unique users by country, last 7 days',
                    expect: 'answer',
                    why: 'Unique users by country code for 7 days, one query.',
                },
                {
                    id: 'DB-31.10',
                    title: 'Visit to interaction funnel',
                    detail: 'pageview to first interaction, last 7 days; older version: three pageviews by browser',
                    expect: 'answer',
                    why: 'Needs a row per visitor with the time of the first pageview and the first interaction; a week of visitors passes the 5,000-row node limit at a typical site. As a tile it also needs stored composer charts to accept that node.',
                    tags: ['capped'],
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
                    expect: 'needs_change',
                    why: 'Visitors, views, sessions and conversions against the previous period are one query; average session duration and bounce rate need a row per session, which passes the 5,000-row node limit at typical traffic.',
                },
                {
                    id: 'DB-32.2',
                    title: 'Top paths',
                    detail: 'per path: views, visitors, bounce rate, scroll depth',
                    expect: 'needs_change',
                    why: 'Views and visitors per path are one query today, and scroll depth is a scanned property an admin switches on; bounce rate per path needs session rows, so the full table does not fit the row limit at typical traffic.',
                },
                {
                    id: 'DB-32.3',
                    title: 'Entry and end paths',
                    detail: 'first and last pageview of each session; outbound clicks',
                    expect: 'needs_change',
                    why: 'First and last page of a session are session fields the explore lacks; rebuilding them needs a row per session and page. Outbound clicks by link work today once an admin switches on that property.',
                },
                {
                    id: 'DB-32.4',
                    title: 'Channels and referrers',
                    detail: 'channel types and top referrers',
                    expect: 'needs_change',
                    why: "Top referrers work today. PostHog's channel type is a session field that is not offered, and unique visitors cannot be re-added across referrers into channels.",
                },
                {
                    id: 'DB-32.5',
                    title: 'UTMs',
                    detail: 'source, medium, campaign, content, term',
                    expect: 'answer',
                    why: 'Unique users and sessions by UTM field, one query each; source is built in, the other four are scanned properties an admin switches on.',
                },
                {
                    id: 'DB-32.6',
                    title: 'Geography',
                    detail: 'world map with countries, regions, cities, timezones, languages',
                    expect: 'answer',
                    why: 'Country is built in; region, city, time zone and language are scanned properties an admin switches on. Each breakdown is one query.',
                },
                {
                    id: 'DB-32.7',
                    title: 'Retention',
                    detail: 'users who first did any event in the last week',
                    expect: 'answer',
                    why: 'Needs a row per user per active week for everyone seen; that passes the 5,000-row node limit at typical traffic and is cut off with no warning. As a tile it also needs stored composer charts to accept that node.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-32.8',
                    title: 'Active hours',
                    detail: 'unique users or pageviews by hour and day of week',
                    expect: 'answer',
                    why: 'Hour of day and weekday are not fields, but both are simple expressions on the event time that an editor adds as custom SQL dimensions (native on PostHog); PostHog then counts users or pageviews per cell. The AI agent cannot add them, and hours follow the PostHog project time zone.',
                },
                {
                    id: 'DB-32.9',
                    title: 'Goals',
                    detail: 'pinned or recent actions and their conversion counts',
                    expect: 'answer',
                    why: 'For goals that are named events: unique users and counts per event, filtered to the chosen events, one query. PostHog actions (saved URL or click rules) are not offered.',
                },
                {
                    id: 'DB-32.10',
                    title: 'LCP score',
                    detail: '75th percentile of first-pageview LCP per session',
                    expect: 'answer',
                    why: "A 75th-percentile custom metric (native on PostHog) over the web vitals LCP property, which an admin switches on. It is the percentile of all LCP readings, not only the first pageview of each session, so it can differ a little from PostHog's own figure.",
                    tags: ['unverified', 'no_data'],
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
                    expect: 'needs_change',
                    why: 'Unique sessions by path is one query, but it cannot be filtered to the selected company because the explore has no company field.',
                },
                {
                    id: 'DB-33.2',
                    title: 'Top events',
                    detail: 'event totals by event name',
                    expect: 'needs_change',
                    why: 'Event totals by event name is one query; the company filter is what is missing.',
                },
                {
                    id: 'DB-33.3',
                    title: 'Weekly active users',
                    detail: 'unique users per week within the company',
                    expect: 'needs_change',
                    why: 'Unique users per week is one query; the company filter is what is missing.',
                },
                {
                    id: 'DB-33.4',
                    title: 'Monthly active users',
                    detail: 'unique users per month within the company',
                    expect: 'needs_change',
                    why: 'Unique users per month is one query; the company filter is missing, and the window must be set on the Event date field or it is silently cut to 30 days.',
                },
                {
                    id: 'DB-33.5',
                    title: 'Retained users',
                    detail: "retention of the company's users based on pageviews",
                    expect: 'needs_change',
                    why: "Retention for one company's users is small enough for a composer chart (a row per user per week, then DuckDB), but it too needs the company filter first.",
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
                    expect: 'answer',
                    why: 'Needs a row per session and page with its first-visit time so DuckDB can order pages into paths; 30 days of sessions passes the 5,000-row node limit at any real site. PostHog SQL would do it server-side. As a tile it also needs stored composer charts to accept that node.',
                    tags: ['capped'],
                },
                {
                    id: 'DB-34.2',
                    title: 'Which users are highly engaged?',
                    detail: 'lifecycle of identified users with a pageview in the last 30 days',
                    expect: 'answer',
                    why: "Needs each identified user's weekly activity plus a first-seen date the explore does not have; user-week rows pass the row limit at a typical company. As a tile it also needs stored composer charts to accept that node.",
                    tags: ['capped'],
                },
                {
                    id: 'DB-34.3',
                    title: 'Where are my users experiencing frustration?',
                    detail: 'rage clicks by page',
                    expect: 'answer',
                    why: 'Count of rage-click events by path, one query.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-34.4',
                    title: 'How do users find my product?',
                    detail: 'unique users by referring domain',
                    expect: 'answer',
                    why: 'Unique users by referring domain, one query.',
                },
                {
                    id: 'DB-34.5',
                    title: 'What devices do users access my product with?',
                    detail: 'unique users by device type',
                    expect: 'answer',
                    why: 'Unique users by device type, one query.',
                },
                {
                    id: 'DB-34.6',
                    title: 'What browsers do users prefer?',
                    detail: 'unique users by browser',
                    expect: 'answer',
                    why: 'Unique users by browser, one query.',
                },
                {
                    id: 'DB-34.7',
                    title: 'What screen size do users have?',
                    detail: 'unique users by screen height',
                    expect: 'answer',
                    why: 'Unique users by screen height, a scanned property an admin switches on; grouping heights into bands is a native custom dimension.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-34.8',
                    title: 'What languages do users prefer?',
                    detail: 'unique users by browser language',
                    expect: 'answer',
                    why: 'Unique users by browser language, a scanned property an admin switches on.',
                    tags: ['unverified', 'no_data'],
                },
                {
                    id: 'DB-34.9',
                    title: 'Where are my users located?',
                    detail: 'pageviews by country',
                    expect: 'answer',
                    why: 'Pageview count by country code, one query.',
                },
            ],
        },
    ],
};
