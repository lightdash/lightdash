import { type ApiError, type ApiGetAsyncQueryResults } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const PREVIEW_PAGE_SIZE = 25;

const getResultsPreview = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    queryUuid: string,
) =>
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
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiGetAsyncQueryResults, ApiError>({
        queryKey: ['query-history-results-preview', projectUuid, queryUuid],
        queryFn: () =>
            getResultsPreview(lightdashApi, projectUuid!, queryUuid!),
        enabled: enabled && !!projectUuid && !!queryUuid,
        retry: false,
        keepPreviousData: false,
    });
};
