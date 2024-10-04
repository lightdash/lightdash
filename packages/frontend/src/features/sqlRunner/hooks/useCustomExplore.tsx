import {
    type ApiCreateCustomExplore,
    type ApiError,
    type CreateCustomExplorePayload,
    type UpdateCustomExplorePayload,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const createCustomExplore = async ({
    projectUuid,
    name,
    sql,
    columns,
}: {
    projectUuid: string;
} & CreateCustomExplorePayload) =>
    lightdashApi<ApiCreateCustomExplore['results']>({
        url: `/projects/${projectUuid}/sqlRunner/create-custom-explore`,
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
export const useCreateCustomExplore = ({
    projectUuid,
}: {
    projectUuid: string;
}) => {
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<
        ApiCreateCustomExplore['results'],
        ApiError,
        {
            projectUuid: string;
        } & CreateCustomExplorePayload
    >({
        mutationFn: createCustomExplore,
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
    lightdashApi<ApiCreateCustomExplore['results']>({
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
        ApiCreateCustomExplore['results'],
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
