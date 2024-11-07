import { type ApiError, type ApiSuccessEmpty } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type AddCategoryToCatalogItemParams = {
    projectUuid: string;
    catalogSearchUuid: string;
    tagUuid: string;
};

const addCategoryToCatalogItem = async ({
    projectUuid,
    catalogSearchUuid,
    tagUuid,
}: AddCategoryToCatalogItemParams) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/dataCatalog/${catalogSearchUuid}/categories`,
        method: 'POST',
        body: JSON.stringify({ tagUuid }),
    });
};

/**
 * Add a category to a catalog item
 */
export const useAddCategoryToCatalogItem = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        AddCategoryToCatalogItemParams
    >({
        mutationFn: addCategoryToCatalogItem,
        onSuccess: async () => {
            await queryClient.invalidateQueries(['metrics-catalog']);
        },
    });
};

type RemoveCategoryFromCatalogItemParams = AddCategoryToCatalogItemParams;

const removeCategoryFromCatalogItem = async ({
    projectUuid,
    catalogSearchUuid,
    tagUuid,
}: RemoveCategoryFromCatalogItemParams) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/dataCatalog/${catalogSearchUuid}/categories/${tagUuid}`,
        method: 'DELETE',
        body: undefined,
    });
};

/**
 * Remove a category from a catalog item
 */
export const useRemoveCategoryFromCatalogItem = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        RemoveCategoryFromCatalogItemParams
    >({
        mutationFn: removeCategoryFromCatalogItem,
        onSuccess: async () => {
            await queryClient.invalidateQueries(['metrics-catalog']);
        },
    });
};
