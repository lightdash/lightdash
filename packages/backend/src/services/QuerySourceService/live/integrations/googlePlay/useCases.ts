import type { LiveUseCases } from '../../spec/types';

export const googlePlayUseCases: LiveUseCases = {
    questions: [
        {
            id: 'google_play-q-1',
            question: 'What was our crash rate per day for the last 28 days?',
            possible: true,
        },
        {
            id: 'google_play-q-2',
            question:
                "What is our 28-day user-perceived crash rate, and is it above Google Play's 1.09% bad behavior threshold?",
            possible: true,
        },
        {
            id: 'google_play-q-3',
            question:
                'What is the 28-day user-perceived ANR rate, and is it above the 0.47% bad behavior threshold?',
            possible: true,
        },
        {
            id: 'google_play-q-4',
            question: 'What is the 28-day ANR rate of each app version?',
            possible: true,
        },
        {
            id: 'google_play-q-5',
            question:
                'Which device models have the highest user-perceived crash rate?',
            possible: true,
        },
        {
            id: 'google_play-q-6',
            question:
                'Did the latest release raise the crash rate per day compared with the version before it?',
            possible: true,
        },
        {
            id: 'google_play-q-7',
            question:
                'Which Android API levels have the highest 7-day user-perceived ANR rate?',
            possible: true,
        },
        {
            id: 'google_play-q-8',
            question:
                'How has the slow cold start rate changed day by day this month?',
            possible: true,
        },
        {
            id: 'google_play-q-9',
            question:
                'Are warm or hot starts slower more often than cold starts on our app?',
            possible: true,
        },
        {
            id: 'google_play-q-10',
            question:
                'Which countries have the highest 28-day user-perceived crash rate?',
            possible: true,
        },
        {
            id: 'google_play-q-11',
            question:
                'How does the crash rate differ between phones, tablets and other device types?',
            possible: true,
        },
        {
            id: 'google_play-q-12',
            question:
                'Which app versions have the highest 28-day excessive wakeup rate?',
            possible: true,
        },
        {
            id: 'google_play-q-13',
            question:
                'How has the stuck background wake lock rate trended per day over the last quarter?',
            possible: true,
        },
        {
            id: 'google_play-q-14',
            question:
                'Do devices with less RAM have a higher 28-day low memory kill rate?',
            possible: true,
        },
        {
            id: 'google_play-q-15',
            question:
                'How many crash, ANR and non-fatal error reports did we get per day this week?',
            possible: true,
        },
        {
            id: 'google_play-q-16',
            question:
                'Which error issues had the most crash reports on each day of the last week?',
            possible: true,
        },
        {
            id: 'google_play-q-17',
            question:
                'Which GPU models or chipsets have the highest 28-day ANR rate?',
            possible: true,
        },
        {
            id: 'google_play-q-18',
            question:
                'How many crash reports did each error issue get in total over the last 28 days?',
            possible: false,
        },
        {
            id: 'google_play-q-19',
            question:
                'How many distinct users had a crash at least once last month?',
            possible: false,
        },
        {
            id: 'google_play-q-20',
            question: 'What was our crash rate in each month of the last year?',
            possible: false,
        },
        {
            id: 'google_play-q-21',
            question:
                'What is the stack trace and title of our top crash cluster?',
            possible: false,
        },
        {
            id: 'google_play-q-22',
            question:
                "How does our crash rate compare with Play Console's peer group of similar apps?",
            possible: false,
        },
        {
            id: 'google_play-q-23',
            question: 'How many installs and uninstalls did we get per day?',
            possible: false,
        },
        {
            id: 'google_play-q-24',
            question: 'How many active devices have our app installed?',
            possible: false,
        },
        {
            id: 'google_play-q-25',
            question:
                'What is our average star rating, and how has it moved since the last release?',
            possible: false,
        },
        {
            id: 'google_play-q-26',
            question: 'Which recent reviews mention crashes or freezes?',
            possible: false,
        },
        {
            id: 'google_play-q-27',
            question:
                'How much revenue did in-app purchases and subscriptions bring in per country?',
            possible: false,
        },
        {
            id: 'google_play-q-28',
            question:
                'What share of store listing visitors install the app, by traffic source?',
            possible: false,
        },
        {
            id: 'google_play-q-29',
            question:
                'Which issues did the pre-launch report find on the latest build?',
            possible: false,
        },
        {
            id: 'google_play-q-30',
            question:
                'What share of frames render slowly or freeze on our app?',
            possible: false,
        },
    ],
    dashboards: [
        {
            id: 'google_play-d-1',
            name: 'Android vitals overview',
            purpose:
                'The Android team lead opens it each week to see whether the core vitals are under the bad behavior thresholds that affect store visibility.',
            charts: [
                {
                    id: 'google_play-d-1-c-1',
                    title: 'User-perceived crash rate (28-day)',
                    detail: 'Line per day over the last 90 days, against the 1.09% threshold.',
                    possible: true,
                },
                {
                    id: 'google_play-d-1-c-2',
                    title: 'User-perceived ANR rate (28-day)',
                    detail: 'Line per day over the last 90 days, against the 0.47% threshold.',
                    possible: true,
                },
                {
                    id: 'google_play-d-1-c-3',
                    title: 'Slow cold start rate',
                    detail: 'Line per day over the last 28 days, filtered to cold starts.',
                    possible: true,
                },
                {
                    id: 'google_play-d-1-c-4',
                    title: 'Users affected by any vital issue',
                    detail: 'Big number of distinct users with a crash, ANR or slow start over the last 28 days.',
                    possible: false,
                },
            ],
        },
        {
            id: 'google_play-d-2',
            name: 'Release health',
            purpose:
                'The release manager opens it during a staged rollout to decide whether to halt or continue the new version.',
            charts: [
                {
                    id: 'google_play-d-2-c-1',
                    title: 'Crash rate by version',
                    detail: 'Line per day for the two latest version codes.',
                    possible: true,
                },
                {
                    id: 'google_play-d-2-c-2',
                    title: 'ANR rate (28-day) by version',
                    detail: 'Bar per version code for the latest day.',
                    possible: true,
                },
                {
                    id: 'google_play-d-2-c-3',
                    title: 'Error reports by type',
                    detail: 'Stacked bar per day of crash, ANR and non-fatal reports for the new version code.',
                    possible: true,
                },
                {
                    id: 'google_play-d-2-c-4',
                    title: 'Rollout adoption',
                    detail: 'Share of active devices on the new version, per day.',
                    possible: false,
                },
            ],
        },
        {
            id: 'google_play-d-3',
            name: 'Device and OS hotspots',
            purpose:
                'Android engineers open it to find the devices, OS versions and countries where the app is least stable.',
            charts: [
                {
                    id: 'google_play-d-3-c-1',
                    title: 'User-perceived crash rate (28-day) by device model',
                    detail: 'Table of device models for the latest day, highest rate first.',
                    possible: true,
                },
                {
                    id: 'google_play-d-3-c-2',
                    title: 'ANR rate (28-day) by API level',
                    detail: 'Bar per Android API level for the latest day.',
                    possible: true,
                },
                {
                    id: 'google_play-d-3-c-3',
                    title: 'Low memory kill rate (28-day) by RAM bucket',
                    detail: 'Bar per device RAM bucket for the latest day.',
                    possible: true,
                },
                {
                    id: 'google_play-d-3-c-4',
                    title: 'Crash rate (28-day) by country',
                    detail: 'Map of the 28-day crash rate per country for the latest day.',
                    possible: true,
                },
            ],
        },
        {
            id: 'google_play-d-4',
            name: 'Battery and background work',
            purpose:
                'Engineers working on background jobs open it to check that wakeups and wake locks stay low after each release.',
            charts: [
                {
                    id: 'google_play-d-4-c-1',
                    title: 'Excessive wakeup rate',
                    detail: 'Line per day over the last 28 days.',
                    possible: true,
                },
                {
                    id: 'google_play-d-4-c-2',
                    title: 'Stuck background wake lock rate (28-day) by version',
                    detail: 'Bar per version code for the latest day.',
                    possible: true,
                },
                {
                    id: 'google_play-d-4-c-3',
                    title: 'Battery issues this month',
                    detail: 'Big number of distinct users with excessive wakeups or stuck wake locks over the month.',
                    possible: false,
                },
            ],
        },
        {
            id: 'google_play-d-5',
            name: 'Store performance',
            purpose:
                'The growth team opens it to track installs, ratings and revenue alongside app quality.',
            charts: [
                {
                    id: 'google_play-d-5-c-1',
                    title: 'Installs and uninstalls',
                    detail: 'Line per day of device installs and uninstalls.',
                    possible: false,
                },
                {
                    id: 'google_play-d-5-c-2',
                    title: 'Average rating',
                    detail: 'Line per day of the average star rating.',
                    possible: false,
                },
                {
                    id: 'google_play-d-5-c-3',
                    title: 'Store listing conversion',
                    detail: 'Share of store listing visitors who install, per week.',
                    possible: false,
                },
                {
                    id: 'google_play-d-5-c-4',
                    title: 'Revenue by country',
                    detail: 'Bar of in-app and subscription revenue per country.',
                    possible: false,
                },
            ],
        },
    ],
};
