// What people expect to ask this integration and the dashboards they expect
// to build, and whether each is possible today. Flip `possible` in the same PR
// as the code that changes the answer.
import type { LiveUseCases } from '../../spec/types';

export const appStoreConnectUseCases: LiveUseCases = {
    questions: [
        {
            id: 'app_store_connect-q-1',
            question:
                'How many first-time downloads did the app get each day over the last 30 days?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-2',
            question:
                'How many App Store impressions and product page views did we get last week, and what share of page views became downloads?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-3',
            question:
                'Which territories brought the most downloads this month?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-4',
            question:
                'How many downloads came from App Store search, browse, web referrers and app referrers last month?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-5',
            question: 'How many redownloads did we get each week this quarter?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-6',
            question:
                'What were our proceeds by day and by territory over the last 90 days?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-7',
            question:
                'How many sessions and active devices did the app have each day last month?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-8',
            question:
                'What share of new users were still active on day 1, day 7 and day 28?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-9',
            question:
                'How many crashes did each app version have in the last 14 days, by device?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-10',
            question:
                'How many units did we sell last week, and how many were in-app purchases?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-11',
            question:
                'How many active paid subscriptions do we have today, by subscription and territory?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-12',
            question:
                'How many subscriptions started, renewed and were cancelled each week?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-13',
            question:
                'What is our average App Store rating, and how has it changed over the last six months?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-14',
            question: 'How many ratings did we get per day last month?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-15',
            question:
                'Which customer reviews were written most recently, with their rating and territory?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-16',
            question:
                'Show the 1 and 2 star reviews so we can read what people complain about.',
            possible: true,
        },
        {
            id: 'app_store_connect-q-17',
            question:
                'How many written reviews gave 1 star, and how many gave 5 stars?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-18',
            question: 'How many written reviews came from the United Kingdom?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-19',
            question:
                'How many reviews did we get each week, and what was the average rating each week?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-20',
            question:
                'Which App Store versions do we have, with their platform, state and release type?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-21',
            question:
                'Is a version waiting for review, in review, or rejected right now?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-22',
            question:
                'What state are our App Review submissions in, and when were they submitted?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-23',
            question: 'How many App Store versions have we shipped on iOS?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-24',
            question:
                'Which builds did we upload recently, with their build number, processing state and expiry date?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-25',
            question: 'How many builds have we uploaded in total?',
            possible: true,
        },
        {
            id: 'app_store_connect-q-26',
            question:
                'How many TestFlight testers installed each build, and how many sessions and crashes did each build have?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-27',
            question:
                'How long did App Review take for each of our last ten submissions?',
            possible: false,
        },
        {
            id: 'app_store_connect-q-28',
            question: 'How many builds were uploaded each week this quarter?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'app_store_connect-d-1',
            name: 'App Store acquisition',
            purpose:
                'Growth and marketing check each week how people find the app and how many download it.',
            charts: [
                {
                    id: 'app_store_connect-d-1-c-1',
                    title: 'Impressions and product page views',
                    detail: 'impressions and product page views per day',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-1-c-2',
                    title: 'First-time downloads',
                    detail: 'first-time downloads and redownloads per day',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-1-c-3',
                    title: 'Conversion rate',
                    detail: 'downloads divided by product page views per week',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-1-c-4',
                    title: 'Downloads by source',
                    detail: 'downloads by source type: search, browse, web and app referrers',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-1-c-5',
                    title: 'Downloads by territory',
                    detail: 'downloads per territory for the last 30 days',
                    possible: false,
                },
            ],
        },
        {
            id: 'app_store_connect-d-2',
            name: 'Revenue and subscriptions',
            purpose:
                'Founders and finance follow proceeds and the subscription base each week.',
            charts: [
                {
                    id: 'app_store_connect-d-2-c-1',
                    title: 'Proceeds',
                    detail: 'proceeds per day in the reporting currency',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-2-c-2',
                    title: 'Active subscriptions',
                    detail: 'active paid subscriptions per day',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-2-c-3',
                    title: 'Subscription starts and cancellations',
                    detail: 'new subscriptions and cancellations per week',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-2-c-4',
                    title: 'Proceeds by territory',
                    detail: 'proceeds per territory for the last 30 days',
                    possible: false,
                },
            ],
        },
        {
            id: 'app_store_connect-d-3',
            name: 'Ratings and reviews',
            purpose:
                'Product and support read new reviews and watch the rating after each release.',
            charts: [
                {
                    id: 'app_store_connect-d-3-c-1',
                    title: 'Latest reviews',
                    detail: 'most recent reviews with rating, title, body and territory',
                    possible: true,
                },
                {
                    id: 'app_store_connect-d-3-c-2',
                    title: 'Low-rated reviews',
                    detail: '1 and 2 star reviews, newest first',
                    possible: true,
                },
                {
                    id: 'app_store_connect-d-3-c-3',
                    title: '1 star review count',
                    detail: 'number of written reviews with 1 star',
                    possible: true,
                },
                {
                    id: 'app_store_connect-d-3-c-4',
                    title: 'Average rating over time',
                    detail: 'average star rating per week',
                    possible: false,
                },
            ],
        },
        {
            id: 'app_store_connect-d-4',
            name: 'Release status',
            purpose:
                'The mobile team checks where each version and build is between upload and release.',
            charts: [
                {
                    id: 'app_store_connect-d-4-c-1',
                    title: 'App Store versions',
                    detail: 'versions with platform, state, release type and creation date',
                    possible: true,
                },
                {
                    id: 'app_store_connect-d-4-c-2',
                    title: 'Review submissions',
                    detail: 'submissions with platform, state and submission date',
                    possible: true,
                },
                {
                    id: 'app_store_connect-d-4-c-3',
                    title: 'Recent builds',
                    detail: 'builds with build number, upload date, processing state and expiry',
                    possible: true,
                },
                {
                    id: 'app_store_connect-d-4-c-4',
                    title: 'Builds uploaded per week',
                    detail: 'builds uploaded per week',
                    possible: false,
                },
            ],
        },
        {
            id: 'app_store_connect-d-5',
            name: 'App stability and engagement',
            purpose:
                'Engineering watches crashes and usage after each release.',
            charts: [
                {
                    id: 'app_store_connect-d-5-c-1',
                    title: 'Crashes by version',
                    detail: 'crashes per app version per day',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-5-c-2',
                    title: 'Sessions',
                    detail: 'sessions per day',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-5-c-3',
                    title: 'Active devices',
                    detail: 'active devices per day',
                    possible: false,
                },
                {
                    id: 'app_store_connect-d-5-c-4',
                    title: 'Retention',
                    detail: 'day 1, day 7 and day 28 retention by download cohort',
                    possible: false,
                },
            ],
        },
    ],
};
