import {
    type ApiError,
    type ApiMetricsCatalog,
    type ApiSuccessEmpty,
    type Tag,
} from '@lightdash/common';
import {
    useMutation,
    useQueryClient,
    type InfiniteData,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { updateMetricsCatalogQuery } from '../utils/updateMetricsCatalogQuery';

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
        AddCategoryToCatalogItemParams,
        {
            previousCatalog: unknown;
        }
    >({
        mutationKey: ['add-category'],
        mutationFn: addCategoryToCatalogItem,
        onMutate: async ({ catalogSearchUuid, tagUuid, projectUuid }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({
                queryKey: ['metrics-catalog', projectUuid],
            });

            // Get the existing tag
            const existingTag = queryClient
                .getQueryData<Tag[]>(['project-tags', projectUuid])
                ?.find((tag) => tag.tagUuid === tagUuid);

            if (!existingTag) return { previousCatalog: null };

            // Get the previous catalog state
            const previousCatalog = queryClient.getQueryData([
                'metrics-catalog',
                projectUuid,
            ]);

            queryClient.setQueriesData<
                InfiniteData<ApiMetricsCatalog['results']>
            >(
                {
                    queryKey: ['metrics-catalog', projectUuid],
                    exact: false,
                },
                (old) =>
                    updateMetricsCatalogQuery(
                        old,
                        (item) => {
                            item.categories = [
                                ...item.categories,
                                existingTag,
                            ].sort((a, b) =>
                                a.name
                                    .toLowerCase()
                                    .localeCompare(b.name.toLowerCase()),
                            );
                        },
                        catalogSearchUuid,
                    ),
            );

            return { previousCatalog };
        },
        onError: (_, __, context) => {
            if (context?.previousCatalog) {
                Object.entries(context.previousCatalog).forEach(
                    ([queryKeyStr, data]) => {
                        const queryKey = JSON.parse(queryKeyStr);
                        queryClient.setQueryData<
                            InfiniteData<ApiMetricsCatalog['results']>
                        >(queryKey, data);
                    },
                );
            }
        },
        onSettled: (_, __, { projectUuid }) => {
            void queryClient.invalidateQueries([
                'metrics-catalog',
                projectUuid,
            ]);
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
        RemoveCategoryFromCatalogItemParams,
        {
            previousCatalog: unknown;
        }
    >({
        mutationKey: ['remove-category'],
        mutationFn: removeCategoryFromCatalogItem,
        onMutate: async ({ catalogSearchUuid, tagUuid, projectUuid }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({
                queryKey: ['metrics-catalog', projectUuid],
            });

            // Get the previous catalog state
            const previousCatalog = queryClient.getQueryData([
                'metrics-catalog',
                projectUuid,
            ]);

            queryClient.setQueriesData<
                InfiniteData<ApiMetricsCatalog['results']>
            >(
                {
                    queryKey: ['metrics-catalog', projectUuid],
                    exact: false,
                },
                (old) =>
                    updateMetricsCatalogQuery(
                        old,
                        (item) => {
                            item.categories = item.categories.filter(
                                (category) => category.tagUuid !== tagUuid,
                            );
                        },
                        catalogSearchUuid,
                    ),
            );

            return { previousCatalog };
        },
        onError: (_, __, context) => {
            if (context?.previousCatalog) {
                Object.entries(context.previousCatalog).forEach(
                    ([queryKeyStr, data]) => {
                        const queryKey = JSON.parse(queryKeyStr);
                        queryClient.setQueryData<
                            InfiniteData<ApiMetricsCatalog['results']>
                        >(queryKey, data);
                    },
                );
            }
        },
        onSettled: (_, __, { projectUuid }) => {
            void queryClient.invalidateQueries([
                'metrics-catalog',
                projectUuid,
            ]);
        },
    });
};
