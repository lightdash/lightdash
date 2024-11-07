import {
    type ApiCreateTagResponse,
    type ApiError,
    type ApiGetTagsResponse,
    type ApiSuccessEmpty,
    type Tag,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
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
 * Create a tag in a project - it will be available to be used in any catalog item in that project
 */
export const useCreateTag = () => {
    const queryClient = useQueryClient();

    return useMutation<
        ApiCreateTagResponse['results'],
        ApiError,
        {
            projectUuid: string;
            data: Pick<Tag, 'name' | 'color'>;
            catalogSearchUuid?: string; // Make optional to support both with/without catalog item tagging
        },
        { previousTags: Tag[] }
    >({
        // @ts-expect-error - TODO: fix this
        mutationFn: async ({ projectUuid, data, catalogSearchUuid }) => {
            // First create the tag
            const newTag = await createTag(projectUuid, data);

            // If catalogSearchUuid is provided, also tag the catalog item
            if (catalogSearchUuid) {
                await addCategoryToCatalogItem({
                    projectUuid,
                    catalogSearchUuid,
                    tagUuid: newTag.tagUuid,
                });
            }

            return newTag;
        },
        onMutate: async ({ projectUuid, data }) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries(['project-tags', projectUuid]);

            // Snapshot the previous value
            const previousTags = queryClient.getQueryData<Tag[]>([
                'project-tags',
                projectUuid,
            ]);

            // Optimistically update the cache
            queryClient.setQueryData(
                ['project-tags', projectUuid],
                (old: Tag[] = []) => {
                    const optimisticTag: Tag = {
                        tagUuid: `temp-${Date.now()}`, // Temporary ID
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
                    return [...old, optimisticTag];
                },
            );

            // Return context with the snapshotted value
            return { previousTags };
        },
        onError: (err, variables, context) => {
            // If the mutation fails, roll back to the previous value
            if (context?.previousTags) {
                queryClient.setQueryData(
                    ['project-tags', variables.projectUuid],
                    context.previousTags,
                );
            }
        },
        onSuccess: async () => {
            void queryClient.invalidateQueries(['project-tags']);
            void queryClient.invalidateQueries(['metrics-catalog']);
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
        }
    >({
        mutationFn: ({ projectUuid, tagUuid, data }) =>
            updateTag(projectUuid, tagUuid, data),
        onSuccess: async () => {
            await queryClient.invalidateQueries(['metrics-catalog']);
            await queryClient.invalidateQueries(['project-tags']);
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
        { projectUuid: string; tagUuid: string }
    >({
        mutationFn: ({ projectUuid, tagUuid }) =>
            deleteTag(projectUuid, tagUuid),
        onSuccess: async () => {
            await queryClient.invalidateQueries(['metrics-catalog']);
            await queryClient.invalidateQueries(['project-tags']);
        },
        // TODO: show error toast on error
    });
};
