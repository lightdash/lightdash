import {
    type ApiCreateTagResponse,
    type ApiError,
    type ApiGetTagsResponse,
    type ApiSuccessEmpty,
    type Tag,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

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
        { projectUuid: string; data: Pick<Tag, 'name' | 'color'> }
    >({
        mutationFn: ({ projectUuid, data }) => createTag(projectUuid, data),
        onSuccess: async () => {
            await queryClient.invalidateQueries(['project-tags']);
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
