import { subject } from '@casl/ability';
import {
    FeatureFlags,
    OrganizationMemberRole,
    OrganizationMemberRoleLabels,
    type OrganizationJoinRequest,
} from '@lightdash/common';
import { Button, Group, Paper, Select, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import {
    useDecideOrganizationJoinRequest,
    useOrganizationJoinRequests,
} from '../../../hooks/organization/useOrganizationLanding';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';

const ROLE_OPTIONS = Object.values(OrganizationMemberRole).map((role) => ({
    value: role,
    label: OrganizationMemberRoleLabels[role],
}));

const isOrganizationMemberRole = (
    value: string,
): value is OrganizationMemberRole =>
    Object.values<string>(OrganizationMemberRole).includes(value);

const JoinRequestRow: FC<{ request: OrganizationJoinRequest }> = ({
    request,
}) => {
    const [role, setRole] = useState<OrganizationMemberRole>(
        OrganizationMemberRole.VIEWER,
    );
    const decide = useDecideOrganizationJoinRequest();
    const name = `${request.user.firstName} ${request.user.lastName}`.trim();

    return (
        <Group justify="space-between" wrap="nowrap">
            <Stack gap={0}>
                <Text size="sm" fw={500}>
                    {name || request.user.email}
                </Text>
                {name && (
                    <Text size="xs" c="dimmed">
                        {request.user.email}
                    </Text>
                )}
            </Stack>
            <Group gap="xs" wrap="nowrap">
                <Select
                    size="xs"
                    w={140}
                    aria-label="Role"
                    data={ROLE_OPTIONS}
                    value={role}
                    allowDeselect={false}
                    onChange={(value) => {
                        if (value && isOrganizationMemberRole(value)) {
                            setRole(value);
                        }
                    }}
                />
                <Button
                    size="xs"
                    loading={decide.isLoading}
                    onClick={() =>
                        decide.mutate({
                            joinRequestUuid: request.joinRequestUuid,
                            decision: 'approve',
                            role,
                        })
                    }
                >
                    Approve
                </Button>
                <Button
                    size="xs"
                    variant="default"
                    loading={decide.isLoading}
                    onClick={() =>
                        decide.mutate({
                            joinRequestUuid: request.joinRequestUuid,
                            decision: 'decline',
                        })
                    }
                >
                    Decline
                </Button>
            </Group>
        </Group>
    );
};

export const JoinRequestsPanel: FC = () => {
    const { user } = useApp();
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const canManageMembers =
        user.data?.ability.can(
            'manage',
            subject('OrganizationMemberProfile', {
                organizationUuid: user.data.organizationUuid,
            }),
        ) === true;
    const requests = useOrganizationJoinRequests(
        canManageMembers && connectJourneyFlag.data?.enabled === true,
    );

    if (!requests.data || requests.data.length === 0) return null;

    return (
        <Paper p="md">
            <Stack gap="sm">
                <Stack gap={2}>
                    <Text fw={600}>Requests to join</Text>
                    <Text size="sm" c="dimmed">
                        These people asked to join your organization. Each
                        request expires after 14 days.
                    </Text>
                </Stack>
                {requests.data.map((request) => (
                    <JoinRequestRow
                        key={request.joinRequestUuid}
                        request={request}
                    />
                ))}
            </Stack>
        </Paper>
    );
};
