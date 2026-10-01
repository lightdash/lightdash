import {
    assertUnreachable,
    InviteLinkFailureReason,
    type ApiError,
    type InviteLinkFailure,
} from '@lightdash/common';
import { Button, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { type FC } from 'react';
import { lightdashApi } from '../../api';
import AuthLayout from '../common/AuthLayout';
import Callout from '../common/Callout';
import PageSpinner from '../PageSpinner';
import { InviteFailureActions } from './InviteFailureActions';
import { RequestNewInvite } from './RequestNewInvite';

const getTitle = (reason: InviteLinkFailureReason): string => {
    switch (reason) {
        case InviteLinkFailureReason.Expired:
            return 'This invite link has expired';
        case InviteLinkFailureReason.AlreadyUsed:
            return 'This invite link has already been used';
        case InviteLinkFailureReason.NotFound:
            return 'We cannot find this invite link';
        case InviteLinkFailureReason.WrongEmail:
            return 'This invite is for a different email address';
        default:
            return assertUnreachable(reason, 'Unknown invite failure');
    }
};

export const InviteFailurePage: FC<{
    inviteCode: string;
    reason: InviteLinkFailureReason;
}> = ({ inviteCode, reason }) => {
    const failure = useQuery<InviteLinkFailure, ApiError>({
        queryKey: ['invite_link_failure', inviteCode],
        queryFn: () =>
            lightdashApi<InviteLinkFailure>({
                url: `/invite-links/${encodeURIComponent(inviteCode)}/failure`,
                method: 'GET',
                body: undefined,
            }),
        retry: false,
    });
    const resolvedReason =
        reason === InviteLinkFailureReason.WrongEmail
            ? reason
            : (failure.data?.reason ?? reason);
    return (
        <AuthLayout pageTitle="Invite unavailable">
            <Stack gap="lg">
                <Title order={3}>{getTitle(resolvedReason)}</Title>
                {resolvedReason === InviteLinkFailureReason.WrongEmail && (
                    <Text>
                        Sign in with the email address that received this
                        invite, or ask for a new invite.
                    </Text>
                )}
                {failure.isInitialLoading ? (
                    <PageSpinner />
                ) : failure.data ? (
                    <Stack gap="sm">
                        {failure.data.organizationName && (
                            <Text>
                                This invite is for{' '}
                                {failure.data.organizationName}.
                            </Text>
                        )}
                        <RequestNewInvite
                            inviteCode={inviteCode}
                            failure={failure.data}
                        />
                    </Stack>
                ) : (
                    <Callout variant="warning">
                        <Stack gap="sm">
                            <Text>
                                We could not load the sender details. Ask the
                                person who shared the link for a new invite.
                            </Text>
                            <Button
                                variant="default"
                                onClick={() => void failure.refetch()}
                            >
                                Try again
                            </Button>
                        </Stack>
                    </Callout>
                )}
                <InviteFailureActions />
            </Stack>
        </AuthLayout>
    );
};
