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
    field?: string;
};

const fetchCatalogAnalytics = async ({
    projectUuid,
    table,
    field,
}: GetCatalogAnalyticsParams) =>
    lightdashApi<ApiCatalogAnalyticsResults>({
        url: `/projects/${projectUuid}/dataCatalog/${table}/analytics${
            field ? `/${field}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const useCatalogAnalytics = (projectUuid: string) => {
    const setErrorResponse = useQueryError();

    return useMutation<
        ApiCatalogAnalyticsResults,
        ApiError,
        { table: string; field?: string }
    >(
        ({ table, field }) =>
            fetchCatalogAnalytics({ projectUuid, table, field }),
        {
            mutationKey: ['catalog_analytics', projectUuid],
            onError: (result) => setErrorResponse(result),
        },
    );
};
