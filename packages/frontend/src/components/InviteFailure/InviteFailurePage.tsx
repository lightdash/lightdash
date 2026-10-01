import {
    assertUnreachable,
    InviteLinkFailureReason,
    type ApiError,
    type InviteLinkFailure,
} from '@lightdash/common';
import { Button, Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { type FC } from 'react';
import { lightdashApi } from '../../api';
import AuthLayout from '../common/AuthLayout';
import Callout from '../common/Callout';
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
        <AuthLayout
            pageTitle="Invite unavailable"
            title={getTitle(resolvedReason)}
            legacyTitle={getTitle(resolvedReason)}
            subtitle={
                resolvedReason === InviteLinkFailureReason.WrongEmail
                    ? 'Sign in with the email address that received this invite, or ask for a new invite.'
                    : undefined
            }
        >
            <Stack gap="lg">
                {failure.isInitialLoading ? (
                    <Loader size="sm" />
                ) : failure.data ? (
                    <RequestNewInvite
                        inviteCode={inviteCode}
                        failure={failure.data}
                    />
                ) : (
                    <Callout variant="warning">
                        <Stack gap="sm">
                            <Text>
                                We could not load this invite. Ask the person
                                who invited you for a new invite.
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
