import {
    getHighestProjectRole,
    InheritedRoles,
    OrganizationMemberProfile,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ProjectRole,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { FC, useState } from 'react';
import MantineIcon from '../common/MantineIcon';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

type Props = {
    user: OrganizationMemberProfile;
    inheritedRoles: InheritedRoles;
    isUpdatingAccess: boolean;
    onCreateAccess: (newRole: ProjectMemberRole) => void;
    onUpdateAccess: (newRole: ProjectMemberRole) => void;
    onDeleteAccess: () => void;
};

const ProjectAccessRow: FC<Props> = ({
    user,
    inheritedRoles,
    isUpdatingAccess,
    onCreateAccess,
    onDeleteAccess,
    onUpdateAccess,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const highestRole = getHighestProjectRole(inheritedRoles);
    const projectRole = inheritedRoles.find(
        (role): role is ProjectRole => role.type === 'project',
    );

    console.log({ highestRole, projectRole });

    if (!highestRole) return null;

    return (
        <>
            <tr>
                <td width="30%">
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

                <td width="70%">
                    <Stack spacing="xs">
                        <Select
                            id="user-role"
                            w="180px"
                            size="xs"
                            disabled={isUpdatingAccess}
                            data={Object.values(ProjectMemberRole).map(
                                (role) => ({
                                    value: role,
                                    label: ProjectMemberRoleLabels[role],
                                }),
                            )}
                            value={projectRole?.role ?? highestRole.role}
                            onChange={(newRole: ProjectMemberRole) => {
                                if (projectRole && projectRole.role) {
                                    onUpdateAccess(newRole);
                                } else {
                                    onCreateAccess(newRole);
                                }
                            }}
                        />

                        {highestRole.type !== 'project' && projectRole?.role && (
                            <Group spacing="xxs">
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="orange"
                                />
                                <Text color="orange" size="xs">
                                    User inherits higher role{' '}
                                    <Text span fw={600}>
                                        {
                                            ProjectMemberRoleLabels[
                                                highestRole.role
                                            ]
                                        }
                                    </Text>{' '}
                                    from{' '}
                                    <Text span fw={600}>
                                        {capitalize(highestRole.type)}
                                    </Text>
                                </Text>
                            </Group>
                        )}

                        {!projectRole?.role && (
                            <Group spacing="xxs">
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    color="blue"
                                />
                                <Text color="blue" size="xs">
                                    User inherits this role from{' '}
                                    <Text span fw={600}>
                                        {capitalize(highestRole.type)}
                                    </Text>
                                </Text>
                            </Group>
                        )}
                    </Stack>
                </td>

                <td width="1%">
                    <Tooltip
                        position="top"
                        label={
                            projectRole?.role
                                ? 'Revoke project access'
                                : `Cannot revoke inherited access from ${capitalize(
                                      highestRole.type,
                                  )}`
                        }
                    >
                        <div>
                            <ActionIcon
                                disabled={!projectRole?.role}
                                variant="outline"
                                color="red"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </div>
                    </Tooltip>
                </td>
            </tr>

            {isDeleteDialogOpen && (
                <RemoveProjectAccessModal
                    user={user}
                    onDelete={() => {
                        setIsDeleteDialogOpen(false);
                        onDeleteAccess();
                    }}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectAccessRow;
