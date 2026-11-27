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

/**
 * The `n`th candidate for an explore name or prefix: `name` itself, then
 * `name_2`, `name_3`…, each cut so it fits in 40 characters.
 */
export const getNumberedExploreName = (name: string, n: number): string => {
    if (n <= 1) return name.slice(0, EXPLORE_PREFIX_MAX_LENGTH);
    const suffix = `_${n}`;
    return `${name.slice(0, EXPLORE_PREFIX_MAX_LENGTH - suffix.length)}${suffix}`;
};

const MAX_NUMBERED_NAMES = 1_000;

/**
 * The model name the core gives an explore its integration left unnamed:
 * the vendor id as a slug (`Invoice__c` → `invoice__c`), numbered on a clash
 * with `isTaken`, cut to 40 characters.
 */
export const getLiveModelName = (
    apiName: string,
    isTaken: (name: string) => boolean,
): string => {
    const slug = apiName
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^[_0-9]+|_+$/g, '');
    const base = slug.length > 0 ? slug : 'explore';
    const name = Array.from({ length: MAX_NUMBERED_NAMES }, (_, index) =>
        getNumberedExploreName(base, index + 1),
    ).find((candidate) => !isTaken(candidate));
    if (!name) {
        throw new Error(`No free explore name for "${apiName}"`);
    }
    return name;
};
