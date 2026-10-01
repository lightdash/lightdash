import {
    assertUnreachable,
    OrganizationJoinRequestStatus,
    type OrganizationLandingMatch,
} from '@lightdash/common';
import { Avatar, Button, Card, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useRequestToJoinOrganization } from '../../hooks/organization/useOrganizationLanding';

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
    context: string;
}> = ({ match, context }) => {
    const requestToJoin = useRequestToJoinOrganization();
    const status = match.joinRequest?.status ?? null;
    const isPending = status === OrganizationJoinRequestStatus.PENDING;
    const statusText = status ? getStatusText(status) : null;

    return (
        <Card>
            <Stack gap="sm">
                <Group gap="md" wrap="nowrap">
                    <Avatar size="md" radius="xl">
                        {match.name[0]?.toUpperCase()}
                    </Avatar>
                    <Stack gap={2}>
                        <Text fw={600} truncate="end">
                            {match.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {context}
                        </Text>
                    </Stack>
                </Group>
                {statusText && (
                    <Text size="sm" c="dimmed">
                        {statusText}
                    </Text>
                )}
                {match.hasAdmin ? (
                    !isPending && (
                        <Button
                            variant="default"
                            loading={requestToJoin.isLoading}
                            onClick={() =>
                                requestToJoin.mutate(match.organizationUuid)
                            }
                        >
                            Request to join
                        </Button>
                    )
                ) : (
                    <Text size="sm" c="dimmed">
                        This organization has no admin who can approve a
                        request. Ask the person who runs Lightdash for an
                        invite.
                    </Text>
                )}
                {requestToJoin.error && (
                    <Text size="sm" c="red">
                        {requestToJoin.error.error.message}
                    </Text>
                )}
            </Stack>
        </Card>
    );
};
