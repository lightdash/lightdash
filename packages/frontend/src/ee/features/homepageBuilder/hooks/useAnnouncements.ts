import {
    type AnnouncementsPage,
    type ApiError,
    type CreateAnnouncementRequest,
    type ProjectAnnouncement,
    type UpdateAnnouncementRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

export const ANNOUNCEMENTS_QUERY_KEY = 'project_announcements';

type ListOptions = {
    page?: number;
    pageSize?: number;
    /** Include unpublished (draft) announcements — build mode only. */
    includeUnpublished?: boolean;
};

const listAnnouncementsApi = async (
    projectUuid: string,
    options: ListOptions,
) => {
    const params = new URLSearchParams({
        page: String(options.page ?? 1),
        pageSize: String(options.pageSize ?? 25),
    });
    if (options.includeUnpublished) {
        params.set('includeUnpublished', 'true');
    }
    return lightdashApi<AnnouncementsPage>({
        url: `/projects/${projectUuid}/announcements?${params.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const useAnnouncements = (
    projectUuid: string,
    options: ListOptions = {},
) =>
    useQuery<AnnouncementsPage, ApiError>({
        queryKey: [
            ANNOUNCEMENTS_QUERY_KEY,
            projectUuid,
            options.page ?? 1,
            options.pageSize ?? 25,
            options.includeUnpublished ?? false,
        ],
        queryFn: () => listAnnouncementsApi(projectUuid, options),
        keepPreviousData: true,
    });

export const useCreateAnnouncement = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ProjectAnnouncement,
        ApiError,
        CreateAnnouncementRequest
    >({
        mutationFn: (body) =>
            lightdashApi<ProjectAnnouncement>({
                url: `/projects/${projectUuid}/announcements`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: () =>
            queryClient.invalidateQueries([
                ANNOUNCEMENTS_QUERY_KEY,
                projectUuid,
            ]),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to post announcement',
                apiError: error,
            }),
    });
};

export const useUpdateAnnouncement = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        ProjectAnnouncement,
        ApiError,
        { announcementUuid: string } & UpdateAnnouncementRequest
    >({
        mutationFn: ({ announcementUuid, ...body }) =>
            lightdashApi<ProjectAnnouncement>({
                url: `/projects/${projectUuid}/announcements/${announcementUuid}`,
                method: 'PATCH',
                body: JSON.stringify(body),
            }),
        onSuccess: () =>
            queryClient.invalidateQueries([
                ANNOUNCEMENTS_QUERY_KEY,
                projectUuid,
            ]),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to update announcement',
                apiError: error,
            }),
    });
};

export const useDeleteAnnouncement = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<undefined, ApiError, string>({
        mutationFn: (announcementUuid) =>
            lightdashApi<undefined>({
                url: `/projects/${projectUuid}/announcements/${announcementUuid}`,
                method: 'DELETE',
                body: undefined,
            }),
        onSuccess: () =>
            queryClient.invalidateQueries([
                ANNOUNCEMENTS_QUERY_KEY,
                projectUuid,
            ]),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to delete announcement',
                apiError: error,
            }),
    });
};

export const useUploadAnnouncementImage = (projectUuid: string) => {
    const { showToastApiError } = useToaster();
    return useMutation<{ url: string }, ApiError, File>({
        mutationFn: (file) =>
            lightdashApi<{ url: string }>({
                url: `/projects/${projectUuid}/announcements/images`,
                method: 'POST',
                headers: { 'Content-Type': file.type },
                body: file,
            }),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to upload image',
                apiError: error,
            }),
    });
};

/**
 * Same endpoint, neutral name — homepage blocks other than announcements
 * upload their images here too.
 */
export const useUploadHomepageImage = useUploadAnnouncementImage;
