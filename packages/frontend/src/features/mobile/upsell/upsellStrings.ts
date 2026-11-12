export const UPSELL_STRINGS = {
    1: {
        headline: 'Ask your data from your phone.',
        support: 'Your AI agent answers with a chart.',
    },
    2: {
        headline: 'Dashboards that fit your phone.',
        support: 'Tiles stack into one column you can scroll.',
    },
    3: {
        headline: 'Find any saved chart.',
        support: 'Browse your spaces and open charts on your phone.',
    },
    4: {
        headline: 'Pinned charts, right on Home.',
        support: 'Home lists pinned and recently viewed content.',
    },
    5: {
        headline: 'Same chart. Phone-sized.',
        support: 'Saved charts redraw to fit a small screen.',
    },
    6: {
        headline: 'On iOS and Android.',
        support: 'Ask AI, dashboards and saved charts on either phone.',
    },
} as const;

export const UPSELL_INSTALL_STRINGS = {
    label: 'Get the app',
    download: 'Download',
    ios: {
        platform: 'iOS',
        store: 'App Store',
        label: 'Download the iOS app from the App Store (opens in a new tab)',
    },
    android: {
        platform: 'Android',
        store: 'Google Play',
        label: 'Download the Android app from Google Play (opens in a new tab)',
    },
} as const;

export const UPSELL_GRAPHIC_STRINGS = {
    ask: 'Ask',
    question: 'How many orders did we get each month?',
    ordersByMonth: 'Orders by month',
    dashboard: 'Jaffle dashboard',
    revenueByMethod: 'Revenue by payment method',
    usersByMonth: 'Users by month',
    browse: 'Browse',
    spaces: 'Spaces',
    space: 'Jaffle shop',
    revenueQuestion: 'How much revenue do we have per payment method?',
    ordersQuestion: 'How many orders we have over time ?',
    shipping: 'Shipping counts by method',
    pinned: 'Pinned',
    recent: 'Recently viewed',
} as const;
