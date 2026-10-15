import {
    type ApiError,
    type CreateInviteLink,
    type InviteLink,
    type InviteLinkWithAuthenticationOptions,
    type LightdashUser,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const createInviteQuery = async (
    data: Omit<CreateInviteLink, 'expiresAt'>,
): Promise<InviteLink> => {
    const response = await lightdashApi<InviteLink>({
        url: `/invite-links`,
        method: 'POST',
        body: JSON.stringify(data),
    });
    return {
        ...response,
        expiresAt: new Date(response.expiresAt),
    };
};

const inviteLinkQuery = async (inviteCode: string) =>
    lightdashApi<InviteLinkWithAuthenticationOptions>({
        url: `/invite-links/${inviteCode}`,
        method: 'GET',
        body: undefined,
    });

export const useInviteLink = (inviteCode: string | undefined) =>
    useQuery<InviteLinkWithAuthenticationOptions, ApiError>({
        queryKey: ['invite_link', inviteCode],
        queryFn: () => inviteLinkQuery(inviteCode!),
        enabled: inviteCode !== undefined,
    });

const activateInviteLinkQuery = async (inviteCode: string) =>
    lightdashApi<LightdashUser>({
        url: `/invite-links/${inviteCode}/activate`,
        method: 'POST',
        body: undefined,
    });

export const useActivateInviteLinkMutation = (
    inviteCode: string | undefined,
    redirectUrl: string,
) => {
    const { t } = useTranslation('app');
    const { showToastApiError } = useToaster();
    return useMutation<LightdashUser, ApiError>(
        () => activateInviteLinkQuery(inviteCode!),
        {
            mutationKey: ['activate_invite_link', inviteCode],
            onSuccess: () => {
                window.location.href = redirectUrl;
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: t('useInviteLink.failedToAcceptInvite'),
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateInviteLinkMutation = ({
    showSuccessToast = true,
}: { showSuccessToast?: boolean } = {}) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        InviteLink,
        ApiError,
        Omit<CreateInviteLink, 'expiresAt'>
    >(createInviteQuery, {
        mutationKey: ['invite_link'],
        onError: ({ error }) => {
            showToastApiError({
                title: t('useInviteLink.failedToCreateInviteLink'),
                apiError: error,
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries(['onboarding-status']);
            await queryClient.refetchQueries(['organization_users']);
            if (showSuccessToast) {
                showToastSuccess({
                    title: t('useInviteLink.createdNewInviteLink'),
                });
            }
        },
    });
};
