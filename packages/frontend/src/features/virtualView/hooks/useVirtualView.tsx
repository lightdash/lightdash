import {
    type ApiCreateVirtualView,
    type ApiError,
    type ApiSuccessEmpty,
    type CreateVirtualViewPayload,
    type UpdateVirtualViewPayload,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useHistory } from 'react-router-dom';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const createVirtualView = async ({
    projectUuid,
    name,
    sql,
    columns,
}: {
    projectUuid: string;
} & CreateVirtualViewPayload) =>
    lightdashApi<ApiCreateVirtualView['results']>({
        url: `/projects/${projectUuid}/sqlRunner/virtual-view`,
        method: 'POST',
        body: JSON.stringify({
            name,
            sql,
            columns,
        }),
    });

/**
 * Create a virtual view (a.k.a. custom explore) - users can query from them in the Explore view
 */
export const useCreateVirtualView = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        ApiCreateVirtualView['results'],
        ApiError,
        {
            projectUuid: string;
        } & CreateVirtualViewPayload
    >({
        mutationFn: createVirtualView,
        onSuccess: (data) => {
            showToastSuccess({
                title: 'Success! Virtual view created',
                action: {
                    children: 'Query from new virtual view',
                    icon: IconArrowRight,
                    onClick: () => {
                        window.open(
                            `/projects/${projectUuid}/tables/${data.name}`,
                            '_blank',
                        );
                    },
                },
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Error creating virtual view',
                apiError: error,
            });
        },
    });
};

const updateVirtualView = async ({
    exploreName,
    projectUuid,
    name,
    sql,
    columns,
}: {
    exploreName: string;
    projectUuid: string;
} & UpdateVirtualViewPayload) =>
    lightdashApi<ApiCreateVirtualView['results']>({
        url: `/projects/${projectUuid}/sqlRunner/virtual-view/${exploreName}`,
        method: 'PUT',
        body: JSON.stringify({
            name,
            sql,
            columns,
        }),
    });

export const useUpdateVirtualView = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiCreateVirtualView['results'],
        ApiError,
        { projectUuid: string; exploreName: string } & UpdateVirtualViewPayload
    >({
        mutationFn: updateVirtualView,
        onSuccess: async ({ name }) => {
            await queryClient.invalidateQueries({
                queryKey: ['tables', projectUuid, 'filtered'],
            });
            await queryClient.invalidateQueries({
                queryKey: ['tables', name, projectUuid],
            });
            showToastSuccess({
                title: 'Success! Virtual view updated',
            });
        },
        onError: () => {
            showToastError({
                title: 'Error updating virtual view',
            });
        },
    });
};

const deleteVirtualView = async ({
    projectUuid,
    name,
}: {
    projectUuid: string;
    name: string;
}) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/sqlRunner/virtual-view/${name}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteVirtualView = (projectUuid: string) => {
    const history = useHistory();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { projectUuid: string; name: string }
    >({
        mutationFn: deleteVirtualView,
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: ['tables', projectUuid, 'filtered'],
            });

            showToastSuccess({
                title: 'Success! Virtual view deleted',
            });

            history.push(`/projects/${projectUuid}/tables`);
        },
        onError: () => {
            showToastError({
                title: 'Error deleting virtual view',
            });
        },
    });
};
