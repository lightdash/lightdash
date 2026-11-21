// What people expect to ask across several tools, or a tool joined to the
// company's warehouse, and whether composer answers it today.
import { ApiConnectorType } from '@lightdash/common';
import type { LiveCrossToolUseCases } from './types';

export const crossToolUseCases: LiveCrossToolUseCases = {
    questions: [
        {
            id: 'X-01',
            question:
                "How is this month's total ad spend split across Google, Meta and LinkedIn, and how does each channel's share of spend compare with its share of conversions?",
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-02',
            question:
                'How have blended spend, clicks, conversions and cost per conversion across all ad platforms trended month by month over the last 12 months?',
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-03',
            question:
                'Across Google, Meta and LinkedIn, which campaigns had the lowest and highest cost per conversion last month?',
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-04',
            question:
                "Are we on pace to hit this month's paid media budget: spend to date versus budget per channel, and projected month-end spend at the current daily run rate?",
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-05',
            question:
                'Which campaigns on any platform are over or under their campaign-level budget this month, and how does that compare with how they were pacing at the same point last month?',
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-06',
            question:
                'Blended cost per conversion went up week over week: which platform, and which campaigns within it, account for most of the change?',
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-07',
            question:
                'Which ad creatives perform best on each platform, and does the same creative concept win on Google, Meta and LinkedIn?',
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-08',
            question:
                'Which live ads on any platform point to a landing page URL with no utm_source or utm_campaign tag, and how much have they spent?',
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-09',
            question:
                'Which ad campaigns across Google, Meta and LinkedIn produced the most closed-won revenue last quarter, and what was the ROI and cost per contact of each?',
            possible: false,
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-10',
            question:
                'For each LinkedIn campaign, how many leads, open opportunities and closed-won deals did it generate, and what are its lead conversion rate, win rate, days to close, pipeline amount and ROAS?',
            possible: false,
            tools: [ApiConnectorType.SALESFORCE, ApiConnectorType.LINKEDIN_ADS],
        },
        {
            id: 'X-11',
            question:
                'Which closed-won accounts saw or engaged with a LinkedIn ad before their deal was created, even though nobody at the account clicked?',
            possible: false,
            tools: [ApiConnectorType.HUBSPOT, ApiConnectorType.LINKEDIN_ADS],
        },
        {
            id: 'X-12',
            question:
                "How much of each closed-won opportunity's amount is credited to each paid campaign, and how does the campaign ranking change between first-touch, last-touch and even-split?",
            possible: false,
            tools: [
                ApiConnectorType.SALESFORCE,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
        },
        {
            id: 'X-13',
            question:
                'Which Google Ads campaigns and keywords lead to qualified opportunities and won deals rather than just form fills, and what is the cost per qualified opportunity?',
            possible: false,
            tools: [ApiConnectorType.SALESFORCE, ApiConnectorType.GOOGLE_ADS],
        },
        {
            id: 'X-14',
            question:
                'For each month of LinkedIn spend, how much won revenue had it produced after 30, 90 and 180 days, and has ROAS for older months caught up?',
            possible: true,
            tools: [ApiConnectorType.HUBSPOT, ApiConnectorType.LINKEDIN_ADS],
        },
        {
            id: 'X-15',
            question:
                'Where do prospects drop off between ad impression, ad click, website visit, new lead and customer, by channel and month?',
            possible: true,
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
            ],
        },
        {
            id: 'X-16',
            question:
                'For each paid campaign, how do the spend and clicks the ad platform reports compare with the sessions, key events and purchase value GA4 recorded?',
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
            ],
        },
        {
            id: 'X-17',
            question:
                "What is our cost per signup by campaign when signups are counted from our own product events instead of the ad platforms' reported conversions?",
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.POSTHOG,
            ],
        },
        {
            id: 'X-18',
            question:
                'Which landing pages get a lot of organic search clicks but have a high bounce rate, short sessions or few key events once people arrive?',
            possible: true,
            tools: [ApiConnectorType.GA4, ApiConnectorType.SEARCH_CONSOLE],
        },
        {
            id: 'X-19',
            question:
                'For which search queries are we paying for ads even though we already rank at the top organically, and which queries do we rank for with no ad coverage at all?',
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.SEARCH_CONSOLE,
            ],
        },
        {
            id: 'X-20',
            question:
                'How did combined paid plus organic clicks on our brand terms change in the month after we cut brand bidding compared with the month before?',
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.SEARCH_CONSOLE,
            ],
        },
        {
            id: 'X-21',
            question:
                'Which organic landing pages and search queries ultimately generated deals and revenue, not just visits?',
            possible: false,
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GA4,
                ApiConnectorType.SEARCH_CONSOLE,
            ],
        },
        {
            id: 'X-22',
            question:
                'Which leads who are not yet customers were most active in the product in the last 30 days and have not been contacted by sales?',
            possible: false,
            tools: [ApiConnectorType.HUBSPOT, ApiConnectorType.POSTHOG],
        },
        {
            id: 'X-23',
            question:
                'How does product usage differ between accounts at each open deal stage, and which open deals have gone quiet in the product over the last two weeks?',
            possible: false,
            tools: [ApiConnectorType.HUBSPOT, ApiConnectorType.POSTHOG],
        },
        {
            id: 'X-24',
            question:
                'What share of new signups reach the activation milestone within 7 days, by signup week, and which un-activated workspaces belong to target companies?',
            possible: false,
            tools: [ApiConnectorType.ATTIO, ApiConnectorType.POSTHOG],
        },
        {
            id: 'X-25',
            question:
                'Which accounts renewing in the next 90 days have open or recently escalated support tickets, and how many?',
            possible: true,
            tools: [ApiConnectorType.SALESFORCE, ApiConnectorType.PYLON],
        },
        {
            id: 'X-26',
            question:
                'What are ticket volume, first response time and time to resolution by customer tier and plan this quarter?',
            possible: true,
            tools: [ApiConnectorType.HUBSPOT, ApiConnectorType.PYLON],
        },
        {
            id: 'X-27',
            question:
                "Which accounts' health dropped the most over the last 90 days because product engagement fell against their own baseline while support and meeting contact went quiet?",
            possible: false,
            tools: [
                ApiConnectorType.SALESFORCE,
                ApiConnectorType.POSTHOG,
                ApiConnectorType.PYLON,
            ],
        },
        {
            id: 'X-28',
            question:
                'For bugs reported by customers, how long does it take from the support ticket being opened to the linked GitHub issue being closed, by month?',
            possible: false,
            tools: [ApiConnectorType.PYLON, ApiConnectorType.GITHUB],
        },
        {
            id: 'X-29',
            question:
                'Are GitHub issues that came from customer tickets closed faster or slower than internally found ones, by label and month?',
            possible: true,
            tools: [ApiConnectorType.PYLON, ApiConnectorType.GITHUB],
        },
        {
            id: 'X-30',
            question:
                'After each release, how quickly did usage of the shipped feature grow, and how many accounts adopted it within the first 30 days?',
            possible: false,
            tools: [ApiConnectorType.POSTHOG, ApiConnectorType.GITHUB],
        },
        {
            id: 'X-31',
            question:
                'When our YouTube views and watch time go up, do branded search impressions and website sessions rise in the following weeks?',
            possible: true,
            tools: [
                ApiConnectorType.GA4,
                ApiConnectorType.SEARCH_CONSOLE,
                ApiConnectorType.YOUTUBE_ANALYTICS,
            ],
        },
        {
            id: 'X-32',
            question:
                'Which YouTube ad campaigns hold viewers to 75% completion and also produce website visitors, contacts and attributed deals, ranked by ROAS?',
            possible: false,
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.YOUTUBE_ANALYTICS,
            ],
        },
        {
            id: 'X-33',
            question:
                'Which blog posts and pages were viewed by the most leads who later became MQLs, relative to the traffic each page gets?',
            possible: false,
            tools: [ApiConnectorType.HUBSPOT, ApiConnectorType.GA4],
        },
        {
            id: 'WH-01',
            question:
                'What is ROAS and cost per new customer by channel and month using actual first-order revenue from our orders table rather than platform-reported conversion value?',
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
                'warehouse',
            ],
        },
        {
            id: 'WH-02',
            question:
                'How does the revenue credited to each channel and campaign change between first-touch, last-touch, linear and position-based attribution, and which conversion paths are most common?',
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
                'warehouse',
            ],
        },
        {
            id: 'WH-03',
            question:
                'What is LTV:CAC by ad campaign when lifetime value comes from our subscription revenue, and which campaigns bring long-term customers rather than just signups?',
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                'warehouse',
            ],
        },
        {
            id: 'WH-04',
            question:
                'How many months does each monthly acquisition cohort take to pay back its acquisition cost from gross margin, by acquisition channel?',
            possible: true,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                'warehouse',
            ],
        },
        {
            id: 'WH-05',
            question:
                'How much MRR do we have from customers acquired through each marketing channel or lead source, and how has that mix changed over the last 12 months?',
            possible: false,
            tools: [ApiConnectorType.HUBSPOT, 'warehouse'],
        },
        {
            id: 'WH-06',
            question:
                'What are gross and net revenue retention by industry, company size and account owner over the last four quarters?',
            possible: true,
            tools: [ApiConnectorType.SALESFORCE, 'warehouse'],
        },
        {
            id: 'WH-07',
            question:
                'Do accounts with four or more active users in their first month churn less over the following year than accounts with three or fewer?',
            possible: true,
            tools: [ApiConnectorType.POSTHOG, 'warehouse'],
        },
        {
            id: 'WH-08',
            question:
                'Which in-app actions during the trial are linked to higher trial-to-paid conversion and higher lifetime value?',
            possible: true,
            tools: [ApiConnectorType.POSTHOG, 'warehouse'],
        },
        {
            id: 'WH-09',
            question:
                'Which paying accounts have had no product activity in the last 14 days, how much MRR does each represent, and who owns them?',
            possible: true,
            tools: [
                ApiConnectorType.ATTIO,
                ApiConnectorType.POSTHOG,
                'warehouse',
            ],
        },
        {
            id: 'WH-10',
            question:
                'How much expansion MRR came from seat growth this quarter compared with last quarter, and which accounts are at or near their seat limit with no open expansion deal?',
            possible: true,
            tools: [
                ApiConnectorType.ATTIO,
                ApiConnectorType.POSTHOG,
                'warehouse',
            ],
        },
        {
            id: 'WH-11',
            question:
                'Which accounts consume the most support (tickets and agent time) relative to the revenue they pay us, and what is support cost per account by plan?',
            possible: true,
            tools: [ApiConnectorType.PYLON, 'warehouse'],
        },
        {
            id: 'WH-12',
            question:
                'What did the health score say 90 days before each churned account cancelled, and how many accounts flagged red 90 days ago actually churned?',
            possible: true,
            tools: [
                ApiConnectorType.POSTHOG,
                ApiConnectorType.PYLON,
                'warehouse',
            ],
        },
        {
            id: 'WH-13',
            question:
                'Did ticket volume, ticket age or severity rise in the 60 days before accounts churned or downgraded, compared with accounts that renewed?',
            possible: true,
            tools: [ApiConnectorType.PYLON, 'warehouse'],
        },
        {
            id: 'WH-14',
            question:
                'How do closed-won bookings in the CRM compare each month with the new and expansion MRR that actually started billing?',
            possible: true,
            tools: [ApiConnectorType.SALESFORCE, 'warehouse'],
        },
        {
            id: 'WH-15',
            question:
                'How accurate was our forecast: what did open pipeline and forecast category look like on the first day of each quarter, and how much of it turned into invoiced revenue?',
            possible: false,
            tools: [ApiConnectorType.HUBSPOT, 'warehouse'],
        },
        {
            id: 'WH-16',
            question:
                'What is our fully loaded cost to acquire an MQL, an SQL and a new customer each quarter (ad spend plus salaries and tools), and how does CAC compare with average contract value?',
            possible: true,
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                'warehouse',
            ],
        },
        {
            id: 'WH-17',
            question:
                'Show me everything about one customer in one place: plan and MRR, last invoices, open deals, open tickets and marketing engagement.',
            possible: true,
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.PYLON,
                'warehouse',
            ],
        },
        {
            id: 'WH-18',
            question:
                "On average how many days pass between a user's first campaign touch and their first payment, and what are first-touch versus last-touch CAC and ROAS per campaign?",
            possible: false,
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.POSTHOG,
                'warehouse',
            ],
        },
        {
            id: 'WH-19',
            question:
                'How much ARR sits in red-health accounts that renew this quarter, and which green accounts are ready for an expansion conversation?',
            possible: true,
            tools: [
                ApiConnectorType.SALESFORCE,
                ApiConnectorType.PYLON,
                'warehouse',
            ],
        },
        {
            id: 'WH-20',
            question:
                'Which open GitHub issues are linked to the most customer tickets, and how much MRR do the affected accounts represent?',
            possible: false,
            tools: [
                ApiConnectorType.PYLON,
                ApiConnectorType.GITHUB,
                'warehouse',
            ],
        },
    ],
    dashboards: [
        {
            id: 'DB-43',
            name: 'Paid channel mix overview',
            purpose:
                'Monthly channel review: how cost is divided between paid channels and which channel wins on CPC, clicks, impressions and conversions.',
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
            charts: [
                {
                    id: 'DB-43.1',
                    title: 'Cost split by channel',
                    detail: 'share of total cost per channel',
                    possible: true,
                },
                {
                    id: 'DB-43.2',
                    title: 'Cost by channel, month to month',
                    detail: 'monthly cost per channel',
                    possible: true,
                },
                {
                    id: 'DB-43.3',
                    title: 'Clicks',
                    detail: 'total ad clicks across channels',
                    possible: true,
                },
                {
                    id: 'DB-43.4',
                    title: 'CPC by channel',
                    detail: 'channel with the lowest CPC',
                    possible: true,
                },
                {
                    id: 'DB-43.5',
                    title: 'Website conversions by channel',
                    detail: 'channel driving the most website conversions',
                    possible: true,
                },
                {
                    id: 'DB-43.6',
                    title: 'Impressions by channel',
                    detail: 'channel earning the most impressions',
                    possible: true,
                },
                {
                    id: 'DB-43.7',
                    title: 'Channel comparison, last month',
                    detail: 'cost, impressions, clicks, CPC and conversions side by side per channel',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-44',
            name: 'PPC monthly budget pacing',
            purpose:
                'Mid-month budget check: is each channel and campaign group on pace against its monthly budget, and will we overspend.',
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
            charts: [
                {
                    id: 'DB-44.1',
                    title: 'Total budget',
                    detail: 'monthly budget across channels (budget entered alongside the ad data)',
                    possible: true,
                },
                {
                    id: 'DB-44.2',
                    title: 'Amount spent',
                    detail: 'spend to date this month',
                    possible: true,
                },
                {
                    id: 'DB-44.3',
                    title: 'Remaining budget',
                    detail: 'budget minus spend to date',
                    possible: true,
                },
                {
                    id: 'DB-44.4',
                    title: 'Predicted spend',
                    detail: 'projected month-end spend with overspend alert',
                    possible: true,
                },
                {
                    id: 'DB-44.5',
                    title: 'Daily average cost',
                    detail: 'average spend per day this month',
                    possible: true,
                },
                {
                    id: 'DB-44.6',
                    title: 'Amount Spent vs. Budget Monthly',
                    detail: 'spend against budget per month',
                    possible: true,
                },
                {
                    id: 'DB-44.7',
                    title: 'Budget Remaining by Month and Source',
                    detail: 'remaining budget per month and ad platform',
                    possible: true,
                },
                {
                    id: 'DB-44.8',
                    title: 'Spending over time',
                    detail: 'daily spend across platforms',
                    possible: true,
                },
                {
                    id: 'DB-44.9',
                    title: 'Monthly Budget Overview',
                    detail: 'per campaign group: budget, spent, remaining, predicted spend, daily trend',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-45',
            name: 'PPC client report',
            purpose:
                'Monthly agency report to a client covering every paid platform, with a written summary and progress against goals and budget.',
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
            ],
            charts: [
                {
                    id: 'DB-45.1',
                    title: 'Performance overview',
                    detail: 'high-level trends across all PPC campaigns',
                    possible: true,
                },
                {
                    id: 'DB-45.2',
                    title: 'Google Ads KPIs',
                    detail: 'conversions, cost, impressions, clicks, CTR, CPC, cost per conversion',
                    possible: true,
                },
                {
                    id: 'DB-45.3',
                    title: 'Google Ads campaigns and ad groups',
                    detail: 'the same metrics per campaign and ad group',
                    possible: true,
                },
                {
                    id: 'DB-45.4',
                    title: 'Facebook Ads KPIs',
                    detail: 'clicks, CPC, CTR, CPM, impressions',
                    possible: true,
                },
                {
                    id: 'DB-45.5',
                    title: 'Facebook Ads campaigns and ads',
                    detail: 'campaign and ad-level detail',
                    possible: true,
                },
                {
                    id: 'DB-45.6',
                    title: 'LinkedIn Ads KPIs',
                    detail: 'clicks, conversions, spend, impressions, engagement',
                    possible: true,
                },
                {
                    id: 'DB-45.7',
                    title: 'Goal and budget tracking',
                    detail: 'progress toward goals, budgets and milestones: are campaigns pacing correctly',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-46',
            name: 'Customer acquisition funnel (ads to website to CRM)',
            purpose:
                'Monthly marketing review: see where prospects drop off between ad impression, site visit and CRM lead, and which channels and campaigns to fund.',
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
            ],
            charts: [
                {
                    id: 'DB-46.1',
                    title: 'Impressions, clicks and amount spent',
                    detail: 'sum of impressions, clicks and spend unioned across all connected ad platforms for the period; no join, one row per platform per day',
                    possible: true,
                },
                {
                    id: 'DB-46.2',
                    title: 'Total users and new users',
                    detail: 'GA4 total users and new users for the same date range; placed next to ad totals, matched only on date',
                    possible: true,
                },
                {
                    id: 'DB-46.3',
                    title: 'Leads generated',
                    detail: 'count of HubSpot contacts created in the period from all marketing touchpoints',
                    possible: true,
                },
                {
                    id: 'DB-46.4',
                    title: 'Multi-source acquisition funnel',
                    detail: "impressions (ad platforms) to clicks (ad platforms) to website users (GA4) to leads (HubSpot) to customers (HubSpot), with conversion rate between each stage; stages aligned by date and by channel (utm_source/utm_medium mapped to ad platform and to the contact's original source)",
                    possible: true,
                },
                {
                    id: 'DB-46.5',
                    title: 'Funnel performance over time',
                    detail: 'each funnel stage count and stage-to-stage conversion rate by month',
                    possible: true,
                },
                {
                    id: 'DB-46.6',
                    title: 'Channel performance and attribution',
                    detail: 'per channel: spend and clicks from the ad platform, users from GA4 by session source/medium, leads and customers from HubSpot by contact source; joined on channel',
                    possible: true,
                },
                {
                    id: 'DB-46.7',
                    title: 'Geographic funnel performance',
                    detail: 'funnel conversion by country or region: ad geo breakdown, GA4 country and HubSpot contact country joined on country',
                    possible: false,
                },
                {
                    id: 'DB-46.8',
                    title: 'Campaign ROI and spend efficiency',
                    detail: 'per campaign: spend vs leads and conversions, cost per lead; ad campaign name or id matched to utm_campaign on the GA4 session and on the HubSpot contact',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-47',
            name: 'Paid ads ROAS: spend to pipeline to revenue',
            purpose:
                'Decide which ad networks and campaigns deserve budget based on attributed deals and revenue rather than platform conversions.',
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
            ],
            charts: [
                {
                    id: 'DB-47.1',
                    title: 'Cost, impressions and clicks',
                    detail: 'totals pulled straight from the ad network integrations, with CPM, CTR and CPC derived',
                    possible: true,
                },
                {
                    id: 'DB-47.2',
                    title: 'Visitors, contacts and companies from paid',
                    detail: "unique website visitors whose session came from a paid network (utm/click id on the session); contacts = visitors matched to an email; companies = contact's company or CRM company matched to anonymous traffic by domain",
                    possible: true,
                },
                {
                    id: 'DB-47.3',
                    title: 'Influenced deals and influenced value',
                    detail: 'CRM deals (at the selected stage) whose journey contains at least one paid touchpoint, and their amount; ignores the attribution model',
                    possible: false,
                },
                {
                    id: 'DB-47.4',
                    title: 'Attributed deals and value',
                    detail: 'deal count and amount credited to paid sessions under the selected model (first, last, linear, U, W, data-driven); fractional for multi-touch',
                    possible: false,
                },
                {
                    id: 'DB-47.5',
                    title: 'CPA and ROAS',
                    detail: 'CPA = ad cost / attributed deals; ROAS = attributed revenue / ad cost; cost joined to deals via campaign on the session',
                    possible: true,
                },
                {
                    id: 'DB-47.6',
                    title: 'Cost over time',
                    detail: 'ad spend by ad network per week or month',
                    possible: true,
                },
                {
                    id: 'DB-47.7',
                    title: 'Return on ad spend by ad network over time',
                    detail: 'ROAS per ad network per period of spend, showing how long spend takes to produce a return',
                    possible: true,
                },
                {
                    id: 'DB-47.8',
                    title: 'Ad network performance over time',
                    detail: 'per network per period: cost, impressions, clicks, visitors, contacts, companies, influenced deals, deals, value, CPA, ROAS; drill-down to the accounts behind pipeline numbers',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-48',
            name: 'LinkedIn Ads and account influence (B2B / ABM)',
            purpose:
                'Show how much pipeline and revenue LinkedIn contributes, including accounts that saw ads but never clicked, to defend and steer LinkedIn budget.',
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
            ],
            charts: [
                {
                    id: 'DB-48.1',
                    title: 'Overall paid performance by source',
                    detail: 'LinkedIn vs every other source: visitors (web), MQLs, call bookings and new purchases (CRM), total spend, impressions and CPC (ad platforms), cost per meeting and CAC; joined on traffic source',
                    possible: true,
                },
                {
                    id: 'DB-48.2',
                    title: 'Cost per call booking trend',
                    detail: 'bookings from paid sources, total spend, CAC and cost per booking over time',
                    possible: false,
                },
                {
                    id: 'DB-48.3',
                    title: 'LinkedIn ad creative performance',
                    detail: 'per creative: spend, impressions, clicks (LinkedIn) with deals created, cost per deal and cost per lead (CRM); creative id carried on the click/utm to the contact',
                    possible: false,
                },
                {
                    id: 'DB-48.4',
                    title: 'Incremental lift of LinkedIn campaigns',
                    detail: 'deals created in accounts exposed to a campaign vs a retroactive control group of unexposed accounts; exposure from LinkedIn company-level impressions matched to CRM accounts by company name/domain',
                    possible: false,
                },
                {
                    id: 'DB-48.5',
                    title: 'Won deals with LinkedIn ad engagements',
                    detail: 'closed-won deals whose account clicked, watched, liked, commented on or shared a LinkedIn ad; LinkedIn company engagement matched to the CRM account',
                    possible: false,
                },
                {
                    id: 'DB-48.6',
                    title: 'LinkedIn campaigns that influenced won deals',
                    detail: 'average impressions per account by campaign for accounts with a won deal, sortable to find high-influence campaigns',
                    possible: false,
                },
                {
                    id: 'DB-48.7',
                    title: 'Account journeys of high-intent buyers who saw LinkedIn impressions',
                    detail: 'per account timeline: LinkedIn impressions (no click) followed by direct website visits and the CRM conversion',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-49',
            name: 'SEO landing page performance',
            purpose:
                'Find pages that win search traffic but fail to engage or convert, and top pages worth replicating.',
            tools: [ApiConnectorType.GA4, ApiConnectorType.SEARCH_CONSOLE],
            charts: [
                {
                    id: 'DB-49.1',
                    title: 'Search visibility by landing page',
                    detail: 'Search Console impressions and average position per page',
                    possible: true,
                },
                {
                    id: 'DB-49.2',
                    title: 'Clicks and CTR by landing page',
                    detail: 'Search Console clicks and CTR per page',
                    possible: true,
                },
                {
                    id: 'DB-49.3',
                    title: 'Users and sessions by landing page',
                    detail: 'GA4 total users and sessions per landing page, joined to the Search Console page on the normalised landing page URL',
                    possible: true,
                },
                {
                    id: 'DB-49.4',
                    title: 'Bounce rate and session duration for top-clicked pages',
                    detail: 'for pages with the most search clicks: GA4 bounce rate and average session duration next to clicks; URL join',
                    possible: true,
                },
                {
                    id: 'DB-49.5',
                    title: 'Key event engagement by landing page',
                    detail: 'count of the selected GA4 key event per landing page (key event chosen from a drop-down), next to search clicks',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-50',
            name: 'Paid and organic search',
            purpose:
                'Decide where to add or cut search ads by seeing ad and organic performance side by side for the same queries.',
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.SEARCH_CONSOLE,
            ],
            charts: [
                {
                    id: 'DB-50.1',
                    title: 'Ads performance by search query',
                    detail: 'ad clicks, ad impressions, ad CTR and average CPC per search query (text ads only); optional keyword, ad group and campaign columns',
                    possible: false,
                },
                {
                    id: 'DB-50.2',
                    title: 'Organic performance by search query',
                    detail: 'organic clicks, organic queries, organic clicks per query and listings per query from the linked Search Console property',
                    possible: true,
                },
                {
                    id: 'DB-50.3',
                    title: 'Combined ads and organic by search query',
                    detail: 'ads-and-organic clicks, queries and clicks per query; ad and organic rows matched on the search query text and date',
                    possible: false,
                },
                {
                    id: 'DB-50.4',
                    title: 'Queries with organic presence but no ads',
                    detail: 'queries where the site appears organically and ad impressions = 0 (new keyword candidates)',
                    possible: false,
                },
                {
                    id: 'DB-50.5',
                    title: 'High-value queries with low organic traffic',
                    detail: 'brand or product queries with few organic clicks, to target with paid ads',
                    possible: true,
                },
                {
                    id: 'DB-50.6',
                    title: 'Effect of a change on ads, organic and combined traffic',
                    detail: 'ads, organic and combined clicks before and after a website, bid, budget or keyword change',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-51',
            name: 'Marketing acquisition and attribution (channel to pipeline)',
            purpose:
                'Quarterly pipeline review: which channels, campaigns and pages preceded deals reaching a chosen stage, under a chosen attribution model.',
            tools: [
                ApiConnectorType.SALESFORCE,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
            ],
            charts: [
                {
                    id: 'DB-51.1',
                    title: 'Deals and value at selected stage',
                    detail: 'count and amount of CRM deals/opportunities that reached the selected stage in the date range (expected revenue for open, actual for won)',
                    possible: false,
                },
                {
                    id: 'DB-51.2',
                    title: 'Influenced deals and value',
                    detail: 'deals whose contacts or company had web sessions before the stage milestone, weighted by attribution model; visitor matched to contact by email, contact to account by domain',
                    possible: false,
                },
                {
                    id: 'DB-51.3',
                    title: 'Attributable deals and value',
                    detail: 'subset of deals with recorded session history, credit split across sessions by the selected model',
                    possible: false,
                },
                {
                    id: 'DB-51.4',
                    title: 'Deals by channel over time',
                    detail: 'attributed deals and value per channel per period',
                    possible: false,
                },
                {
                    id: 'DB-51.5',
                    title: 'Performance by channel',
                    detail: 'attributed and influenced deals and value per channel (session channel grouping)',
                    possible: false,
                },
                {
                    id: 'DB-51.6',
                    title: 'Performance by source, campaign and ad group',
                    detail: 'same metrics per ad network, campaign and ad group; utm_campaign / campaign id on the session',
                    possible: false,
                },
                {
                    id: 'DB-51.7',
                    title: 'Performance by URL and referrer',
                    detail: 'same metrics per landing URL, referrer and host',
                    possible: false,
                },
                {
                    id: 'DB-51.8',
                    title: 'Performance by country, device and operating system',
                    detail: 'same metrics per visitor country, device and OS',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-52',
            name: 'Customer acquisition cost (unit economics)',
            purpose:
                'Board and planning view: is the cost of acquiring an MQL, SQL and new customer rising, and is it justified by contract value.',
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                'warehouse',
            ],
            charts: [
                {
                    id: 'DB-52.1',
                    title: 'CAC over time by stage',
                    detail: 'total cost / number of records reaching each of three chosen stages (e.g. MQL, SQL, new business) per month or quarter; total cost = ad spend from ad integrations + salaries, tools and other fixed costs from an imported finance sheet/warehouse table; stage counts from CRM stage dates',
                    possible: true,
                },
                {
                    id: 'DB-52.2',
                    title: 'Count over time by stage',
                    detail: 'number of leads or customers reaching each stage per month or quarter (CRM stage history)',
                    possible: true,
                },
                {
                    id: 'DB-52.3',
                    title: 'Cost over time by type',
                    detail: 'total acquisition cost per period grouped by cost type (paid campaigns, salaries, tech subscriptions)',
                    possible: true,
                },
                {
                    id: 'DB-52.4',
                    title: 'CAC / ACV ratio',
                    detail: 'CAC divided by average value at each stage (average deal value from CRM, or a manually entered value for early stages)',
                    possible: true,
                },
                {
                    id: 'DB-52.5',
                    title: 'CAC table',
                    detail: 'cost and CAC per month or quarter by cost type, last 8 quarters',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-53',
            name: 'Multi-touch marketing attribution on warehouse conversions',
            purpose:
                'Compare attribution models on real conversions and revenue to set channel and campaign budgets.',
            tools: [
                ApiConnectorType.GOOGLE_ADS,
                ApiConnectorType.META_ADS,
                ApiConnectorType.LINKEDIN_ADS,
                ApiConnectorType.GA4,
                'warehouse',
            ],
            charts: [
                {
                    id: 'DB-53.1',
                    title: 'Attribution overview with ROAS',
                    detail: 'per channel and campaign: spend, attributed conversions and revenue and ROAS under each model (first touch, last touch, position-based, linear); spend table joined on channel and campaign within the lookback window; conversions come from the warehouse conversions source',
                    possible: false,
                },
                {
                    id: 'DB-53.2',
                    title: 'Channel attributions',
                    detail: 'conversion value credited to each channel per model; web sessions stitched to the converting user (anonymous id to user_id)',
                    possible: false,
                },
                {
                    id: 'DB-53.3',
                    title: 'Campaign attributions',
                    detail: 'conversion value credited to each campaign per model',
                    possible: false,
                },
                {
                    id: 'DB-53.4',
                    title: 'Path summary',
                    detail: 'each distinct channel path with its number of conversions, non-conversions and revenue',
                    possible: false,
                },
                {
                    id: 'DB-53.5',
                    title: 'Paths to conversion',
                    detail: 'one row per converting customer: customer id, conversion value and time, and the ordered channel/campaign path before it',
                    possible: false,
                },
                {
                    id: 'DB-53.6',
                    title: 'Paths to non-conversion',
                    detail: 'paths of users who did not convert, for comparison with converting paths',
                    possible: false,
                },
            ],
        },
        {
            id: 'DB-54',
            name: 'Product-led growth: activation, expansion and renewals',
            purpose:
                'Weekly sales and customer-success review of self-serve signups: who to help activate, who is ready to expand, who is at risk before renewal.',
            tools: [
                ApiConnectorType.ATTIO,
                ApiConnectorType.POSTHOG,
                'warehouse',
            ],
            charts: [
                {
                    id: 'DB-54.1',
                    title: 'Trial-to-paid conversion',
                    detail: 'share of signed-up workspaces that convert to a paid subscription, by signup cohort; signup from the product database synced to the CRM Workspace object, paid status from billing, joined on workspace id',
                    possible: true,
                },
                {
                    id: 'DB-54.2',
                    title: 'Segments below activation targets',
                    detail: 'segments of workspaces whose activation/trial conversion is under target; product usage events joined to Workspace and Company (domain)',
                    possible: true,
                },
                {
                    id: 'DB-54.3',
                    title: 'Seat adoption',
                    detail: 'seats used vs seats licensed per workspace; usage from the product database, licence from billing',
                    possible: true,
                },
                {
                    id: 'DB-54.4',
                    title: 'Expansion ARR against quarterly goal',
                    detail: 'expansion ARR this quarter (billing MRR movements) vs the quarterly goal',
                    possible: true,
                },
                {
                    id: 'DB-54.5',
                    title: 'Renewal cohorts',
                    detail: 'accounts grouped by renewal month with renewed / churned outcome; renewal date on the CRM record, outcome from billing',
                    possible: true,
                },
                {
                    id: 'DB-54.6',
                    title: 'At-risk accounts',
                    detail: 'accounts flagged by low usage relative to licence ahead of renewal, with owner; usage and licence data joined on workspace id',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-55',
            name: 'Customer health overview',
            purpose:
                'Weekly customer-success review: how much revenue is at risk, which accounts moved tier and who has gone quiet.',
            tools: [
                ApiConnectorType.SALESFORCE,
                ApiConnectorType.POSTHOG,
                ApiConnectorType.PYLON,
                'warehouse',
            ],
            charts: [
                {
                    id: 'DB-55.1',
                    title: 'Accounts by risk tier',
                    detail: 'count of accounts per health tier (80+ healthy, 60-79 watch, under 60 at risk); score built from product usage, support and conversation activity per account id',
                    possible: true,
                },
                {
                    id: 'DB-55.2',
                    title: 'MRR by risk tier',
                    detail: 'billing MRR summed per health tier; account joined to the billing customer (reconciled against billing, not the CS tool)',
                    possible: true,
                },
                {
                    id: 'DB-55.3',
                    title: 'Median health score by segment',
                    detail: 'median score per CRM segment',
                    possible: true,
                },
                {
                    id: 'DB-55.4',
                    title: 'Accounts that changed tier this month',
                    detail: 'accounts whose tier now differs from the tier at the start of the month; needs daily or monthly score snapshots',
                    possible: true,
                },
                {
                    id: 'DB-55.5',
                    title: 'Biggest score gains and drops this month',
                    detail: 'accounts ranked by change in score over the month',
                    possible: true,
                },
                {
                    id: 'DB-55.6',
                    title: 'Score trend for top 10 accounts by MRR',
                    detail: 'health score per week for the ten largest accounts by billing MRR',
                    possible: true,
                },
                {
                    id: 'DB-55.7',
                    title: 'Accounts crossing into the at-risk tier',
                    detail: 'accounts that fell below the at-risk threshold in the period, with owner',
                    possible: true,
                },
                {
                    id: 'DB-55.8',
                    title: 'Days since last conversation by account',
                    detail: 'days since the last support or CS conversation per account; flags accounts with none in 30 days',
                    possible: true,
                },
                {
                    id: 'DB-55.9',
                    title: 'Accounts and MRR per CSM',
                    detail: 'account count and summed MRR per account owner',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-56',
            name: 'SaaS executive KPI overview',
            purpose:
                'Leadership and investor view so every leader works from the same recurring-revenue, retention and acquisition numbers.',
            tools: [
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.GA4,
                ApiConnectorType.POSTHOG,
                ApiConnectorType.PYLON,
                'warehouse',
            ],
            charts: [
                {
                    id: 'DB-56.1',
                    title: 'Monthly recurring revenue',
                    detail: 'MRR from billing with new MRR and net new MRR per month',
                    possible: true,
                },
                {
                    id: 'DB-56.2',
                    title: 'Annual recurring revenue',
                    detail: 'ARR from billing subscriptions',
                    possible: true,
                },
                {
                    id: 'DB-56.3',
                    title: 'Customer churn rate',
                    detail: 'customers lost / customers at start of period, from billing',
                    possible: true,
                },
                {
                    id: 'DB-56.4',
                    title: 'Net revenue retention',
                    detail: 'MRR now from the cohort of customers active a year ago / their MRR then (includes expansion)',
                    possible: true,
                },
                {
                    id: 'DB-56.5',
                    title: 'Customer lifetime value',
                    detail: 'average revenue per account / churn rate, from billing',
                    possible: true,
                },
                {
                    id: 'DB-56.6',
                    title: 'Customer acquisition cost and LTV:CAC',
                    detail: 'sales and marketing cost (ad spend + finance cost lines) / new customers won (CRM closed-won or new billing customers), and LTV divided by CAC',
                    possible: true,
                },
                {
                    id: 'DB-56.7',
                    title: 'Lead-to-win conversion rate',
                    detail: 'CRM leads created that became closed-won customers, by lead cohort',
                    possible: true,
                },
            ],
        },
        {
            id: 'DB-57',
            name: 'SaaS daily snapshot',
            purpose:
                'Daily company-wide check on revenue momentum and whether new trials are sticking.',
            tools: [ApiConnectorType.POSTHOG, 'warehouse'],
            charts: [
                {
                    id: 'DB-57.1',
                    title: 'New MRR this month',
                    detail: 'new MRR month to date from billing',
                    possible: true,
                },
                {
                    id: 'DB-57.2',
                    title: 'Total MRR',
                    detail: 'current MRR from billing',
                    possible: true,
                },
                {
                    id: 'DB-57.3',
                    title: 'Recent MRR changes',
                    detail: 'latest MRR movements (new, upgrade, downgrade, churn) with customer name and amount',
                    possible: true,
                },
                {
                    id: 'DB-57.4',
                    title: 'Free-trial signups',
                    detail: 'trial signups per day from the product database / signup events',
                    possible: true,
                },
                {
                    id: 'DB-57.5',
                    title: 'Trialists still active on day 2',
                    detail: "share of each day's trial signups with product activity on day 2; signup joined to product events on user id",
                    possible: true,
                },
                {
                    id: 'DB-57.6',
                    title: 'DAU / MAU ratio',
                    detail: 'daily active users / monthly active users from product events',
                    possible: true,
                },
            ],
        },
    ],
};
