import {
    type ApiError,
    type CreateInviteLink,
    type InviteLink,
    type InviteLinkWithAuthenticationOptions,
    type LightdashUser,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import useToaster from './toaster/useToaster';

const createInviteQuery = async (
    lightdashApi: LightdashApi,
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

const inviteLinkQuery = async (
    lightdashApi: LightdashApi,
    inviteCode: string,
) =>
    lightdashApi<InviteLinkWithAuthenticationOptions>({
        url: `/invite-links/${inviteCode}`,
        method: 'GET',
        body: undefined,
    });

export const useInviteLink = (inviteCode: string | undefined) => {
    const lightdashApi = useLightdashApi();
    return useQuery<InviteLinkWithAuthenticationOptions, ApiError>({
        queryKey: ['invite_link', inviteCode],
        queryFn: () => inviteLinkQuery(lightdashApi, inviteCode!),
        enabled: inviteCode !== undefined,
    });
};

const activateInviteLinkQuery = async (
    lightdashApi: LightdashApi,
    inviteCode: string,
) =>
    lightdashApi<LightdashUser>({
        url: `/invite-links/${inviteCode}/activate`,
        method: 'POST',
        body: undefined,
    });

export const useActivateInviteLinkMutation = (
    inviteCode: string | undefined,
    redirectUrl: string,
) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError } = useToaster();
    return useMutation<LightdashUser, ApiError>(
        () => activateInviteLinkQuery(lightdashApi, inviteCode!),
        {
            mutationKey: ['activate_invite_link', inviteCode],
            onSuccess: () => {
                window.location.href = redirectUrl;
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to accept invite',
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateInviteLinkMutation = ({
    showSuccessToast = true,
}: { showSuccessToast?: boolean } = {}) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        InviteLink,
        ApiError,
        Omit<CreateInviteLink, 'expiresAt'>
    >(
        (data: Omit<CreateInviteLink, 'expiresAt'>) =>
            createInviteQuery(lightdashApi, data),
        {
            mutationKey: ['invite_link'],
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to create invite link',
                    apiError: error,
                });
            },
            onSuccess: async () => {
                await queryClient.invalidateQueries(['onboarding-status']);
                await queryClient.refetchQueries(['organization_users']);
                if (showSuccessToast) {
                    showToastSuccess({
                        title: 'Created new invite link',
                    });
                }
            },
        },
    );
};
