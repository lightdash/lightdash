import {
    type ApiDataAppVizPreviewTokenResponse,
    type ApiDataAppVizRenderMetadataResponse,
    type ApiError,
    type DataAppVizRenderMetadata,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    getPreviewTokenRefetchInterval,
    previewTokenQueryOptions,
} from '../../apps/hooks/previewTokenQueryOptions';

const DATA_APP_VIZ_RENDER_POLL_INTERVAL_MS = 3000;
const DATA_APP_VIZ_RENDER_MAX_RETRIES = 3;

type DataAppVizRenderTarget = {
    isEmbedded: boolean;
    savedChartUuid: string | undefined;
    // Set only while previewing an older chart version; the backend authorizes
    // against that version's config instead of the latest.
    chartVersionUuid?: string | undefined;
};

// Rendering a saved chart authorizes against that chart; the chart-less route is
// the authoring preview, where no chart exists to defer to yet.
const getRenderBaseUrl = (
    projectUuid: string,
    dataAppVizUuid: string,
    { isEmbedded, savedChartUuid }: DataAppVizRenderTarget,
): string => {
    if (isEmbedded) {
        return `/embed/${projectUuid}/chart/${savedChartUuid}/visualizations/${dataAppVizUuid}`;
    }
    return savedChartUuid
        ? `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}/charts/${savedChartUuid}`
        : `/ee/projects/${projectUuid}/apps/visualizations/${dataAppVizUuid}`;
};

const getChartVersionQuery = ({
    isEmbedded,
    savedChartUuid,
    chartVersionUuid,
}: DataAppVizRenderTarget): string =>
    !isEmbedded && savedChartUuid && chartVersionUuid
        ? `?chartVersionUuid=${chartVersionUuid}`
        : '';

const isTargetReady = (
    projectUuid: string | undefined,
    dataAppVizUuid: string | undefined,
    target: DataAppVizRenderTarget,
): boolean =>
    !!projectUuid &&
    !!dataAppVizUuid &&
    (!target.isEmbedded || !!target.savedChartUuid);

const shouldRetryDataAppVizRenderQuery = (
    failureCount: number,
    error: ApiError,
): boolean => {
    if (error.error.statusCode === 403 || error.error.statusCode === 404) {
        return false;
    }

    return failureCount < DATA_APP_VIZ_RENDER_MAX_RETRIES;
};

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
            target.chartVersionUuid,
        ],
        queryFn: () =>
            lightdashApi<ApiDataAppVizRenderMetadataResponse['results']>({
                method: 'GET',
                url: `${getRenderBaseUrl(
                    projectUuid!,
                    dataAppVizUuid!,
                    target,
                )}/render-metadata${getChartVersionQuery(target)}`,
            }),
        enabled: isTargetReady(projectUuid, dataAppVizUuid, target),
        retry: shouldRetryDataAppVizRenderQuery,
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
            target.chartVersionUuid,
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
                )}/versions/${version}/preview-token${getChartVersionQuery(
                    target,
                )}`,
            });
            return token;
        },
        enabled:
            isTargetReady(projectUuid, dataAppVizUuid, target) &&
            version !== undefined &&
            version > 0,
        retry: shouldRetryDataAppVizRenderQuery,
        refetchInterval: (_data, query) =>
            getPreviewTokenRefetchInterval(query.state.error),
        ...previewTokenQueryOptions,
    });
