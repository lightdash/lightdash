import {
    convertDashboardFiltersParamToDashboardFilters,
    type DashboardParameters,
    type LanguageMap,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { type DashboardStoreState } from '.';
import {
    parseDashboardParametersUrl,
    toDashboardParameters,
} from '../../../providers/Dashboard/dashboardParametersUrl';
import {
    emptyDashboardFilters,
    initialDashboardFiltersState,
} from './dashboardFiltersReducer';
import { initialDashboardParametersState } from './dashboardParametersReducer';
import {
    emptySavedFilterOverrides,
    parseSavedFilterOverridesParam,
} from './savedFilterOverrides';

export type DashboardUrlRestoreErrors = {
    savedFilterOverrides: boolean;
    temporaryFilters: boolean;
    parameters: boolean;
};

const parseOrNull = <T>(parse: () => T): T | null => {
    try {
        return parse();
    } catch {
        return null;
    }
};

/** Restores runtime filter and parameter state from the dashboard URL */
export const buildInitialDashboardState = ({
    search,
    isEditMode,
    parameterLabelOverrides,
}: {
    search: string;
    isEditMode: boolean;
    parameterLabelOverrides: LanguageMap['parameters'];
}): {
    state: DashboardStoreState;
    urlRestoreErrors: DashboardUrlRestoreErrors;
} => {
    const searchParams = new URLSearchParams(search);

    const savedFilterOverrides = parseOrNull(() =>
        parseSavedFilterOverridesParam(searchParams.get('filters')),
    );

    const temporaryFiltersParam = searchParams.get('tempFilters');
    const temporaryFilters = temporaryFiltersParam
        ? parseOrNull(() =>
              convertDashboardFiltersParamToDashboardFilters(
                  JSON.parse(temporaryFiltersParam),
              ),
          )
        : emptyDashboardFilters;

    // Edit mode always starts from the saved parameters
    const parameters: DashboardParameters | null = isEditMode
        ? {}
        : parseOrNull(() =>
              toDashboardParameters(
                  parseDashboardParametersUrl(searchParams.get('parameters')) ??
                      {},
              ),
          );

    return {
        state: {
            filters: {
                ...initialDashboardFiltersState,
                savedFilterOverrides:
                    savedFilterOverrides ?? emptySavedFilterOverrides,
                temporaryFilters: temporaryFilters ?? emptyDashboardFilters,
            },
            parameters: {
                ...initialDashboardParametersState,
                isEditMode,
                parameterLabelOverrides,
                parameters: parameters ?? {},
                parametersHaveChanged: !isEqual(parameters ?? {}, {}),
            },
        },
        urlRestoreErrors: {
            savedFilterOverrides: savedFilterOverrides === null,
            temporaryFilters: temporaryFilters === null,
            parameters: parameters === null,
        },
    };
};
