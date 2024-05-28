import {
    type ApiCatalogAnalyticsResults,
    type ApiError,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useQueryError from '../../../hooks/useQueryError';

export type GetCatalogAnalyticsParams = {
    projectUuid: string;
    table: string;
};

const fetchCatalogAnalytics = async ({
    projectUuid,
    table,
}: GetCatalogAnalyticsParams) =>
    lightdashApi<ApiCatalogAnalyticsResults>({
        url: `/projects/${projectUuid}/dataCatalog/${table}/analytics`,
        method: 'GET',
        body: undefined,
    });

export const useCatalogAnalytics = (
    projectUuid: string,
    onSuccess: (data: ApiCatalogAnalyticsResults) => void,
) => {
    const setErrorResponse = useQueryError();

    return useMutation<ApiCatalogAnalyticsResults, ApiError, string>(
        (table) => fetchCatalogAnalytics({ projectUuid, table }),
        {
            mutationKey: ['catalog_analytics', projectUuid],
            onSuccess: (data) => onSuccess(data),
            onError: (result) => setErrorResponse(result),
        },
    );
};
