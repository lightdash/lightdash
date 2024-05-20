import { type ApiCatalogResults, type ApiError } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useQueryError from '../../../hooks/useQueryError';

export type GetCatalogParams = {
    projectUuid: string;
    allTables: boolean;
    allFields: boolean;
};

const fetchCatalog = async ({
    projectUuid,
    allTables,
    allFields,
}: GetCatalogParams) =>
    lightdashApi<ApiCatalogResults>({
        url: `/projects/${projectUuid}/dataCatalog?allTables=${allTables}&allFields=${allFields}`,
        method: 'GET',
        body: undefined,
    });

export const useCatalog = (
    projectUuid: string,
    allTables: boolean,
    allFields: boolean,
) => {
    const setErrorResponse = useQueryError();

    return useQuery<ApiCatalogResults, ApiError>({
        queryKey: ['comments', projectUuid, allTables, allFields],
        queryFn: () =>
            fetchCatalog({ projectUuid, allTables: true, allFields: true }),
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};
