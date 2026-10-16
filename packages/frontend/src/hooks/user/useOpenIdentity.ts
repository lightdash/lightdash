import {
    type ApiError,
    type DeleteOpenIdentity,
    type OpenIdIdentitySummary,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../../api';
import useToaster from '../toaster/useToaster';

const deleteOpenIdentity = async (data: DeleteOpenIdentity) =>
    lightdashApi<null>({
        url: `/user/identity`,
        method: 'DELETE',
        body: JSON.stringify(data),
    });

export const useDeleteOpenIdentityMutation = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, DeleteOpenIdentity>(deleteOpenIdentity, {
        onSuccess: async () => {
            await queryClient.invalidateQueries(['user_identities']);
            showToastSuccess({
                title: t('useOpenIdentity.deletedSocialLoginWasDeleted'),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('useOpenIdentity.failedToDeleteSocialLogin'),
                apiError: error,
            });
        },
    });
};

const getIdentitiesQuery = async () =>
    lightdashApi<
        Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>
    >({
        url: '/user/identities',
        method: 'GET',
        body: undefined,
    });

export const useOpenIdentities = () =>
    useQuery<
        Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>,
        ApiError
    >({
        queryKey: ['user_identities'],
        queryFn: getIdentitiesQuery,
    });
