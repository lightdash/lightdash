import {
    CatalogFilter,
    CatalogType,
    type ApiCatalogResults,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useQueryError from '../../../hooks/useQueryError';

export type GetCatalogParams = {
    projectUuid: string;
    search?: string;
    type?: CatalogType | undefined;
    filter: CatalogFilter | undefined;
};

const fetchCatalog = async ({
    projectUuid,
    search,
    type,
    filter,
}: GetCatalogParams) =>
    lightdashApi<ApiCatalogResults>({
        url: `/projects/${projectUuid}/dataCatalog?${
            type ? `type=${type}` : ''
        }${search && search.length > 2 ? `&search=${search}` : ''}${
            filter ? `&filter=${filter}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });

export const useCatalog = ({
    projectUuid,
    search,
    filter,
}: GetCatalogParams) => {
    const setErrorResponse = useQueryError();
    let type: CatalogType | undefined = undefined;

    if (search && search.length > 2) {
        if (
            filter === CatalogFilter.Dimensions ||
            filter === CatalogFilter.Metrics
        ) {
            type = CatalogType.Field;
        } else if (filter === CatalogFilter.Tables) {
            type = CatalogType.Table;
        }
    }

    return useQuery<ApiCatalogResults, ApiError>({
        queryKey: ['catalog', projectUuid, type, filter, search],
        queryFn: () =>
            fetchCatalog({
                projectUuid,
                search,
                type,
                filter,
            }),
        retry: false,
        enabled: !search || search.length > 2,
        onError: (result) => setErrorResponse(result),
    });
};
