import {
    type ApiCreateTagResponse,
    type ApiError,
    type ApiGetTagsResponse,
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
