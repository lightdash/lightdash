import { type ApiError, type ApiGetAsyncQueryResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const PREVIEW_PAGE_SIZE = 25;

const getResultsPreview = async (projectUuid: string, queryUuid: string) =>
    lightdashApi<ApiGetAsyncQueryResults>({
        version: 'v2',
        url: `/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=${PREVIEW_PAGE_SIZE}`,
        method: 'GET',
        body: undefined,
    });

/**
 * First page of a query's results for the detail panel preview. Not enabled
 * for failed/running queries — the panel shows their state instead.
 */
export const useQueryResultsPreview = (
    projectUuid: string | undefined,
    queryUuid: string | undefined,
    enabled: boolean,
) =>
    useQuery<ApiGetAsyncQueryResults, ApiError>({
        queryKey: ['query-history-results-preview', projectUuid, queryUuid],
        queryFn: () => getResultsPreview(projectUuid!, queryUuid!),
        enabled: enabled && !!projectUuid && !!queryUuid,
        retry: false,
        keepPreviousData: false,
    });
