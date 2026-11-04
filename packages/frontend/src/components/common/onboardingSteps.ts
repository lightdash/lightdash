export const ONBOARDING_DATA_STEPS = [
    'Choose a source',
    'Connect your warehouse',
    'Connect your tools',
    'Share answers and review changes',
];

export const ONBOARDING_STEP_COPY = {
    warehouse: { title: 'Connect your data', subtitle: null },
    tools: {
        title: 'Connect other tools',
        subtitle: 'You can connect these later in settings.',
    },
    team: {
        title: 'Share answers and review changes',
        subtitle:
            'Share your insights with your team, and keep improving the data they can use.',
    },
} as const satisfies Record<string, { title: string; subtitle: string | null }>;
