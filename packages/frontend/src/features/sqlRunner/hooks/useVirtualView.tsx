import {
    type ApiCreateVirtualView,
    type ApiError,
    type CreateVirtualViewPayload,
    type UpdateCustomExplorePayload,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
        url: `/projects/${projectUuid}/sqlRunner/create-virtual-view`,
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
    const { showToastSuccess, showToastError } = useToaster();
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
        onError: () => {
            showToastError({
                title: 'Error creating virtual view',
            });
        },
    });
};

const updateCustomExplore = async ({
    projectUuid,
    name,
    sql,
    columns,
    exploreName,
}: {
    projectUuid: string;
} & UpdateCustomExplorePayload) =>
    lightdashApi<ApiCreateVirtualView['results']>({
        url: `/projects/${projectUuid}/explores/updateVirtualView`,
        // TODO: should be patch/put in probably in sqlRunnerController
        method: 'POST',
        body: JSON.stringify({
            name,
            sql,
            columns,
            exploreName,
        }),
    });

export const useUpdateCustomExplore = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiCreateVirtualView['results'],
        ApiError,
        { projectUuid: string } & UpdateCustomExplorePayload
    >({
        mutationFn: updateCustomExplore,
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
