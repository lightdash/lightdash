import {
    type ApiError,
    type CreateSpace,
    type Space,
    type SpaceSummary,
    type UpdateSpace,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useUser from './user/useUser';

const getSpaceSummaries = async (projectUuid: string) => {
    return lightdashApi<SpaceSummary[]>({
        url: `/projects/${projectUuid}/spaces`,
        method: 'GET',
        body: undefined,
    });
};

export const useSpaceSummaries = (
    projectUuid: string,
    includePrivateSpaces: boolean = false,
    queryOptions?: UseQueryOptions<SpaceSummary[], ApiError>,
) => {
    const { data: user } = useUser(true);
    return useQuery<SpaceSummary[], ApiError>(
        ['projects', projectUuid, 'spaces'],
        () => getSpaceSummaries(projectUuid),
        {
            select: (data) =>
                // only get spaces that the user has direct access to
                !includePrivateSpaces
                    ? data.filter(
                          (space) =>
                              !space.isPrivate ||
                              (!!user && space.access.includes(user.userUuid)),
                      )
                    : data,
            ...queryOptions,
        },
    );
};

const getSpace = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useSpace = (
    projectUuid: string,
    spaceUuid: string,
    useQueryOptions?: UseQueryOptions<Space, ApiError>,
) =>
    useQuery<Space, ApiError>({
        queryKey: ['space', projectUuid, spaceUuid],
        queryFn: () => getSpace(projectUuid, spaceUuid),
        ...useQueryOptions,
    });

const deleteQuery = async (projectUuid: string, spaceUuid: string) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useSpaceDeleteMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<null, ApiError, string>(
        (spaceUuid) => deleteQuery(projectUuid, spaceUuid),
        {
            mutationKey: ['space_delete', projectUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'projects',
                    projectUuid,
                    'spaces',
                ]);
                await queryClient.invalidateQueries(['pinned_items']);
                showToastSuccess({
                    title: `Success! Space was deleted.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete space`,
                    apiError: error,
                });
            },
        },
    );
};

const updateSpace = async (
    projectUuid: string,
    spaceUuid: string,
    data: UpdateSpace,
) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateMutation = (projectUuid: string, spaceUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<Space, ApiError, UpdateSpace>(
        (data) => updateSpace(projectUuid, spaceUuid, data),
        {
            mutationKey: ['space_update', projectUuid],
            onSuccess: async (data) => {
                await queryClient.invalidateQueries([
                    'projects',
                    projectUuid,
                    'spaces',
                ]);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.refetchQueries(['spaces', projectUuid]);
                queryClient.setQueryData(
                    ['space', projectUuid, spaceUuid],
                    data,
                );

                showToastSuccess({
                    title: `Success! Space was updated.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update space`,
                    apiError: error,
                });
            },
        },
    );
};

const createSpace = async (projectUuid: string, data: CreateSpace) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateMutation = (
    projectUuid: string,
    options?: {
        onSuccess?: (space: Space) => void;
    },
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<Space, ApiError, CreateSpace>(
        (data) => createSpace(projectUuid, data),
        {
            mutationKey: ['space_create', projectUuid],
            onSuccess: async (space) => {
                await queryClient.invalidateQueries([
                    'projects',
                    projectUuid,
                    'spaces',
                ]);

                options?.onSuccess?.(space);

                showToastSuccess({
                    title: `Success! Space was created.`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create space`,
                    apiError: error,
                });
            },
        },
    );
};

const addSpaceUserAccess = async (
    projectUuid: string,
    spaceUuid: string,
    userUuid: string,
    spaceRole: string,
) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}/share`,
        method: 'POST',
        body: JSON.stringify({ userUuid, spaceRole }),
    });

export const useAddSpaceShareMutation = (
    projectUuid: string,
    spaceUuid: string,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<Space, ApiError, [string, string]>(
        ([userUuid, spaceRole]) =>
            addSpaceUserAccess(projectUuid, spaceUuid, userUuid, spaceRole),
        {
            mutationKey: ['space_share', projectUuid, spaceUuid],
            onSuccess: async () => {
                await queryClient.refetchQueries(['spaces', projectUuid]);
                await queryClient.refetchQueries([
                    'space',
                    projectUuid,
                    spaceUuid,
                ]);

                showToastSuccess({
                    title: `Success! Space access updated!`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update space access`,
                    apiError: error,
                });
            },
        },
    );
};

const deleteSpaceShare = async (
    projectUuid: string,
    spaceUuid: string,
    userUuid: string,
) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}/share/${userUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteSpaceShareMutation = (
    projectUuid: string,
    spaceUuid: string,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<null, ApiError, string>(
        (userUuid) => deleteSpaceShare(projectUuid, spaceUuid, userUuid),
        {
            mutationKey: ['space_unshare', projectUuid, spaceUuid],
            onSuccess: async () => {
                await queryClient.refetchQueries(['spaces', projectUuid]);
                await queryClient.refetchQueries([
                    'space',
                    projectUuid,
                    spaceUuid,
                ]);

                showToastSuccess({
                    title: `Success! Space access updated!`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update space access`,
                    apiError: error,
                });
            },
        },
    );
};

const addGroupSpaceShare = async (
    projectUuid: string,
    spaceUuid: string,
    groupUuid: string,
    spaceRole: string,
) =>
    lightdashApi<Space>({
        url: `/projects/${projectUuid}/spaces/${spaceUuid}/group/share`,
        method: 'POST',
        body: JSON.stringify({ groupUuid, spaceRole }),
    });

export const useAddGroupSpaceShareMutation = (
    projectUuid: string,
    spaceUuid: string,
) => {
    const { showToastSuccess, showToastError } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<Space, ApiError, [string, string]>(
        ([groupUuid, spaceRole]) =>
            addGroupSpaceShare(projectUuid, spaceUuid, groupUuid, spaceRole),
        {
            mutationKey: ['group_space_share', projectUuid, spaceUuid],
            onSuccess: async () => {
                await queryClient.refetchQueries(['spaces', projectUuid]);
                await queryClient.refetchQueries([
                    'space',
                    projectUuid,
                    spaceUuid,
                ]);

                showToastSuccess({
                    title: `Success! Space group access updated!`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to update space group access`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

// const deleteGroupSpaceShare = async (
//     projectUuid: string,
//     spaceUuid: string,
//     groupUuid: string,
// ) =>
//     lightdashApi<null>({
//         url: `/projects/${projectUuid}/spaces/${spaceUuid}/group/share/${groupUuid}`,
//         method: 'DELETE',
//         body: undefined,
//     });

// export const useDeleteSpaceGroupAccessMutation = (
//     projectUuid: string,
//     spaceUuid: string,
// ) => {
//     const { showToastSuccess, showToastError } = useToaster();
//     const queryClient = useQueryClient();

//     return useMutation<null, ApiError, string>(
//         (groupUuid) => deleteGroupSpaceShare(projectUuid, spaceUuid, groupUuid),
//         {
//             mutationKey: ['group_space_unshare', projectUuid, spaceUuid],
//             onSuccess: async () => {
//                 await queryClient.refetchQueries(['spaces', projectUuid]);
//                 await queryClient.refetchQueries([
//                     'space',
//                     projectUuid,
//                     spaceUuid,
//                 ]);

//                 showToastSuccess({
//                     title: `Success! Space group access updated!`,
//                 });
//             },
//             onError: (error) => {
//                 showToastError({
//                     title: `Failed to update space group access`,
//                     subtitle: error.error.message,
//                 });
//             },
//         },
//     );
// };
