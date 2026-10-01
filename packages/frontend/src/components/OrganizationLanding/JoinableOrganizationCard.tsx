import { type UserAllowedOrganization } from '@lightdash/common';
import { Avatar, Button, Card, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useNavigate } from 'react-router';
import { useJoinOrganizationMutation } from '../../hooks/user/useJoinOrganizationMutation';

export const JoinableOrganizationCard: FC<{
    organization: UserAllowedOrganization;
}> = ({ organization }) => {
    const navigate = useNavigate();
    const joinOrganization = useJoinOrganizationMutation();

    return (
        <Card>
            <Group justify="space-between" wrap="nowrap">
                <Group gap="md" wrap="nowrap">
                    <Avatar size="md" radius="xl">
                        {organization.name[0]?.toUpperCase()}
                    </Avatar>
                    <Stack gap="two">
                        <Text truncate="end" fw={600}>
                            {organization.name}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {organization.membersCount} members
                        </Text>
                    </Stack>
                </Group>
                <Button
                    loading={joinOrganization.isLoading}
                    onClick={() =>
                        joinOrganization.mutate(organization.organizationUuid, {
                            onSuccess: () => void navigate('/'),
                        })
                    }
                >
                    Join
                </Button>
            </Group>
        </Card>
    );
};
