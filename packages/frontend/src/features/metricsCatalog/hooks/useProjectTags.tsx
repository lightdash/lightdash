import {
    type ApiCreateTagResponse,
    type ApiError,
    type ApiGetTagsResponse,
    type ApiMetricsCatalog,
    type ApiSuccessEmpty,
    type Tag,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type InfiniteData,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { updateMetricsCatalogQuery } from '../utils/updateMetricsCatalogQuery';
import { addCategoryToCatalogItem } from './useCatalogCategories';

const createTag = async (
    projectUuid: string,
    data: Pick<Tag, 'name' | 'color'>,
) => {
    return lightdashApi<ApiCreateTagResponse['results']>({
        url: `/projects/${projectUuid}/tags`,
        method: 'POST',
        body: JSON.stringify(data),
    });
};

/**
 * Create a tag in a project and tag it to a catalog item if provided
 */
export const useCreateTag = () => {
    const queryClient = useQueryClient();

    return useMutation<
        ApiCreateTagResponse['results'],
        ApiError,
        {
            projectUuid: string;
            data: Pick<Tag, 'name' | 'color'>;
            catalogSearchUuid?: string;
        },
        {
            previousCatalog: unknown;
        }
    >({
        mutationKey: ['create-tag'],
        mutationFn: async ({ projectUuid, data, catalogSearchUuid }) => {
            const newTag = await createTag(projectUuid, data);
            if (catalogSearchUuid) {
                await addCategoryToCatalogItem({
                    projectUuid,
                    catalogSearchUuid,
                    tagUuid: newTag.tagUuid,
                });
            }
            return newTag;
        },
        onMutate: async ({ projectUuid, data, catalogSearchUuid }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({
                queryKey: ['project-tags', projectUuid],
            });
            await queryClient.cancelQueries({
                queryKey: ['metrics-catalog', projectUuid],
            });

            const optimisticTag: Tag = {
                tagUuid: `temp-${Date.now()}`,
                name: data.name,
                color: data.color,
                createdAt: new Date(),
                projectUuid,
                createdBy: {
                    userUuid: 'user',
                    firstName: 'user',
                    lastName: 'user',
                },
            };

            // Update project tags
            queryClient.setQueryData(
                ['project-tags', projectUuid],
                (old: Tag[] = []) => [...old, optimisticTag],
            );

            // Get previous catalog state before updates
            const previousCatalog = queryClient.getQueryData([
                'metrics-catalog',
                projectUuid,
            ]);

            // Update metrics catalog if needed
            if (catalogSearchUuid) {
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
                                    optimisticTag,
                                ].sort((a, b) =>
                                    a.name
                                        .toLowerCase()
                                        .localeCompare(b.name.toLowerCase()),
                                );
                            },
                            catalogSearchUuid,
                        ),
                );
            }

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
            void queryClient.invalidateQueries(['project-tags', projectUuid]);
        },
    });
};

const getTags = async (projectUuid: string) => {
    return lightdashApi<ApiGetTagsResponse['results']>({
        url: `/projects/${projectUuid}/tags`,
        method: 'GET',
        body: undefined,
    });
};

/**
 * Get all tags available in a project
 */
export const useProjectTags = (projectUuid: string | undefined) => {
    return useQuery<ApiGetTagsResponse['results'], ApiError>({
        queryKey: ['project-tags', projectUuid],
        queryFn: () => getTags(projectUuid!),
        enabled: !!projectUuid,
    });
};

const updateTag = async (
    projectUuid: string,
    tagUuid: string,
    data: Pick<Tag, 'name' | 'color'>,
) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/${projectUuid}/tags/${tagUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });
};

/**
 * Update a tag's name or color in a project
 */
