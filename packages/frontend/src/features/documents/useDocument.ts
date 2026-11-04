import {
    getDocumentUrl,
    type ApiError,
    type Document,
    type ApiExecuteAsyncMetricQueryResults,
    type UuidOrSlug,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';

export const useDocument = (
    projectUuid: string,
    documentUuidOrSlug: UuidOrSlug,
    { enabled = true }: { enabled?: boolean } = {},
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<Document, ApiError>({
        queryKey: ['document', projectUuid, documentUuidOrSlug],
        queryFn: ({ signal }) =>
            lightdashApi<Document>({
                url: getDocumentUrl(projectUuid, documentUuidOrSlug),
                method: 'GET',
                body: undefined,
                signal,
            }),
        retry: false,
        enabled,
    });
};

export const useDocumentChartQuery = (
    projectUuid: string,
    documentUuid: string,
    versionUuid: string,
    chartId: string,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiExecuteAsyncMetricQueryResults, ApiError>({
        queryKey: [
            'document-chart-query',
            projectUuid,
            documentUuid,
            versionUuid,
            chartId,
        ],
        queryFn: ({ signal }) =>
            lightdashApi<ApiExecuteAsyncMetricQueryResults>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/charts/${encodeURIComponent(chartId)}/query`,
                method: 'POST',
                body: JSON.stringify({ versionUuid }),
                signal,
            }),
        retry: false,
        refetchOnWindowFocus: false,
    });
};
