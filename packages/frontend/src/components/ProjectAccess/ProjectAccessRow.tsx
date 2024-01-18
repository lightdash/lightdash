import {
    getHighestProjectRole,
    InheritedRoles,
    OrganizationMemberProfile,
    OrganizationMemberRole,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ProjectRole,
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
import { capitalize } from 'lodash';
import { FC, useState } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    user: OrganizationMemberProfile | ProjectMemberProfile;
    organizationRole: OrganizationMemberRole;
    inheritedRoles: InheritedRoles;
    roleTooltip?: string;
    onDelete: () => void;
    onUpdate: (newRole: ProjectMemberRole) => void;
};

const ProjectAccessRow: FC<Props> = ({
    user,
    inheritedRoles,
    onDelete,
    onUpdate,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const highestRole = getHighestProjectRole(inheritedRoles);
    const projectRole = inheritedRoles.find(
        (role): role is ProjectRole => role.type === 'project',
    );

    if (!highestRole) return null;

    return (
        <>
            <tr>
                <td>
                    <Stack spacing="xs" align={'flex-start'}>
                        {user.firstName && (
                            <Text fw={700}>
                                {user.firstName} {user.lastName}
                            </Text>
                        )}
                        {user.email && (
                            <Badge color="gray" size="xs" radius="xs">
                                {user.email}
                            </Badge>
                        )}
                    </Stack>
                </td>
                <td>
                    <Group>
                        <Tooltip
                            withinPortal
                            withArrow
                            disabled={highestRole.type === 'project'}
                            label={`This user inherits the ${capitalize(
                                highestRole.type,
                            )} role: ${
                                ProjectMemberRoleLabels[highestRole.role]
                            }`}
                        >
                            {projectRole?.role ? (
                                <NativeSelect
                                    id="user-role"
                                    w="150px"
                                    error={highestRole.type !== 'project'}
                                    size="xs"
                                    data={Object.values(ProjectMemberRole).map(
                                        (role) => ({
                                            value: role,
                                            label: ProjectMemberRoleLabels[
                                                role
                                            ],
                                        }),
                                    )}
                                    onChange={(e) => {
                                        const newRole = e.target
                                            .value as ProjectMemberRole;
                                        onUpdate(newRole);
                                    }}
                                    value={projectRole.role}
                                />
                            ) : (
                                <Badge color="gray" radius="xs">
                                    {ProjectMemberRoleLabels[highestRole.role]}
                                </Badge>
                            )}
                        </Tooltip>
                    </Group>
                </td>
                <td width="1%">
                    {projectRole?.role && (
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
                    {user.email} ?
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
