import {
    type ApiCreateTagResponse,
    type ApiError,
    type ApiGetTagsResponse,
    type ApiSuccessEmpty,
    type Tag,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type TagCatalogItemParams = {
    catalogSearchUuid: string;
    tagUuid: string;
};

const tagCatalogItem = async ({
    catalogSearchUuid,
    tagUuid,
}: TagCatalogItemParams) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/{projectUuid}/dataCatalog/${catalogSearchUuid}/tags`,
        method: 'POST',
        body: JSON.stringify({ tagUuid }),
    });
};

const untagCatalogItem = async ({
    catalogSearchUuid,
    tagUuid,
}: TagCatalogItemParams) => {
    return lightdashApi<ApiSuccessEmpty['results']>({
        url: `/projects/{projectUuid}/dataCatalog/${catalogSearchUuid}/tags/${tagUuid}`,
        method: 'DELETE',
        body: undefined,
    });
};

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

const getTags = async (projectUuid: string) => {
    return lightdashApi<ApiGetTagsResponse['results']>({
        url: `/projects/${projectUuid}/tags`,
        method: 'GET',
        body: undefined,
    });
};

/**
 * Tag a catalog item
 */
export const useTagCatalogItem = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        TagCatalogItemParams
    >({
        mutationFn: tagCatalogItem,
        onSuccess: async () => {
            await queryClient.invalidateQueries(['metrics-catalog']);
        },
    });
};

/**
 * Untag a catalog item
 */
export const useUntagCatalogItem = () => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiSuccessEmpty['results'],
        ApiError,
        TagCatalogItemParams
    >({
        mutationFn: untagCatalogItem,
        onSuccess: async () => {
            await queryClient.invalidateQueries(['metrics-catalog']);
        },
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
