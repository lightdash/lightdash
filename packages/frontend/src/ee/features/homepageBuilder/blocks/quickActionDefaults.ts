import { type HomepageQuickAction } from '@lightdash/common';

// Day-0 and the block library pair quick actions with the greeting (non-AI)
// layout; the AI hero stands alone, so there is no AI-first variant.
export const getDefaultQuickActions = (): HomepageQuickAction[] => [
    { type: 'browse-dashboards' },
    { type: 'run-query' },
    { type: 'browse-spaces' },
];
