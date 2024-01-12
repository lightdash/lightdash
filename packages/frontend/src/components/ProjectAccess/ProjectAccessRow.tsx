import {
    OrganizationMemberProfile,
    ProjectMemberProfile,
    ProjectMemberRole,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Modal,
    NativeSelect,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconKey, IconTrash } from '@tabler/icons-react';
import React, { FC, useState } from 'react';
import MantineIcon from '../common/MantineIcon';

const ProjectAccessRow: FC<{
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
    return (
        <>
            <tr>
                <td>
                    <Stack spacing="xs" align={'flex-start'}>
                        {firstName && (
                            <Text fw={700}>
                                {firstName} {lastName}
                            </Text>
                        )}
                        {email && (
                            <Badge color="gray" size="xs" radius="xs">
                                {email}
                            </Badge>
                        )}
                    </Stack>
                </td>
                <td>
                    <Group>
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
                                sx={{ flex: 1 }}
                                error={
                                    relevantOrgRole
                                        ? `This user inherits the organization role: ${relevantOrgRole}`
                                        : undefined
                                }
                            />
                        ) : (
                            <Tooltip
                                withinPortal
                                withArrow
                                label={roleTooltip ? roleTooltip : undefined}
                            >
                                <Badge color="gray" radius="xs">
                                    {role}
                                </Badge>
                            </Tooltip>
                        )}
                    </Group>
                </td>
                <td width="1%">
                    {onDelete && (
                        <ActionIcon
                            variant="outline"
                            color="red"
                            onClick={() => setIsDeleteDialogOpen(true)}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    )}
                </td>
            </tr>

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
                        color="dark"
                    >
                        Cancel
                    </Button>
                    <Button color="red" onClick={onDelete}>
                        Delete
                    </Button>
                </Group>
            </Modal>
        </>
    );
};

export default ProjectAccessRow;
