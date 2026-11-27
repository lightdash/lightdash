import {
    type ApiError,
    type ComposerChart,
    type ComposerChartParameters,
    type ComposerChartRunResults,
    type ExecuteComposerChartRequest,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { isEqual } from 'es-toolkit/compat';
import { useCallback, useState } from 'react';
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
    const [refreshed, setRefreshed] = useState<{
        at: number;
        parameters: ParametersValuesMap;
    } | null>(null);
    const refresh = useCallback(
        () => setRefreshed({ at: Date.now(), parameters }),
        [parameters],
    );
    // Only the refreshed selection skips the cache; a later pick reads it again
    const invalidateCache =
        refreshed !== null && isEqual(refreshed.parameters, parameters);
    const runQuery = useQuery<
        { versionUuid: string; run: ComposerChartRunResults },
        ApiError
    >({
        queryKey: [
            'composerChartPageRun',
            projectUuid,
            chart.uuid,
            chart.versionUuid,
            parameters,
            refreshed?.at ?? 0,
        ],
        queryFn: () => {
            const body: ExecuteComposerChartRequest = {
                composerChartUuid: chart.uuid,
                parameters,
                invalidateCache,
            };
            return lightdashApi<ComposerChartRunResults>({
                url: `/projects/${projectUuid}/query/composer-chart`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify(body),
            }).then((run) => ({ versionUuid: chart.versionUuid, run }));
        },
        keepPreviousData: true,
    });
    // A kept run of an older version would draw the new chart with old columns
    const run =
        runQuery.data?.versionUuid === chart.versionUuid
            ? runQuery.data.run
            : null;
    return { runQuery, run, refresh };
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
