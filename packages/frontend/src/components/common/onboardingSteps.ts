export const ONBOARDING_DATA_STEPS = [
    'Connect your data',
    'Optional extras',
    'Start exploring',
];

export const ONBOARDING_STEP_COPY = {
    warehouse: { title: 'Connect your data', subtitle: null },
    tools: {
        title: 'Connect other tools',
        subtitle: 'Optional. You can connect these later in settings.',
    },
    team: {
        title: 'Connect Slack and GitHub',
        subtitle: 'Optional. You can connect these later from home.',
    },
} as const satisfies Record<string, { title: string; subtitle: string | null }>;
