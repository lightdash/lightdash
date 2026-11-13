export const UPSELL_STRINGS = {
    1: {
        headline: 'Ask your data from your phone.',
        support: 'Your AI agent can answer with a chart.',
    },
    2: {
        headline: 'Dashboards that fit your phone.',
        support: 'Tiles stack into one column you can scroll.',
    },
    3: {
        headline: 'Find your saved charts.',
        support: 'Browse your spaces and open charts on your phone.',
    },
    4: {
        headline: 'Pinned and recent, on Home.',
        support: 'Open pinned and recently viewed charts and dashboards.',
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

export const SIGN_IN_GUIDE_STRINGS = {
    label: 'Sign-in steps',
    steps: [
        'Scan the code with your phone camera.',
        'Confirm the sign-in here.',
        'Type the number shown here into the app.',
    ],
    noApp: 'No app yet? The scan opens a page with store links.',
} as const;

export const UPSELL_GRAPHIC_STRINGS = {
    ask: 'Ask',
    question: 'How many orders did we get each month?',
    ordersByMonth: 'Orders by month',
    dashboard: 'Sales dashboard',
    revenueByMethod: 'Revenue by payment method',
    usersByMonth: 'Users by month',
    browse: 'Browse',
    spaces: 'Spaces',
    space: 'Sales',
    revenueQuestion: 'How much revenue do we have per payment method?',
    ordersQuestion: 'How many orders do we have over time?',
    shipping: 'Shipping counts by method',
    pinned: 'Pinned',
    recent: 'Recently viewed',
} as const;
