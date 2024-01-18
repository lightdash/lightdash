import {
    assertUnreachable,
    getHighestProjectRole,
    InheritedRoles,
    OrganizationMemberProfile,
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    ProjectRole,
    ProjectRoleOrder,
    RoleType,
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
import {
    IconBuildingSkyscraper,
    IconTrash,
    IconUser,
    IconUsersGroup,
} from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { FC, useState } from 'react';
import MantineIcon from '../common/MantineIcon';
import RemoveProjectAccessModal from './RemoveProjectAccessModal';

const getIconForRoleType = (roleType: RoleType) => {
    switch (roleType) {
        case 'project':
            return IconUser;
        case 'group':
            return IconUsersGroup;
        case 'organization':
            return IconBuildingSkyscraper;
        default:
            return assertUnreachable(roleType, `Unknown role type ${roleType}`);
    }
};

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
                            position="top-start"
                            disabled={highestRole.type === 'project'}
                            label={`This user inherits the ${capitalize(
                                highestRole.type,
                            )} role: ${
                                ProjectMemberRoleLabels[highestRole.role]
                            }`}
                        >
                            <Select
                                id="user-role"
                                w="180px"
                                size="xs"
                                disabled={isUpdatingAccess}
                                icon={
                                    <MantineIcon
                                        icon={getIconForRoleType(
                                            highestRole.type,
                                        )}
                                    />
                                }
                                error={
                                    highestRole.type !== 'project' &&
                                    ProjectRoleOrder[highestRole.role] >
                                        ProjectRoleOrder[
                                            projectRole?.role ??
                                                ProjectMemberRole.VIEWER
                                        ]
                                }
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
                        </Tooltip>
                    </Group>
                </td>
                <td width="1%">
                    <Tooltip
                        position="top"
                        label={
                            highestRole.type === 'project'
                                ? 'Revoke project access'
                                : `Cannot revoke inherited access from ${capitalize(
                                      highestRole.type,
                                  )}`
                        }
                    >
                        <div>
                            <ActionIcon
                                disabled={highestRole.type !== 'project'}
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
