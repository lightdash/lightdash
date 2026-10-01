import { type ApiError, type InviteLinkFailure } from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { lightdashApi } from '../../api';
import Callout from '../common/Callout';

export const RequestNewInvite: FC<{
    inviteCode: string;
    failure: InviteLinkFailure;
}> = ({ inviteCode, failure }) => {
    const queryClient = useQueryClient();
    const request = useMutation<undefined, ApiError>({
        onSuccess: () =>
            queryClient.invalidateQueries(['invite_link_failure', inviteCode]),
        mutationFn: () =>
            lightdashApi<undefined>({
                url: `/invite-links/${encodeURIComponent(inviteCode)}/request-new`,
                method: 'POST',
                body: undefined,
            }),
    });
    if (!failure.canRequestNewInvite) {
        return <Text>Ask the person who invited you for a new invite.</Text>;
    }
    return (
        <Stack gap="sm">
            <Button
                onClick={() => request.mutate()}
                loading={request.isLoading}
                disabled={request.isSuccess}
            >
                Ask for a new invite
            </Button>
            {request.isSuccess && (
                <Callout variant="success">
                    We sent your request to the person who invited you.
                </Callout>
            )}
            {request.error && (
                <Callout variant="danger">
                    {request.error.error.message}
                </Callout>
            )}
        </Stack>
    );
};
