import {
    convertDashboardFiltersParamToDashboardFilters,
    normalizeGranularityParam,
    type DashboardParameters,
    type DateGranularity,
    type LanguageMap,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import { type DashboardStoreState } from '.';
import {
    parseDashboardParametersUrl,
    toDashboardParameters,
} from '../../../providers/Dashboard/dashboardParametersUrl';
import { initialDashboardChartSortState } from './dashboardChartSortReducer';
import { initialDashboardDateZoomState } from './dashboardDateZoomReducer';
import { initialDashboardEditState } from './dashboardEditReducer';
import {
    emptyDashboardFilters,
    initialDashboardFiltersState,
} from './dashboardFiltersReducer';
import { initialDashboardParametersState } from './dashboardParametersReducer';
import {
    initialDashboardProviderState,
    type DashboardProviderState,
} from './dashboardSourceReducer';
import { initialDashboardTileStatusState } from './dashboardTileStatusReducer';
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

/** Restores runtime filter, parameter and date zoom state from the dashboard URL */
export const buildInitialDashboardState = ({
    search,
    isEditMode,
    parameterLabelOverrides,
    dateZoom,
    invalidateCache,
    source = initialDashboardProviderState,
}: {
    search: string;
    isEditMode: boolean;
    parameterLabelOverrides: LanguageMap['parameters'];
    dateZoom: DateGranularity | string | undefined;
    invalidateCache: boolean;
    source?: DashboardProviderState;
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

    const dateZoomParam = searchParams.get('dateZoom');
    // Written lowercased; restored in canonical DateGranularity case
    const controlGranularities: Record<string, DateGranularity | string> = {};
    searchParams.forEach((value, key) => {
        if (key.startsWith('dateZoom.')) {
            controlGranularities[key.slice('dateZoom.'.length)] =
                normalizeGranularityParam(value);
        }
    });

    return {
        state: {
            source: { ...source, embedDashboard: undefined },
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
                parameterPicks: Object.fromEntries(
                    Object.entries(parameters ?? {}).map(([key, { value }]) => [
                        key,
                        value,
                    ]),
                ),
                parametersHaveChanged: !isEqual(parameters ?? {}, {}),
            },
            dateZoom: {
                ...initialDashboardDateZoomState,
                granularity: dateZoomParam
                    ? normalizeGranularityParam(dateZoomParam)
                    : dateZoom,
                controlGranularities,
            },
            tileStatus: { ...initialDashboardTileStatusState, invalidateCache },
            edit: initialDashboardEditState,
            chartSort: initialDashboardChartSortState,
        },
        urlRestoreErrors: {
            savedFilterOverrides: savedFilterOverrides === null,
            temporaryFilters: temporaryFilters === null,
            parameters: parameters === null,
        },
    };
};
