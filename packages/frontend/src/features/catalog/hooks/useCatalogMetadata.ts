import {
    type ApiCatalogMetadataResults,
    type ApiError,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useQueryError from '../../../hooks/useQueryError';

export type GetCatalogMetadataParams = {
    projectUuid: string;
    table: string;
};

const fetchCatalogMetadata = async ({
    projectUuid,
    table,
}: GetCatalogMetadataParams) =>
    lightdashApi<ApiCatalogMetadataResults>({
        url: `/projects/${projectUuid}/dataCatalog/${table}/metadata`,
        method: 'GET',
        body: undefined,
    });

export const useCatalogMetadata = (projectUuid: string) => {
    const setErrorResponse = useQueryError();

    return useMutation<ApiCatalogMetadataResults, ApiError, string>(
        (table) => fetchCatalogMetadata({ projectUuid, table }),
        {
            mutationKey: ['catalog_metadata', projectUuid],
            onError: (result) => setErrorResponse(result),
        },
    );
};
