import {
    CreateInviteLink,
    InviteLink,
    ApiError,
    formatTimestamp,
} from 'common';
import { useMutation } from 'react-query';

import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';

const createInviteQuery = async (
    data: CreateInviteLink,
): Promise<InviteLink> => {
    const response = await lightdashApi<InviteLink>({
        url: `/invite-links`,
        method: 'POST',
        body: JSON.stringify(data),
    });
    return {
        inviteCode: response.inviteCode,
        expiresAt: new Date(response.expiresAt),
    };
};

const createInviteWith3DayExpiryQuery = async (): Promise<InviteLink> => {
    const dateIn3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const response = await createInviteQuery({ expiresAt: dateIn3Days });
    return response;
};

export const useInviteLink = () => {
    const { showToastError, showToastSuccess } = useApp();
    const inviteLink = useMutation<InviteLink, ApiError>(
        createInviteWith3DayExpiryQuery,
        {
            mutationKey: ['invite_link'],
            onError: (error1) => {
                const [title, ...rest] = error1.error.message.split('\n');
                showToastError({
                    title,
                    subtitle: rest.join('\n'),
                });
            },
            onSuccess: (data) => {
                showToastSuccess({
                    title: 'Created new invite link',
                    subtitle: `Expires on ${formatTimestamp(data.expiresAt)}`,
                });
            },
        },
    );
    return inviteLink;
};
