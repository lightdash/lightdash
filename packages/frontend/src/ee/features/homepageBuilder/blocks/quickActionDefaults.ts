import { type HomepageQuickAction } from '@lightdash/common';

// AI-first when available (encouraged behaviour); dashboard-first otherwise
export const getDefaultQuickActions = (
    isAiEnabled: boolean,
): HomepageQuickAction[] =>
    isAiEnabled
        ? [
              { type: 'ask-ai' },
              { type: 'browse-dashboards' },
              { type: 'run-query' },
          ]
        : [
              { type: 'browse-dashboards' },
              { type: 'run-query' },
              { type: 'browse-spaces' },
          ];
