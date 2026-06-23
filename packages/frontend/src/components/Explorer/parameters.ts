import {
    getAvailableParametersFromTables,
    type Explore,
    type LightdashProjectParameter,
} from '@lightdash/common';

export const getExploreParameterDefinitions = (
    explore: Explore | undefined,
): Record<string, LightdashProjectParameter> =>
    explore
        ? {
              ...getAvailableParametersFromTables(
                  Object.values(explore.tables),
              ),
              ...(explore.parameters ?? {}),
          }
        : {};

/**
 * The subset of user parameter definitions that are actually referenced. A referenced
 * name with no user definition (e.g. a reserved system variable referenced on its own)
 * is excluded, so the Parameters UI only surfaces user-editable parameters.
 */
export const getReferencedParameterDefinitions = (
    definitions: Record<string, LightdashProjectParameter>,
    references: string[] | undefined,
): Record<string, LightdashProjectParameter> =>
    Object.fromEntries(
        Object.entries(definitions).filter(([key]) =>
            references?.includes(key),
        ),
    );
