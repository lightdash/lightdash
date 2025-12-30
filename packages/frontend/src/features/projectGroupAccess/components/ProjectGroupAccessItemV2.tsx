import {
    type GroupWithMembers,
    type ProjectGroupAccess,
} from '@lightdash/common';
import { ActionIcon, Select, Stack, Text, Tooltip } from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useDeleteProjectGroupRoleAssignmentMutation,
    useUpsertProjectGroupRoleAssignmentMutation,
} from '../../../hooks/useProjectGroupRoles';
import RevokeProjectGroupAccessModal from './RevokeProjectGroupAccessModal';

type RoleItem = { value: string; label: string };
type GroupedRoles = { group: string; items: RoleItem[] }[];

type ProjectGroupAccessItemV2Props = {
    group: GroupWithMembers;
    access: ProjectGroupAccess;
    organizationRoles: GroupedRoles;
    canManageProjectAccess: boolean;
};

const ProjectGroupAccessItemV2: FC<ProjectGroupAccessItemV2Props> = ({
    group,
    access,
    organizationRoles,
    canManageProjectAccess,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const { mutateAsync: removeProjectGroupAccess } =
        useDeleteProjectGroupRoleAssignmentMutation(access.projectUuid);

    const { mutateAsync: updateProjectGroupAccess, isLoading: isSubmitting } =
        useUpsertProjectGroupRoleAssignmentMutation(access.projectUuid);

    const handleRoleChange = useCallback(
        async (newRoleUuid: string | null) => {
            if (!canManageProjectAccess || !newRoleUuid) return;

            await updateProjectGroupAccess({
                groupId: access.groupUuid,
                roleId: newRoleUuid,
            });
        },
        [canManageProjectAccess, updateProjectGroupAccess, access],
    );

    const handleRemoveProjectGroupAccess = async () => {
        await removeProjectGroupAccess(access.groupUuid);
        setIsDeleteDialogOpen(false);
    };

    // Flatten roles for lookup
    const allRoles = useMemo(
        () => organizationRoles.flatMap((g) => g.items),
        [organizationRoles],
    );

    // Get the current role UUID
    const currentRoleUuid = useMemo(() => {
        // For new role system, role is already a UUID
        // For old role system, role is a string that matches role name
        const roleData = allRoles.find(
            (role) => role.value === access.role || role.label === access.role,
        );
        return roleData?.value || access.role;
    }, [access.role, allRoles]);

    return (
        <>
            <tr key={access.groupUuid}>
                <td width="30%">
                    <Stack gap="xs" align="flex-start">
                        <Text fw={500}>{group.name}</Text>
                        <Text size="xs" c="dimmed">
                            {group.members.length} member
                            {group.members.length !== 1 ? 's' : ''}
                        </Text>
                    </Stack>
                </td>
                <td width="70%">
                    <Stack gap="xs">
                        <Select
                            id={`group-role-${access.groupUuid}`}
                            w="300px"
                            size="xs"
                            disabled={isSubmitting || !canManageProjectAccess}
                            data={organizationRoles}
                            value={currentRoleUuid}
                            onChange={handleRoleChange}
                        />
                    </Stack>
                </td>
                <td width="1%">
                    <Tooltip position="top" label="Remove group access">
                        <div>
                            <ActionIcon
                                disabled={
                                    !canManageProjectAccess || isSubmitting
                                }
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
                <RevokeProjectGroupAccessModal
                    group={group}
                    onDelete={handleRemoveProjectGroupAccess}
                    onClose={() => setIsDeleteDialogOpen(false)}
                />
            )}
        </>
    );
};

export default ProjectGroupAccessItemV2;
