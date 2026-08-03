import {
    type ApiDataAppVizPreviewTokenResponse,
    type ApiDataAppVizRenderMetadataResponse,
    type ApiError,
    type DataAppVizRenderMetadata,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const DATA_APP_VIZ_RENDER_POLL_INTERVAL_MS = 3000;

type DataAppVizRenderTarget = {
    isEmbedded: boolean;
    savedChartUuid: string | undefined;
};

const getRenderBaseUrl = (
    projectUuid: string,
    dataAppVizUuid: string,
    { isEmbedded, savedChartUuid }: DataAppVizRenderTarget,
): string =>
    isEmbedded
        ? `/embed/${projectUuid}/chart/${savedChartUuid}/visualizations/${dataAppVizUuid}`
        : `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}`;

const isTargetReady = (
    projectUuid: string | undefined,
    dataAppVizUuid: string | undefined,
    target: DataAppVizRenderTarget,
): boolean =>
    !!projectUuid &&
    !!dataAppVizUuid &&
    (!target.isEmbedded || !!target.savedChartUuid);

export const useDataAppVizRenderMetadata = (
    projectUuid: string | undefined,
    dataAppVizUuid: string | undefined,
    target: DataAppVizRenderTarget,
) =>
    useQuery<DataAppVizRenderMetadata, ApiError>({
        queryKey: [
            'data-app-viz-render-metadata',
            projectUuid,
            dataAppVizUuid,
            target.isEmbedded ? 'embed' : 'registered',
            target.savedChartUuid,
        ],
        queryFn: () =>
            lightdashApi<ApiDataAppVizRenderMetadataResponse['results']>({
                method: 'GET',
                url: `${getRenderBaseUrl(
                    projectUuid!,
                    dataAppVizUuid!,
                    target,
                )}/render-metadata`,
            }),
        enabled: isTargetReady(projectUuid, dataAppVizUuid, target),
        refetchInterval: (metadata) =>
            metadata?.latestBuildInProgress
                ? DATA_APP_VIZ_RENDER_POLL_INTERVAL_MS
                : false,
    });

export const useDataAppVizPreviewToken = (
    projectUuid: string | undefined,
    dataAppVizUuid: string | undefined,
    version: number | undefined,
    target: DataAppVizRenderTarget,
) =>
    useQuery<string, ApiError>({
        queryKey: [
            'data-app-viz-preview-token',
            projectUuid,
            dataAppVizUuid,
            version,
            target.isEmbedded ? 'embed' : 'registered',
            target.savedChartUuid,
        ],
        queryFn: async () => {
            const { token } = await lightdashApi<
                ApiDataAppVizPreviewTokenResponse['results']
            >({
                method: 'GET',
                url: `${getRenderBaseUrl(
                    projectUuid!,
                    dataAppVizUuid!,
                    target,
                )}/versions/${version}/preview-token`,
            });
            return token;
        },
        enabled:
            isTargetReady(projectUuid, dataAppVizUuid, target) &&
            version !== undefined &&
            version > 0,
    });
