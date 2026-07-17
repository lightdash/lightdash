import {
    type AnnouncementCategory,
    type AnnouncementsPage,
    type ApiError,
    type CreateAnnouncementCategoryRequest,
    type CreateAnnouncementRequest,
    type ProjectAnnouncement,
    type UpdateAnnouncementRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const ANNOUNCEMENTS_QUERY_KEY = 'project_announcements';
const CATEGORIES_QUERY_KEY = 'project_announcement_categories';

type ListOptions = {
    page?: number;
    pageSize?: number;
    categoryUuid?: string;
};

const listAnnouncementsApi = async (
    projectUuid: string,
    options: ListOptions,
) => {
    const params = new URLSearchParams({
        page: String(options.page ?? 1),
        pageSize: String(options.pageSize ?? 25),
    });
    if (options.categoryUuid) params.set('categoryUuid', options.categoryUuid);
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
            options.categoryUuid ?? null,
        ],
        queryFn: () => listAnnouncementsApi(projectUuid, options),
        keepPreviousData: true,
    });

export const useAnnouncementCategories = (projectUuid: string) =>
    useQuery<AnnouncementCategory[], ApiError>({
        queryKey: [CATEGORIES_QUERY_KEY, projectUuid],
        queryFn: () =>
            lightdashApi<AnnouncementCategory[]>({
                url: `/projects/${projectUuid}/announcements/categories`,
                method: 'GET',
                body: undefined,
            }),
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

export const useCreateAnnouncementCategory = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    return useMutation<
        AnnouncementCategory,
        ApiError,
        CreateAnnouncementCategoryRequest
    >({
        mutationFn: (body) =>
            lightdashApi<AnnouncementCategory>({
                url: `/projects/${projectUuid}/announcements/categories`,
                method: 'POST',
                body: JSON.stringify(body),
            }),
        onSuccess: () =>
            queryClient.invalidateQueries([CATEGORIES_QUERY_KEY, projectUuid]),
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to create category',
                apiError: error,
            }),
    });
};
