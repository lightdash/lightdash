import { type HomepageOpening } from './orgSettings';
import { type HomepageConfig } from './types';

export const buildOnboardingHomepageConfig = (
    opening: HomepageOpening = 'ask-first',
): HomepageConfig => ({
    version: 1,
    rows:
        opening === 'ask-first'
            ? [
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
              ]
            : [
                  {
                      id: 'onboarding-row-greeting',
                      blocks: [
                          {
                              id: 'onboarding-block-greeting',
                              type: 'greeting',
                              config: {
                                  subtitle:
                                      'Pick up where you left off, or start something new.',
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
                                  // Ask AI stays reachable, just not the opening.
                                  actions: [
                                      { type: 'run-query' },
                                      { type: 'browse-dashboards' },
                                      { type: 'browse-spaces' },
                                      { type: 'ask-ai' },
                                  ],
                              },
                          },
                      ],
                  },
              ],
});
