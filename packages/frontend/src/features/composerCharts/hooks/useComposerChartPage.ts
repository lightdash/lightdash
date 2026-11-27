import {
    type ApiError,
    type ComposerChart,
    type ComposerChartParameters,
    type ComposerChartRunResults,
    type ExecuteComposerChartRequest,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type PageChart = Pick<ComposerChart, 'uuid' | 'versionUuid'>;

/** A chart run of a space-owned chart for its page, per version; `refresh` reruns it once, skipping the results cache. */
export const useComposerChartPageRun = ({
    projectUuid,
    chart,
    parameters,
}: {
    projectUuid: string;
    chart: PageChart;
    parameters: ParametersValuesMap;
}) => {
    const lightdashApi = useLightdashApi();
    // A timestamp, not a counter: a counter restarts on remount and would hit a cached run
    const [refreshedAt, setRefreshedAt] = useState(0);
    const invalidateNextRun = useRef(false);
    const refresh = useCallback(() => {
        invalidateNextRun.current = true;
        setRefreshedAt(Date.now());
    }, []);
    const runQuery = useQuery<ComposerChartRunResults, ApiError>({
        queryKey: [
            'composerChartPageRun',
            projectUuid,
            chart.uuid,
            chart.versionUuid,
            parameters,
            refreshedAt,
        ],
        queryFn: () => {
            const body: ExecuteComposerChartRequest = {
                composerChartUuid: chart.uuid,
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
    chart: PageChart,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ComposerChartParameters, ApiError>({
        queryKey: [
            'composerChartParameters',
            projectUuid,
            chart.uuid,
            chart.versionUuid,
        ],
        queryFn: () =>
            lightdashApi<ComposerChartParameters>({
                url: `/projects/${projectUuid}/composer-charts/${chart.uuid}/parameters`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
    });
};
