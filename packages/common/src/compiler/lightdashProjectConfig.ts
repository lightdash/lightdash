import { ParseError } from '../types/errors';
import type { Explore } from '../types/explore';
import type { Metric } from '../types/field';
import type { LightdashProjectConfig } from '../types/lightdashProjectConfig';

type SpotlightConfigArgs = {
    visibility?: LightdashProjectConfig['spotlight']['default_visibility'];
    categories?: string[];
    filterBy?: string[];
    segmentBy?: string[];
    owner?: string;
};

const validateOwner = (owner: unknown): string | null => {
    if (typeof owner === 'string') return owner;
    if (owner !== undefined) {
        // eslint-disable-next-line no-console
        console.warn(
            `Invalid spotlight owner: expected string, got ${typeof owner}`,
        );
    }
    return null;
};

/**
 * Get the spotlight configuration for a resource
 */
export const getSpotlightConfigurationForResource = ({
    visibility,
    categories,
    filterBy,
    segmentBy,
    owner,
}: SpotlightConfigArgs):
    | Pick<Explore, 'spotlight'>
    | Pick<Metric, 'spotlight'> => {
    if (visibility === undefined) {
        return {};
    }

    const validatedOwner = validateOwner(owner);

    return {
        spotlight: {
            visibility,
            categories,
            ...(filterBy ? { filterBy } : {}),
            ...(segmentBy ? { segmentBy } : {}),
            ...(validatedOwner ? { owner: validatedOwner } : {}),
        },
    };
};

/**
 * Get the categories from the resource and validate them against the project config
 * @param resourceType - The type of the resource
 * @param resourceName - The name of the resource
 * @param spotlightConfig - The spotlight config
 * @param resourceCategories - The categories from the resource
 * @returns The categories from the resource
 */
export const getCategoriesFromResource = (
    resourceType: 'metric' | 'explore',
    resourceName: string,
    spotlightConfig: LightdashProjectConfig['spotlight'] | undefined,
    resourceCategories: string[] | undefined = [],
) => {
    // Get all valid category references from the global spotlight config
    const categoriesDefinedInProjectConfig =
        Object.keys(spotlightConfig?.categories || {}) || [];

    // Check if any metric categories aren't defined in the global config
    const invalidCategories = resourceCategories.filter(
        (category) => !categoriesDefinedInProjectConfig.includes(category),
    );

    if (invalidCategories.length > 0) {
        throw new ParseError(
            `Invalid spotlight categories found in ${resourceType} '${resourceName}': ${invalidCategories.join(
                ', ',
            )}. Categories must be defined in project config.`,
        );
    }

    return resourceCategories;
};
