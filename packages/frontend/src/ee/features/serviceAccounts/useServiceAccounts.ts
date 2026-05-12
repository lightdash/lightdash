import {
    type ApiError,
    type ProjectMemberRole,
    type ServiceAccount,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const CACHE_KEY = 'service-accounts';
type CreateServiceAccountResult = ServiceAccount & { token: string };

export const useServiceAccounts = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const listAccounts = useQuery<ServiceAccount[]>({
        queryKey: [CACHE_KEY],
        queryFn: () =>
            lightdashApi<ServiceAccount[]>({
                method: 'GET',
                url: '/service-accounts',
            }),
    });

    const createAccount = useMutation<
        CreateServiceAccountResult,
        ApiError,
        ServiceAccount
    >({
        mutationKey: [CACHE_KEY],
        mutationFn: (newAccount: ServiceAccount) => {
            return lightdashApi<CreateServiceAccountResult>({
                method: 'POST',
                url: '/service-accounts',
                body: JSON.stringify(newAccount),
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({
                title: `Service account created`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to create service account`,
                apiError: error,
            });
        },
    });

    const deleteAccount = useMutation<undefined, ApiError, string>({
        mutationFn: async (uuid: string) => {
            await lightdashApi<undefined>({
                method: 'DELETE',
                url: `/service-accounts/${uuid}`,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({
                title: `Service account deleted`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete service account`,
                apiError: error,
            });
        },
    });

    const rotateAccount = useMutation<
        CreateServiceAccountResult,
        ApiError,
        { uuid: string; expiresAt: string }
    >({
        mutationKey: [CACHE_KEY],
        mutationFn: ({ uuid, expiresAt }) =>
            lightdashApi<CreateServiceAccountResult>({
                method: 'PATCH',
                url: `/service-accounts/${uuid}/rotate`,
                body: JSON.stringify({ expiresAt }),
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({
                title: `Success! Your token was rotated.`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to rotate token`,
                apiError: error,
            });
        },
    });

    const setProjectMembership = useMutation<
        undefined,
        ApiError,
        {
            serviceAccountUuid: string;
            projectUuid: string;
            role: ProjectMemberRole | null;
            roleUuid: string | null;
        }
    >({
        mutationFn: ({ serviceAccountUuid, projectUuid, role, roleUuid }) =>
            lightdashApi<undefined>({
                method: 'PUT',
                url: `/service-accounts/${serviceAccountUuid}/project-memberships/${projectUuid}`,
                body: JSON.stringify({ role, roleUuid }),
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({ title: 'Project access updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update project access',
                apiError: error,
            });
        },
    });

    const removeProjectMembership = useMutation<
        undefined,
        ApiError,
        { serviceAccountUuid: string; projectUuid: string }
    >({
        mutationFn: ({ serviceAccountUuid, projectUuid }) =>
            lightdashApi<undefined>({
                method: 'DELETE',
                url: `/service-accounts/${serviceAccountUuid}/project-memberships/${projectUuid}`,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({ title: 'Project access removed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove project access',
                apiError: error,
            });
        },
    });

    return useMemo(() => {
        return {
            listAccounts,
            createAccount,
            deleteAccount,
            rotateAccount,
            setProjectMembership,
            removeProjectMembership,
        };
    }, [
        listAccounts,
        createAccount,
        deleteAccount,
        rotateAccount,
        setProjectMembership,
        removeProjectMembership,
    ]);
};
