import {
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type HomepageRecommendedActionKey,
} from '@lightdash/common';

export const RECOMMENDED_ACTION_KEYS: HomepageRecommendedActionKey[] = [
    'connect-warehouse',
    'add-semantic-layer',
    'connect-source-control',
    'connect-slack',
];

// Connecting a warehouse gates everything else — skipping it would strand
// the user with nothing to query
export const SKIPPABLE_ACTION_KEYS: HomepageRecommendedActionKey[] = [
    ...SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
];
