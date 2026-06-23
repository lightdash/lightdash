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
