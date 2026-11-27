import {
    type ApiError,
    type ComposerChartParameters,
    type ComposerChartRunResults,
    type ExecuteComposerChartRequest,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** Query keys the chart page reads; an agent edit invalidates them. */
export const COMPOSER_CHART_PAGE_QUERY_KEYS = [
    'composerChart',
    'composerChartPageRun',
    'composerChartParameters',
] as const;

/** A chart run of a space-owned chart for its page; `refresh` bumps on Refresh, which skips the results cache. */
export const useComposerChartPageRun = ({
    projectUuid,
    composerChartUuid,
    parameters,
    refresh,
}: {
    projectUuid: string;
    composerChartUuid: string;
    parameters: ParametersValuesMap;
    refresh: { count: number; invalidateCache: boolean };
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ComposerChartRunResults, ApiError>({
        queryKey: [
            'composerChartPageRun',
            projectUuid,
            composerChartUuid,
            parameters,
            refresh,
        ],
        queryFn: () => {
            const body: ExecuteComposerChartRequest = {
                composerChartUuid,
                parameters,
                invalidateCache: refresh.invalidateCache,
            };
            return lightdashApi<ComposerChartRunResults>({
                url: `/projects/${projectUuid}/query/composer-chart`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify(body),
            });
        },
        keepPreviousData: true,
    });
};

export const useComposerChartParameters = (
    projectUuid: string,
    composerChartUuid: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ComposerChartParameters, ApiError>({
        queryKey: ['composerChartParameters', projectUuid, composerChartUuid],
        queryFn: () =>
            lightdashApi<ComposerChartParameters>({
                url: `/projects/${projectUuid}/composer-charts/${composerChartUuid}/parameters`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
    });
};
