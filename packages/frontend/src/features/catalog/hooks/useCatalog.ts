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
    search?: string;
    type?: CatalogType;
};

const fetchCatalog = async ({ projectUuid, search, type }: GetCatalogParams) =>
    lightdashApi<ApiCatalogResults>({
        url: `/projects/${projectUuid}/dataCatalog?type=${type}&search=${search}`,
        method: 'GET',
        body: undefined,
    });

export const useCatalog = ({ projectUuid, search, type }: GetCatalogParams) => {
    const setErrorResponse = useQueryError();

    return useQuery<ApiCatalogResults, ApiError>({
        queryKey: ['comments', projectUuid, type, search],
        queryFn: () => fetchCatalog({ projectUuid, search, type }),
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};
