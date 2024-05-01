import {
    type ApiError,
    type CreateInviteLink,
    type InviteLink,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const createInviteQuery = async (
    data: CreateInviteLink,
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

const createInviteWith3DayExpiryQuery = async (
    createInvite: Omit<CreateInviteLink, 'expiresAt'>,
): Promise<InviteLink> => {
    const dateIn3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const response = await createInviteQuery({
        ...createInvite,
        expiresAt: dateIn3Days,
    });
    return response;
};

const inviteLinkQuery = async (inviteCode: string) =>
    lightdashApi<InviteLink>({
        url: `/invite-links/${inviteCode}`,
        method: 'GET',
        body: undefined,
    });

export const useInviteLink = (inviteCode: string) =>
    useQuery<InviteLink, ApiError>({
        queryKey: ['invite_link', inviteCode],
        queryFn: () => inviteLinkQuery(inviteCode),
    });

export const useCreateInviteLinkMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        InviteLink,
        ApiError,
        Omit<CreateInviteLink, 'expiresAt'>
    >(createInviteWith3DayExpiryQuery, {
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
            showToastSuccess({
                title: 'Created new invite link',
            });
        },
    });
};
