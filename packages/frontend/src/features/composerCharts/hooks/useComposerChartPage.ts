import {
    type ApiError,
    type ComposerChartParameters,
    type ComposerChartRunResults,
    type ExecuteComposerChartRequest,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

/** Query keys the chart page reads; an agent edit invalidates them. */
export const COMPOSER_CHART_PAGE_QUERY_KEYS = [
    'composerChart',
    'composerChartPageRun',
    'composerChartParameters',
] as const;

/** A chart run of a space-owned chart for its page; `refresh` reruns it once, skipping the results cache. */
export const useComposerChartPageRun = ({
    projectUuid,
    composerChartUuid,
    parameters,
}: {
    projectUuid: string;
    composerChartUuid: string;
    parameters: ParametersValuesMap;
}) => {
    const lightdashApi = useLightdashApi();
    const [refreshCount, setRefreshCount] = useState(0);
    const invalidateNextRun = useRef(false);
    const refresh = useCallback(() => {
        invalidateNextRun.current = true;
        setRefreshCount((count) => count + 1);
    }, []);
    const runQuery = useQuery<ComposerChartRunResults, ApiError>({
        queryKey: [
            'composerChartPageRun',
            projectUuid,
            composerChartUuid,
            parameters,
            refreshCount,
        ],
        queryFn: () => {
            const body: ExecuteComposerChartRequest = {
                composerChartUuid,
                parameters,
                invalidateCache: invalidateNextRun.current,
            };
            invalidateNextRun.current = false;
            return lightdashApi<ComposerChartRunResults>({
                url: `/projects/${projectUuid}/query/composer-chart`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify(body),
            });
        },
        keepPreviousData: true,
    });
    return { runQuery, refresh };
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
