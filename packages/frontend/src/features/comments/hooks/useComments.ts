import {
    type ApiCreateComment,
    type ApiDeleteComment,
    type ApiError,
    type ApiGetComments,
    type ApiResolveComment,
    type Comment,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type CreateDashboardTileComment = Pick<
    Comment,
    'text' | 'textHtml' | 'mentions'
> & {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    replyTo?: string;
};

const createDashboardTileComment = async (
    lightdashApi: LightdashApi,
    {
        dashboardUuid,
        dashboardTileUuid,
        text,
        textHtml,
        replyTo,
        mentions,
    }: CreateDashboardTileComment,
) =>
    lightdashApi<ApiCreateComment['results']>({
        url: `/comments/dashboards/${dashboardUuid}/${dashboardTileUuid}`,
        method: 'POST',
        body: JSON.stringify({
            text,
            textHtml,
            replyTo,
            mentions,
        }),
    });

export const useCreateComment = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const params = useParams();

    return useMutation<
        ApiCreateComment['results'],
        ApiError,
        CreateDashboardTileComment
    >((data) => createDashboardTileComment(lightdashApi, data), {
        mutationKey: ['create-comment'],
        onSuccess: async (_, { dashboardUuid }) => {
            await Promise.all([
                queryClient.invalidateQueries(['comments', dashboardUuid]),
                queryClient.invalidateQueries([
                    'comments',
                    params.dashboardUuid,
                ]),
            ]);
        },
    });
};

const getDashboardComments = async (
    lightdashApi: LightdashApi,
    {
        dashboardUuid,
        projectUuid,
        resolved,
    }: Pick<CreateDashboardTileComment, 'dashboardUuid' | 'projectUuid'> & {
        resolved: boolean;
    },
) => {
    const queryParams = new URLSearchParams({ resolved: String(resolved) });
    return lightdashApi<ApiGetComments['results']>({
        url: `/projects/${projectUuid}/dashboards/${dashboardUuid}/comments?${queryParams.toString()}`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });
};

const useDashboardComments = (
    dashboardUuid: string | undefined,
    projectUuid: string | undefined,
    enabled: boolean,
    resolved: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiGetComments['results'], ApiError>(
        ['comments', dashboardUuid, projectUuid, { resolved }],
        async () => {
            if (!dashboardUuid) throw new Error('dashboardUuid is required');
            if (!projectUuid) throw new Error('projectUuid is required');
            return getDashboardComments(lightdashApi, {
                dashboardUuid,
                projectUuid,
                resolved,
            });
        },
        {
            // Only poll the active (unresolved) comments
            refetchInterval: resolved ? undefined : 3 * 60 * 1000,
            retry: (_, error) => error.error.statusCode !== 403,
            enabled: enabled && !!dashboardUuid && !!projectUuid,
        },
    );
};

export const useGetComments = (
    dashboardUuid: string | undefined,
    projectUuid: string | undefined,
    enabled: boolean,
) => useDashboardComments(dashboardUuid, projectUuid, enabled, false);

export const useGetResolvedComments = (
    dashboardUuid: string,
    projectUuid: string | undefined,
    enabled: boolean,
) => useDashboardComments(dashboardUuid, projectUuid, enabled, true);

type RemoveCommentParams = { commentId: string } & Pick<
    CreateDashboardTileComment,
    'dashboardUuid'
>;

const removeComment = async (
    lightdashApi: LightdashApi,
    { commentId, dashboardUuid }: RemoveCommentParams,
) =>
    lightdashApi<ApiDeleteComment>({
        url: `/comments/dashboards/${dashboardUuid}/${commentId}`,
        method: 'DELETE',
        body: undefined,
    });

export const useRemoveComment = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const params = useParams();

    return useMutation<ApiDeleteComment, ApiError, RemoveCommentParams>(
        (data) => removeComment(lightdashApi, data),
        {
            mutationKey: ['remove-comment'],
            onSuccess: async (_, { dashboardUuid }) => {
                await Promise.all([
                    queryClient.invalidateQueries(['comments', dashboardUuid]),
                    queryClient.invalidateQueries([
                        'comments',
                        params.dashboardUuid,
                    ]),
                ]);
            },
        },
    );
};

type ResolveCommentParams = { commentId: string; resolved: boolean } & Pick<
    CreateDashboardTileComment,
    'dashboardUuid'
>;

const resolveComment = async (
    lightdashApi: LightdashApi,
    { commentId, dashboardUuid, resolved }: ResolveCommentParams,
) =>
    lightdashApi<ApiResolveComment>({
        url: `/comments/dashboards/${dashboardUuid}/${commentId}`,
        method: 'PATCH',
        body: JSON.stringify({ resolved }),
    });

export const useResolveComment = () => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const params = useParams();

    return useMutation<ApiResolveComment, ApiError, ResolveCommentParams>(
        (data) => resolveComment(lightdashApi, data),
        {
            mutationKey: ['resolve-comment'],
            onSuccess: async (_, { dashboardUuid }) => {
                await Promise.all([
                    queryClient.invalidateQueries(['comments', dashboardUuid]),
                    queryClient.invalidateQueries([
                        'comments',
                        params.dashboardUuid,
                    ]),
                ]);
            },
        },
    );
};
