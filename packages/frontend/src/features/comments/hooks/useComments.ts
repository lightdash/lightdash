import { ApiCommentsResults, ApiError, Comment } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type CreateDashboardTileComment = Pick<
    Comment,
    'text' | 'textHtml' | 'mentions'
> & {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    replyTo?: string;
};

const createDashboardTileComment = async ({
    dashboardUuid,
    dashboardTileUuid,
    text,
    textHtml,
    replyTo,
    mentions,
}: CreateDashboardTileComment) =>
    lightdashApi<null>({
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
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, CreateDashboardTileComment>(
        (data) => createDashboardTileComment(data),
        {
            mutationKey: ['create-comment'],
            onSuccess: async (_, { dashboardUuid }) => {
                await queryClient.invalidateQueries([
                    'comments',
                    dashboardUuid,
                ]);
            },
            retry: (_, error) => error.error.statusCode !== 403,
        },
    );
};

const getDashboardComments = async ({
    dashboardUuid,
}: Pick<CreateDashboardTileComment, 'dashboardUuid'>) =>
    lightdashApi<ApiCommentsResults>({
        url: `/comments/dashboards/${dashboardUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useGetComments = (dashboardUuid: string, enabled: boolean) => {
    return useQuery<ApiCommentsResults, ApiError>(
        ['comments', dashboardUuid],
        () => getDashboardComments({ dashboardUuid }),
        {
            retry: (_, error) => error.error.statusCode !== 403,
            enabled,
        },
    );
};

const removeComment = async ({
    commentId,
    dashboardUuid,
}: { commentId: string } & Pick<CreateDashboardTileComment, 'dashboardUuid'>) =>
    lightdashApi<null>({
        url: `/comments/dashboards/${dashboardUuid}/${commentId}`,
        method: 'DELETE',
        body: undefined,
    });

export const useRemoveComment = () => {
    const queryClient = useQueryClient();

    return useMutation<
        null,
        ApiError,
        { commentId: string } & Pick<
            CreateDashboardTileComment,
            'dashboardUuid'
        >
    >((data) => removeComment(data), {
        mutationKey: ['remove-comment'],
        onSuccess: async (_, { dashboardUuid }) => {
            await queryClient.invalidateQueries(['comments', dashboardUuid]);
        },
    });
};
