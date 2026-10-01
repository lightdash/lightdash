import {
    assertUnreachable,
    OrganizationJoinRequestStatus,
    type OrganizationLandingMatch,
} from '@lightdash/common';
import { Avatar, Button, Card, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useRequestToJoinOrganization } from '../../hooks/organization/useOrganizationLanding';
import Callout from '../common/Callout';
import { getOrganizationDisplayName } from './organizationLandingCopy';

const getStatusText = (
    status: OrganizationJoinRequestStatus,
): string | null => {
    switch (status) {
        case OrganizationJoinRequestStatus.PENDING:
            return 'Request sent. An admin will approve or decline it.';
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
        <Card>
            <Stack gap="sm">
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="md" wrap="nowrap">
                        <Avatar size="md" radius="xl">
                            {displayName[0]?.toUpperCase()}
                        </Avatar>
                        <Stack gap="two">
                            <Text fw={600} truncate="end">
                                {displayName}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {isPending
                                    ? 'Request sent'
                                    : 'Admin approval needed'}
                            </Text>
                        </Stack>
                    </Group>
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
