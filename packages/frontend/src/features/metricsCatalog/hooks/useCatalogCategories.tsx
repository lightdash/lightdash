import { type ApiError, type ApiSuccessEmpty } from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type AddCategoryToCatalogItemParams = {
    projectUuid: string;
    catalogSearchUuid: string;
    tagUuid: string;
};

export const addCategoryToCatalogItem = async ({
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
        onMutate: async (variables) => {
            console.log('Adding category - Mutation started:', variables);
        },
        onSuccess: async () => {
            console.log('Adding category - API call successful');
            void queryClient.invalidateQueries(['metrics-catalog']);
        },
        onError: (error) => {
            console.error('Adding category - API call failed:', error);
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
        onMutate: async (variables) => {
            console.log('Removing category - Mutation started:', variables);
        },
        onSuccess: async () => {
            console.log('Removing category - API call successful');
            void queryClient.invalidateQueries(['metrics-catalog']);
        },
        onError: (error) => {
            console.error('Removing category - API call failed:', error);
        },
    });
};
