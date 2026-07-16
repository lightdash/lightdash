import { type HomepageRecommendedActionKey } from '@lightdash/common';

export const RECOMMENDED_ACTION_KEYS: HomepageRecommendedActionKey[] = [
    'connect-warehouse',
    'add-semantic-layer',
    'connect-source-control',
    'connect-slack',
];

const isRecommendedActionKey = (
    value: unknown,
): value is HomepageRecommendedActionKey =>
    typeof value === 'string' &&
    RECOMMENDED_ACTION_KEYS.includes(value as HomepageRecommendedActionKey);

const getSkippedActionsStorageKey = (projectUuid: string | null) =>
    `lightdash:recommended-actions:skipped:${projectUuid ?? 'no-project'}`;

export const readSkippedActions = (
    projectUuid: string | null,
): HomepageRecommendedActionKey[] => {
    const raw = localStorage.getItem(getSkippedActionsStorageKey(projectUuid));
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isRecommendedActionKey);
    } catch {
        return [];
    }
};

export const writeSkippedActions = (
    projectUuid: string | null,
    keys: HomepageRecommendedActionKey[],
) => {
    localStorage.setItem(
        getSkippedActionsStorageKey(projectUuid),
        JSON.stringify(keys),
    );
};
