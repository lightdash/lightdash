import {
    type ApiCreateServiceAccountRequest,
    type ApiError,
    type ServiceAccount,
    type ServiceAccountWithProjectAccessCount,
    type UpdateServiceAccount,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import i18n from '../../../i18n/i18n';

const CACHE_KEY = 'service-accounts';
type CreateServiceAccountResult = ServiceAccount & { token: string };

export const useServiceAccounts = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const listAccounts = useQuery<ServiceAccountWithProjectAccessCount[]>({
        queryKey: [CACHE_KEY],
        queryFn: () =>
            lightdashApi<ServiceAccountWithProjectAccessCount[]>({
                method: 'GET',
                url: '/service-accounts',
            }),
    });

    const createAccount = useMutation<
        CreateServiceAccountResult,
        ApiError,
        ApiCreateServiceAccountRequest
    >({
        mutationKey: [CACHE_KEY],
        mutationFn: (newAccount: ApiCreateServiceAccountRequest) => {
            return lightdashApi<CreateServiceAccountResult>({
                method: 'POST',
                url: '/service-accounts',
                body: JSON.stringify(newAccount),
                sensitive: true,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({
                title: i18n.t('toasts.created', { ns: 'serviceAccounts' }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.createFailed', { ns: 'serviceAccounts' }),
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
                title: i18n.t('toasts.deleted', { ns: 'serviceAccounts' }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.deleteFailed', { ns: 'serviceAccounts' }),
                apiError: error,
            });
        },
    });

    const updateAccount = useMutation<
        ServiceAccount,
        ApiError,
        { uuid: string } & UpdateServiceAccount
    >({
        mutationFn: ({ uuid, ...body }) =>
            lightdashApi<ServiceAccount>({
                method: 'PATCH',
                url: `/service-accounts/${uuid}`,
                body: JSON.stringify(body),
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            // Project-scoped edits change the grants list; refresh it so a
            // re-open of the edit modal shows the new project access.
            await queryClient.invalidateQueries([
                'service-account-project-grants',
            ]);
            showToastSuccess({
                title: i18n.t('toasts.updated', { ns: 'serviceAccounts' }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.updateFailed', { ns: 'serviceAccounts' }),
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
                sensitive: true,
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries([CACHE_KEY]);
            showToastSuccess({
                title: i18n.t('toasts.rotated', { ns: 'serviceAccounts' }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.rotateFailed', { ns: 'serviceAccounts' }),
                apiError: error,
            });
        },
    });

    return useMemo(() => {
        return {
            listAccounts,
            createAccount,
            updateAccount,
            deleteAccount,
            rotateAccount,
        };
    }, [
        listAccounts,
        createAccount,
        updateAccount,
        deleteAccount,
        rotateAccount,
    ]);
};
