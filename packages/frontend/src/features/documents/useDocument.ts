import {
    getDocumentUrl,
    type ApiError,
    type Document,
    type ApiExecuteAsyncMetricQueryResults,
    type UuidOrSlug,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

export const useDocument = (
    projectUuid: string,
    documentUuidOrSlug: UuidOrSlug,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<Document, ApiError>({
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

export const useDocumentChartQuery = (
    projectUuid: string,
    documentUuid: string,
    versionUuid: string,
    chartId: string,
) =>
    useQuery<ApiExecuteAsyncMetricQueryResults, ApiError>({
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
