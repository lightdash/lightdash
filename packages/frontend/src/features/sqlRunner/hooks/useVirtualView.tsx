import {
    type ApiCreateVirtualView,
    type ApiError,
    type CreateVirtualViewPayload,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
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
