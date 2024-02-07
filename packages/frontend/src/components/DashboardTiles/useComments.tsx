import { ApiCommentsResults, ApiError } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../api';

type CreateDashboardTileComment = {
    projectUuid: string;
    dashboardUuid: string;
    dashboardTileUuid: string;
    text: string;
    replyTo?: string;
};

const createDashboardTileComment = async ({
    dashboardUuid,
    dashboardTileUuid,
    text,
    replyTo,
}: CreateDashboardTileComment) =>
    lightdashApi<null>({
        url: `/dashboards/${dashboardUuid}/${dashboardTileUuid}/comments`,
        method: 'POST',
        body: JSON.stringify({
            text,
            replyTo,
        }),
    });

export const useCreateComment = () => {
    const queryClient = useQueryClient();
    return useMutation<null, ApiError, CreateDashboardTileComment>(
        (data) => createDashboardTileComment(data),
        {
            mutationKey: ['create-comment'],
            onSuccess: async (_, { dashboardTileUuid, dashboardUuid }) => {
                await queryClient.invalidateQueries([
                    'comments',
                    dashboardUuid,
                    dashboardTileUuid,
                ]);
            },
        },
    );
};

const getDashboardTileComments = async ({
    dashboardTileUuid,
    dashboardUuid,
}: Pick<CreateDashboardTileComment, 'dashboardTileUuid' | 'dashboardUuid'>) =>
    lightdashApi<ApiCommentsResults>({
        url: `/dashboards/${dashboardUuid}/${dashboardTileUuid}/comments`,
        method: 'GET',
        body: undefined,
    });

export const useGetComments = (
    projectUuid: string,
    dashboardUuid: string,
    dashboardTileUuid: string,
) => {
    return useQuery<ApiCommentsResults, ApiError>(
        ['comments', dashboardUuid, dashboardTileUuid],
        () => getDashboardTileComments({ dashboardTileUuid, dashboardUuid }),
    );
};

const resolveComment = async ({
    commentId,
    dashboardTileUuid,
    dashboardUuid,
}: { commentId: string } & Pick<
    CreateDashboardTileComment,
    'dashboardTileUuid' | 'dashboardUuid'
>) =>
    lightdashApi<null>({
        url: `/dashboards/${dashboardUuid}/${dashboardTileUuid}/comments/${commentId}`,
        method: 'PATCH',
        body: undefined,
    });

export const useResolveComment = () => {
    const queryClient = useQueryClient();
    return useMutation<
        null,
        ApiError,
        { commentId: string } & Pick<
            CreateDashboardTileComment,
            'dashboardTileUuid' | 'dashboardUuid'
        >
    >((data) => resolveComment(data), {
        mutationKey: ['resolve-comment'],
        onSuccess: async (_, { dashboardTileUuid, dashboardUuid }) => {
            await queryClient.invalidateQueries([
                'comments',
                dashboardUuid,
                dashboardTileUuid,
            ]);
        },
    });
};
