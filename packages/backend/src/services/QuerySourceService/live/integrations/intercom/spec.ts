// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import { type LiveIntegrationSpec, type LiveUseCases } from '../../sdk';

export const intercomUseCases: LiveUseCases = {
    questions: [
        {
            id: 'intercom-q-1',
            question:
                'How many conversations were created each week over the last quarter?',
            possible: true,
        },
        {
            id: 'intercom-q-2',
            question:
                'How many conversations came in through each channel (chat, email, WhatsApp, phone) this month?',
            possible: true,
        },
        {
            id: 'intercom-q-3',
            question:
                'What was the median time to first teammate reply each week over the last 12 weeks?',
            possible: true,
        },
        {
            id: 'intercom-q-4',
            question:
                'What was the median first response time each week, counted in office hours only?',
            possible: false,
        },
        {
            id: 'intercom-q-5',
            question:
                'What is the median time to close a conversation, by team inbox, this quarter?',
            possible: true,
        },
        {
            id: 'intercom-q-6',
            question:
                'How many conversations did each teammate close this month?',
            possible: true,
        },
        {
            id: 'intercom-q-7',
            question: 'How many replies did each teammate send this week?',
            possible: false,
        },
        {
            id: 'intercom-q-8',
            question: 'What is our CSAT score this month, by teammate?',
            possible: true,
        },
        {
            id: 'intercom-q-9',
            question:
                'How many conversations are open, snoozed and unassigned right now, by team inbox?',
            possible: true,
        },
        {
            id: 'intercom-q-10',
            question:
                'What share of conversations did the Fin AI agent resolve this month?',
            possible: true,
        },
        {
            id: 'intercom-q-11',
            question:
                'What share of conversations did Fin take part in, week by week?',
            possible: true,
        },
        {
            id: 'intercom-q-12',
            question:
                'How many Fin conversations were escalated to a teammate each week?',
            possible: true,
        },
        {
            id: 'intercom-q-13',
            question:
                'What rating do customers give Fin, compared with human teammates?',
            possible: true,
        },
        {
            id: 'intercom-q-14',
            question:
                'Which tags were applied to the most conversations this quarter?',
            possible: false,
        },
        {
            id: 'intercom-q-15',
            question: 'Which topics drove the most conversations last month?',
            possible: false,
        },
        {
            id: 'intercom-q-16',
            question:
                'Which 10 companies raised the most conversations this quarter?',
            possible: false,
        },
        {
            id: 'intercom-q-17',
            question:
                'How many conversations missed their SLA this month, by SLA?',
            possible: true,
        },
        {
            id: 'intercom-q-18',
            question:
                'How many conversations were reopened at least once last month, and by which team?',
            possible: true,
        },
        {
            id: 'intercom-q-19',
            question:
                'At which hours of the day and days of the week do conversations arrive?',
            possible: false,
        },
        {
            id: 'intercom-q-20',
            question:
                'Which open conversations have waited longest for a teammate reply?',
            possible: true,
        },
        {
            id: 'intercom-q-21',
            question:
                'Which conversations got a 1 or 2 star rating this week, and what did the customer write?',
            possible: true,
        },
        {
            id: 'intercom-q-22',
            question:
                'How many tickets of each ticket type are in each state right now?',
            possible: true,
        },
        {
            id: 'intercom-q-23',
            question:
                'How many tickets were created versus resolved each week?',
            possible: false,
        },
        {
            id: 'intercom-q-24',
            question:
                'What is the median time to resolve a ticket, by ticket type?',
            possible: false,
        },
        {
            id: 'intercom-q-25',
            question:
                'How many new leads and users were created each week this quarter?',
            possible: true,
        },
        {
            id: 'intercom-q-26',
            question:
                'How many users are on each plan, from a custom attribute?',
            possible: true,
        },
        {
            id: 'intercom-q-27',
            question: 'Which help center articles were viewed most last month?',
            possible: false,
        },
        {
            id: 'intercom-q-28',
            question:
                'What are the open and click rates of our outbound messages and series?',
            possible: false,
        },
        {
            id: 'intercom-q-29',
            question: 'How much handling time did each teammate log this week?',
            possible: true,
        },
        {
            id: 'intercom-q-30',
            question:
                'How does conversation volume by team compare this quarter with last quarter?',
            possible: true,
        },
    ],
    dashboards: [
        {
            id: 'intercom-d-1',
            name: 'Support volume',
            purpose:
                "Support lead's weekly review: how much comes in, through which channel, about what, and what is waiting now.",
            charts: [
                {
                    id: 'intercom-d-1-c-1',
                    title: 'Conversations per week',
                    detail: 'conversations created per week',
                    possible: true,
                },
                {
                    id: 'intercom-d-1-c-2',
                    title: 'Conversations by channel',
                    detail: 'conversation count by source type',
                    possible: true,
                },
                {
                    id: 'intercom-d-1-c-3',
                    title: 'Conversations by tag',
                    detail: 'conversation count by tag',
                    possible: false,
                },
                {
                    id: 'intercom-d-1-c-4',
                    title: 'Open now by team inbox',
                    detail: 'open, snoozed and unassigned counts by team',
                    possible: true,
                },
                {
                    id: 'intercom-d-1-c-5',
                    title: 'Arrival heatmap',
                    detail: 'conversations by hour of day and weekday',
                    possible: false,
                },
            ],
        },
        {
            id: 'intercom-d-2',
            name: 'Responsiveness',
            purpose:
                'Support ops checks whether customers get answers fast enough and where SLAs slip.',
            charts: [
                {
                    id: 'intercom-d-2-c-1',
                    title: 'Median first response',
                    detail: 'median time to first teammate reply per week',
                    possible: true,
                },
                {
                    id: 'intercom-d-2-c-2',
                    title: 'Median time to close by team',
                    detail: 'median time to last close by team inbox',
                    possible: true,
                },
                {
                    id: 'intercom-d-2-c-3',
                    title: 'Office-hours response time',
                    detail: 'median first response in office hours',
                    possible: false,
                },
                {
                    id: 'intercom-d-2-c-4',
                    title: 'SLA misses',
                    detail: 'conversations that missed each SLA this month',
                    possible: true,
                },
            ],
        },
        {
            id: 'intercom-d-3',
            name: 'Team performance',
            purpose:
                "Team leads compare teammates' output and quality each month.",
            charts: [
                {
                    id: 'intercom-d-3-c-1',
                    title: 'Closed per teammate',
                    detail: 'conversations last closed by each teammate',
                    possible: true,
                },
                {
                    id: 'intercom-d-3-c-2',
                    title: 'CSAT per teammate',
                    detail: 'average rating per rated teammate',
                    possible: true,
                },
                {
                    id: 'intercom-d-3-c-3',
                    title: 'Median first response per teammate',
                    detail: 'median time to first reply by assignee',
                    possible: true,
                },
                {
                    id: 'intercom-d-3-c-4',
                    title: 'Replies per teammate',
                    detail: 'replies sent per teammate',
                    possible: false,
                },
            ],
        },
        {
            id: 'intercom-d-4',
            name: 'Customer satisfaction',
            purpose: 'Head of support tracks CSAT and reads the worst ratings.',
            charts: [
                {
                    id: 'intercom-d-4-c-1',
                    title: 'CSAT over time',
                    detail: 'share of 4 and 5 star ratings per week',
                    possible: true,
                },
                {
                    id: 'intercom-d-4-c-2',
                    title: 'Rating distribution',
                    detail: 'count of ratings 1 to 5',
                    possible: true,
                },
                {
                    id: 'intercom-d-4-c-3',
                    title: 'Low ratings',
                    detail: '1 and 2 star conversations with remarks',
                    possible: true,
                },
                {
                    id: 'intercom-d-4-c-4',
                    title: 'CSAT by channel',
                    detail: 'average rating by source type',
                    possible: true,
                },
            ],
        },
        {
            id: 'intercom-d-5',
            name: 'Fin AI agent',
            purpose: 'Support ops measures how much Fin handles and how well.',
            charts: [
                {
                    id: 'intercom-d-5-c-1',
                    title: 'Fin involvement',
                    detail: 'share of conversations Fin took part in, per week',
                    possible: true,
                },
                {
                    id: 'intercom-d-5-c-2',
                    title: 'Fin resolution rate',
                    detail: 'assumed plus confirmed resolutions over Fin conversations',
                    possible: true,
                },
                {
                    id: 'intercom-d-5-c-3',
                    title: 'Escalations to teammates',
                    detail: 'Fin conversations escalated per week',
                    possible: true,
                },
                {
                    id: 'intercom-d-5-c-4',
                    title: 'Fin rating',
                    detail: 'average rating customers gave Fin',
                    possible: true,
                },
                {
                    id: 'intercom-d-5-c-5',
                    title: 'Resolutions by content source',
                    detail: 'which articles and snippets Fin answered from',
                    possible: false,
                },
            ],
        },
    ],
};

export const intercomSpec: LiveIntegrationSpec = {
    auth: {
        description:
            "A private app's access token needs no review; OAuth for other workspaces needs Intercom's app review.",
        testWith: 'test_account',
        needs: ['gmail'],
        token: true,
        oauth: 'needs_review',
    },
    useCases: intercomUseCases,
};
