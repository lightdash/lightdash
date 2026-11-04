export const ONBOARDING_DATA_STEPS = [
    'Choose a source',
    'Connect your warehouse',
    'Connect your tools',
    'Bring in your team',
];

export const ONBOARDING_STEP_COPY = {
    warehouse: { title: 'Connect your data', subtitle: null },
    tools: {
        title: 'Connect other tools',
        subtitle: 'You can connect these later in settings.',
    },
    team: { title: 'Bring in your team', subtitle: null },
} as const satisfies Record<string, { title: string; subtitle: string | null }>;