export const useUpdateTag = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        {
            projectUuid: string;
            tagUuid: string;
            data: Pick<Tag, 'name' | 'color'>;
        },
        {
            previousCatalog: unknown;
        }
    >({
        mutationKey: ['update-tag'],
        mutationFn: ({ projectUuid, tagUuid, data }) => {
            return updateTag(projectUuid, tagUuid, data);
        },
        onMutate: async ({ projectUuid, tagUuid, data }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries(['project-tags', projectUuid]);
            await queryClient.cancelQueries(['metrics-catalog', projectUuid]);

            // Get previous catalog state
            const previousCatalog = queryClient.getQueryData([
                'metrics-catalog',
                projectUuid,
            ]);

            // Optimistically update project tags
            queryClient.setQueryData(
                ['project-tags', projectUuid],
                (old: Tag[] = []) => {
                    return old.map((tag) =>
                        tag.tagUuid === tagUuid ? { ...tag, ...data } : tag,
                    );
                },
            );

            // Optimistically update metrics catalog
            queryClient.setQueriesData<
                InfiniteData<ApiMetricsCatalog['results']>
            >(
                {
                    queryKey: ['metrics-catalog', projectUuid],
                    exact: false,
                },
                (old) =>
                    updateMetricsCatalogQuery(old, (item) => {
                        item.categories = item.categories.map((category) =>
                            category.tagUuid === tagUuid
                                ? { ...category, ...data }
                                : category,
                        );
                    }),
            );

            return { previousCatalog };
        },
        onError: (_, {}, context) => {
            if (context?.previousCatalog) {
                Object.entries(context.previousCatalog).forEach(
                    ([queryKeyStr, data]) => {
                        const queryKey = JSON.parse(queryKeyStr);
                        queryClient.setQueryData<ApiMetricsCatalog['results']>(
                            queryKey,
                            data,
                        );
                    },
                );
            }
        },
        onSettled: (_, __, { projectUuid }) => {
            void queryClient.invalidateQueries([
                'metrics-catalog',
                projectUuid,
            ]);
            void queryClient.invalidateQueries(['project-tags', projectUuid]);
        },
    });
};

const deleteTag = async (projectUuid: string, tagUuid: string) => {
    return lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/tags/${tagUuid}`,
        method: 'DELETE',
        body: undefined,
    });
};

/**
 * Delete a tag from a project
 */
export const useDeleteTag = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { projectUuid: string; tagUuid: string },
        {
            previousCatalog: unknown;
        }
    >({
        mutationKey: ['delete-tag'],
        mutationFn: ({ projectUuid, tagUuid }) => {
            return deleteTag(projectUuid, tagUuid);
        },
        onMutate: async ({ projectUuid, tagUuid }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries(['project-tags', projectUuid]);
            await queryClient.cancelQueries(['metrics-catalog', projectUuid]);

            // Get previous catalog state
            const previousCatalog = queryClient.getQueryData([
                'metrics-catalog',
                projectUuid,
            ]);

            // Optimistically update project tags
            queryClient.setQueryData(
                ['project-tags', projectUuid],
                (old: Tag[] = []) => {
                    return old.filter((tag) => tag.tagUuid !== tagUuid);
                },
            );

            // Optimistically update metrics catalog
            queryClient.setQueriesData<
                InfiniteData<ApiMetricsCatalog['results']>
            >(
                {
                    queryKey: ['metrics-catalog', projectUuid],
                    exact: false,
                },
                (old) =>
                    updateMetricsCatalogQuery(old, (item) => {
                        item.categories = item.categories.filter(
                            (category) => category.tagUuid !== tagUuid,
                        );
                    }),
            );

            return { previousCatalog };
        },
        onError: (_, {}, context) => {
            if (context?.previousCatalog) {
                Object.entries(context.previousCatalog).forEach(
                    ([queryKeyStr, data]) => {
                        const queryKey = JSON.parse(queryKeyStr);
                        queryClient.setQueryData<ApiMetricsCatalog['results']>(
                            queryKey,
                            data,
                        );
                    },
                );
            }
        },
        onSettled: (_, __, { projectUuid }) => {
            void queryClient.invalidateQueries([
                'metrics-catalog',
                projectUuid,
            ]);
            void queryClient.invalidateQueries(['project-tags', projectUuid]);
        },
    });
};
