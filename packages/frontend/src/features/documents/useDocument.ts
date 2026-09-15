import {
    type ApiError,
    type Document,
    type ApiExecuteAsyncMetricQueryResults,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

export const useDocument = (projectUuid: string, documentUuid: string) =>
    useQuery<Document, ApiError>({
        queryKey: ['document', projectUuid, documentUuid],
        queryFn: ({ signal }) =>
            lightdashApi<Document>({
                url: `/projects/${projectUuid}/documents/${documentUuid}`,
                method: 'GET',
                body: undefined,
                signal,
            }),
        retry: false,
    });

export const useDocumentCellQuery = (
    projectUuid: string,
    documentUuid: string,
    versionUuid: string,
    cellId: string,
) =>
    useQuery<ApiExecuteAsyncMetricQueryResults, ApiError>({
        queryKey: [
            'document-cell-query',
            projectUuid,
            documentUuid,
            versionUuid,
            cellId,
        ],
        queryFn: ({ signal }) =>
            lightdashApi<ApiExecuteAsyncMetricQueryResults>({
                url: `/projects/${projectUuid}/documents/${documentUuid}/cells/${encodeURIComponent(cellId)}/query`,
                method: 'POST',
                body: JSON.stringify({ versionUuid }),
                signal,
            }),
        retry: false,
        refetchOnWindowFocus: false,
    });
