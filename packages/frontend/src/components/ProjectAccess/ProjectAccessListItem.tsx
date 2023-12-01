import {
    OrganizationMemberProfile,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Flex,
    Group,
    Modal,
    NativeSelect,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import {
    IconAlertTriangleFilled,
    IconKey,
    IconTrash,
} from '@tabler/icons-react';
import React, { FC, useState } from 'react';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';

const ProjectAccessListItem: FC<{
    user: OrganizationMemberProfile | ProjectMemberProfile;
    relevantOrgRole?: OrganizationMemberProfile['role'];
    roleTooltip?: string;
    onDelete?: () => void;
    onUpdate?: (newRole: ProjectMemberRole) => void;
}> = ({
    user: { firstName, lastName, email, role },
    relevantOrgRole,
    roleTooltip,
    onDelete,
    onUpdate,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const theme = useMantineTheme();
    return (
        <SettingsCard>
            <Flex align={'center'} justify={'space-between'}>
                <Stack spacing="xs">
                    <Text fw={700}>
                        {firstName} {lastName}
                    </Text>

                    {email && (
                        <Badge color="gray" size="xs" radius="xs">
                            {email}
                        </Badge>
                    )}
                </Stack>
                <Flex align={'center'} gap={'xs'}>
                    {relevantOrgRole && (
                        <Tooltip
                            withinPortal
                            position="left"
                            withArrow
                            label={`This user inherits the organization role: ${relevantOrgRole}`}
                        >
                            <MantineIcon
                                icon={IconAlertTriangleFilled}
                                color="orange"
                                style={{ color: theme.colors.orange[4] }}
                            />
                        </Tooltip>
                    )}
                    {onUpdate ? (
                        <NativeSelect
                            id="user-role"
                            data={Object.values(ProjectMemberRole).map(
                                (orgMemberRole) => ({
                                    value: orgMemberRole,
                                    label: orgMemberRole.replace('_', ' '),
                                }),
                            )}
                            onChange={(e) => {
                                const newRole = e.target
                                    .value as ProjectMemberRole;
                                onUpdate(newRole);
                            }}
                            variant="filled"
                            size="xs"
                            value={role}
                        />
                    ) : (
                        <Tooltip
                            withinPortal
                            position="left"
                            withArrow
                            label={roleTooltip ? roleTooltip : undefined}
                        >
                            <Badge color="gray" radius="xs">
                                {role}
                            </Badge>
                        </Tooltip>
                    )}
                    {onDelete && (
                        <Button
                            variant="outline"
                            size="xs"
                            color="red"
                            px="xs"
                            onClick={() => setIsDeleteDialogOpen(true)}
                        >
                            <MantineIcon icon={IconTrash} />
                        </Button>
                    )}
                </Flex>
            </Flex>
            <Modal
                opened={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                title={
                    <Group spacing="xs">
                        <MantineIcon size="lg" icon={IconKey} color="red" />
                        <Title order={4}>Revoke project access</Title>
                    </Group>
                }
            >
                <Text pb="md">
                    Are you sure you want to revoke project access for this user{' '}
                    {email} ?
                </Text>
                <Group spacing="xs" position="right">
                    <Button
                        variant="outline"
                        onClick={() => setIsDeleteDialogOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button color="red" onClick={onDelete}>
                        Delete
                    </Button>
                </Group>
            </Modal>
        </SettingsCard>
    );
};

export default ProjectAccessListItem;
