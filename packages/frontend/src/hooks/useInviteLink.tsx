import {
    ApiError,
    CreateInviteLink,
    formatTimestamp,
    InviteLink,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
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

const revokeInvitesQuery = async () =>
    lightdashApi<undefined>({
        url: `/invite-links`,
        method: 'DELETE',
        body: undefined,
    });

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
    const { showToastError, showToastSuccess } = useToaster();
    return useMutation<
        InviteLink,
        ApiError,
        Omit<CreateInviteLink, 'expiresAt'>
    >(createInviteWith3DayExpiryQuery, {
        mutationKey: ['invite_link'],
        onError: (error1) => {
            const [title, ...rest] = error1.error.message.split('\n');
            showToastError({
                title,
                subtitle: rest.join('\n'),
            });
        },
        onSuccess: async (data) => {
            await queryClient.invalidateQueries(['onboarding-status']);
            await queryClient.refetchQueries(['organization_users']);
            showToastSuccess({
                title: 'Created new invite link',
                subtitle: `Expires on ${formatTimestamp(data.expiresAt)}`,
            });
        },
    });
};

export const useRevokeInvitesMutation = () => {
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<undefined, ApiError>(revokeInvitesQuery, {
        mutationKey: ['invite_link_revoke'],
        onSuccess: async () => {
            showToastSuccess({
                title: `All invites were revoked`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to revoke invites`,
                subtitle: error.error.message,
            });
        },
    });
};
