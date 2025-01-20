import { CompileError } from '../types/errors';
import { type LightdashProjectConfig } from '../types/lightdashProjectConfig';

// TODO: document
export const getCategoriesFromResource = (
    resourceType: 'metric' | 'model',
    resourceName: string,
    spotlightConfig: Required<NonNullable<LightdashProjectConfig['spotlight']>>,
    resourceCategories: string[] | undefined = [],
) => {
    // Get all valid category references from the global spotlight config
    const categoriesDefinedInProjectConfig =
        Object.keys(spotlightConfig.categories) || [];

    // Check if any metric categories aren't defined in the global config
    const invalidCategories = resourceCategories.filter(
        (category) => !categoriesDefinedInProjectConfig.includes(category),
    );

    if (invalidCategories.length > 0) {
        throw new CompileError(
            `Invalid spotlight categories found in ${resourceType} '${resourceName}': ${invalidCategories.join(
                ', ',
            )}. Categories must be defined in project config.`,
        );
    }

    return resourceCategories;
};
