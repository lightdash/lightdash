export const ONBOARDING_DATA_STEPS = [
    'Connect your data',
    'Optional extras',
    'Start exploring',
];

export const ONBOARDING_STEP_COPY = {
    warehouse: { title: 'Connect your data', subtitle: null },
    tools: {
        title: 'Bring in your other tools',
        subtitle: 'Optional. You can add these later from settings.',
    },
    team: {
        title: 'Connect Slack and GitHub',
        subtitle: 'You can also do this later from home.',
    },
} as const satisfies Record<string, { title: string; subtitle: string | null }>;
