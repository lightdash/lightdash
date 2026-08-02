import { type HomepageConfig } from './types';

export const buildOnboardingHomepageConfig = (): HomepageConfig => ({
    version: 1,
    rows: [
        {
            id: 'onboarding-row-ask-ai-hero',
            blocks: [
                {
                    id: 'onboarding-block-ask-ai-hero',
                    type: 'ask-ai-hero',
                    config: {
                        showGreeting: true,
                        showRecommendedActions: true,
                    },
                },
            ],
        },
        {
            id: 'onboarding-row-quick-actions',
            blocks: [
                {
                    id: 'onboarding-block-quick-actions',
                    type: 'quick-actions',
                    config: {
                        actions: [
                            { type: 'ask-ai' },
                            { type: 'run-query' },
                            { type: 'browse-dashboards' },
                            { type: 'browse-spaces' },
                        ],
                    },
                },
            ],
        },
    ],
});
