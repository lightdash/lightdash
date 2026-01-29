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
    targets?: string[];
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
    targets,
}: SpotlightConfigArgs):
    | Pick<Explore, 'spotlight'>
    | Pick<Metric, 'spotlight'> => {
    if (visibility === undefined) {
        return {};
    }

    return {
        spotlight: {
            visibility,
            categories,
            ...(filterBy ? { filterBy } : {}),
            ...(segmentBy ? { segmentBy } : {}),
            ...(owner ? { owner } : {}),
            ...(targets ? { targets } : {}),
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
