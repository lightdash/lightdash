import {
    type ApiError,
    type ComposerChart,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useComposerChart = (
    projectUuid: string | undefined,
    composerChartUuid: string | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ComposerChart, ApiError>({
        queryKey: ['composerChart', projectUuid, composerChartUuid],
        queryFn: () =>
            lightdashApi<ComposerChart>({
                url: `/projects/${projectUuid}/composer-charts/${composerChartUuid}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
        enabled: !!projectUuid && !!composerChartUuid,
    });
};

/** A bound run of the stored chart where this tile shows it; refetches when the dashboard refreshes. */
export const useComposerChartRun = ({
    projectUuid,
    composerChartUuid,
    request,
    refreshCounter,
    enabled,
}: {
    projectUuid: string | undefined;
    composerChartUuid: string | null;
    request: ComposerChartRunRequest;
    refreshCounter: number;
    enabled: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ComposerChartRunResults, ApiError>({
        queryKey: [
            'composerChartRun',
            projectUuid,
            composerChartUuid,
            request,
            refreshCounter,
        ],
        queryFn: () =>
            lightdashApi<ComposerChartRunResults>({
                url: `/projects/${projectUuid}/composer-charts/${composerChartUuid}/run`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify(request),
            }),
        enabled: enabled && !!projectUuid && !!composerChartUuid,
    });
};
