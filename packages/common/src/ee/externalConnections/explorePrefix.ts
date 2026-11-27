import { type ApiConnectorType } from '../../types/querySources';
import { generateSlug } from '../../utils/slugs';

const EXPLORE_PREFIX_PATTERN = /^[a-z][a-z0-9_]*$/;
export const EXPLORE_PREFIX_MAX_LENGTH = 40;

/** Why a live data source can't use this explore prefix, or null when it can. */
export const getExplorePrefixError = (prefix: string): string | null => {
    if (prefix.length > EXPLORE_PREFIX_MAX_LENGTH) {
        return `Use ${EXPLORE_PREFIX_MAX_LENGTH} characters or fewer`;
    }
    return EXPLORE_PREFIX_PATTERN.test(prefix)
        ? null
        : 'Start with a letter and use only lowercase letters, numbers and underscores';
};

/** The explore prefix suggested for a source's name: `PostHog` → `posthog`. */
export const getDefaultExplorePrefix = (
    connector: ApiConnectorType,
    name: string,
): string => {
    const base = generateSlug(name)
        .replace(/-/g, '_')
        .slice(0, EXPLORE_PREFIX_MAX_LENGTH)
        .replace(/_+$/, '');
    return getExplorePrefixError(base) === null ? base : connector;
};
