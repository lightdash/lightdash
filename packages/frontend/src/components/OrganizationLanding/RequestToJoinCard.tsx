import {
    assertUnreachable,
    OrganizationJoinRequestStatus,
    type OrganizationLandingMatch,
} from '@lightdash/common';
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useRequestToJoinOrganization } from '../../hooks/organization/useOrganizationLanding';
import Callout from '../common/Callout';
import {
    formatMemberCount,
    getOrganizationDisplayName,
} from './organizationLandingCopy';
import { OrganizationRowIdentity } from './OrganizationRowIdentity';

const getStatusText = (
    status: OrganizationJoinRequestStatus,
): string | null => {
    switch (status) {
        case OrganizationJoinRequestStatus.PENDING:
            return 'An admin will approve or decline it.';
        case OrganizationJoinRequestStatus.DECLINED:
            return 'An admin declined your last request.';
        case OrganizationJoinRequestStatus.EXPIRED:
            return 'Your last request expired before an admin answered it.';
        case OrganizationJoinRequestStatus.APPROVED:
            return null;
        default:
            return assertUnreachable(status, `Unknown status: ${status}`);
    }
};

export const RequestToJoinCard: FC<{
    match: OrganizationLandingMatch;
}> = ({ match }) => {
    const requestToJoin = useRequestToJoinOrganization();
    const status = match.joinRequest?.status ?? null;
    const isPending = status === OrganizationJoinRequestStatus.PENDING;
    const statusText = status ? getStatusText(status) : null;
    const displayName = getOrganizationDisplayName(match.name);

    return (
        <Card p="sm">
            <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                    <OrganizationRowIdentity
                        displayName={displayName}
                        detail={
                            isPending
                                ? 'Request sent'
                                : `${formatMemberCount(match.membersCount)} · Admin approval needed`
                        }
                    />
                    {match.hasAdmin && !isPending && (
                        <Button
                            variant="default"
                            flex="none"
                            loading={requestToJoin.isLoading}
                            onClick={() =>
                                requestToJoin.mutate(match.organizationUuid)
                            }
                        >
                            Request to join
                        </Button>
                    )}
                </Group>
                {statusText && (
                    <Text size="sm" c="dimmed">
                        {statusText}
                    </Text>
                )}
                {!match.hasAdmin && (
                    <Text size="sm" c="dimmed">
                        This organization has no admin who can approve a
                        request. Ask the person who runs Lightdash for an
                        invite.
                    </Text>
                )}
                {requestToJoin.error && (
                    <Callout variant="danger">
                        {requestToJoin.error.error.message}
                    </Callout>
                )}
            </Stack>
        </Card>
    );
};
