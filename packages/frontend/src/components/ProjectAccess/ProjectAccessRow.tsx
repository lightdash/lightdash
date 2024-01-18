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
    NativeSelect,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { FC, useState } from 'react';
import MantineIcon from '../common/MantineIcon';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

type Props = {
    user: OrganizationMemberProfile;
    inheritedRoles: InheritedRoles;
    roleTooltip?: string;
    isUpdatingAccess: boolean;
    onUpdate: (newRole: ProjectMemberRole) => void;
    onDelete: () => void;
};

const ProjectAccessRow: FC<Props> = ({
    user,
    inheritedRoles,
    isUpdatingAccess,
    onUpdate,
    onDelete,
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
                                    disabled={isUpdatingAccess}
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

            {isDeleteDialogOpen && (
                <RemoveProjectAccessModal
                    user={user}
                    onDelete={onDelete}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectAccessRow;
