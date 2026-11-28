import {
    type ApiError,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type ComposerChartWithDetails,
    type DashboardComposerChartRunRequest,
    type UuidOrSlug,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

export const useComposerChart = (
    projectUuid: string | undefined,
    composerChartUuidOrSlug: UuidOrSlug | null,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ComposerChartWithDetails, ApiError>({
        queryKey: ['composerChart', projectUuid, composerChartUuidOrSlug],
        queryFn: () =>
            lightdashApi<ComposerChartWithDetails>({
                url: `/projects/${projectUuid}/composer-charts/${composerChartUuidOrSlug}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
        enabled: !!projectUuid && !!composerChartUuidOrSlug,
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
        queryFn: () => {
            const body: DashboardComposerChartRunRequest = {
                ...request,
                composerChartUuid: composerChartUuid ?? '',
            };
            return lightdashApi<ComposerChartRunResults>({
                url: `/projects/${projectUuid}/query/dashboard-composer-chart`,
                version: 'v2',
                method: 'POST',
                body: JSON.stringify(body),
            });
        },
        enabled: enabled && !!projectUuid && !!composerChartUuid,
    });
};
