import {
    type ApiCatalogResults,
    type ApiError,
    type CatalogType,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useQueryError from '../../../hooks/useQueryError';

export type GetCatalogParams = {
    projectUuid: string;
    type?: CatalogType;
};

const fetchCatalog = async ({ projectUuid, type }: GetCatalogParams) =>
    lightdashApi<ApiCatalogResults>({
        url: `/projects/${projectUuid}/dataCatalog?type=${type}`,
        method: 'GET',
        body: undefined,
    });

export const useCatalog = ({ projectUuid, type }: GetCatalogParams) => {
    const setErrorResponse = useQueryError();

    return useQuery<ApiCatalogResults, ApiError>({
        queryKey: ['comments', projectUuid, type],
        queryFn: () => fetchCatalog({ projectUuid, type }),
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};
