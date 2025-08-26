import {
    type GroupWithMembers,
    type ProjectGroupAccess,
} from '@lightdash/common';
import { ActionIcon, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    useDeleteProjectGroupRoleAssignmentMutation,
    useUpsertProjectGroupRoleAssignmentMutation,
} from '../../../hooks/useProjectGroupRoles';
import RevokeProjectGroupAccessModal from './RevokeProjectGroupAccessModal';

type ProjectGroupAccessItemV2Props = {
    group: GroupWithMembers;
    access: ProjectGroupAccess;
    organizationRoles: { value: string; label: string; group: string }[];
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

    // Get the current role UUID
    const currentRoleUuid = useMemo(() => {
        // For new role system, role is already a UUID
        // For old role system, role is a string that matches role name
        const roleData = organizationRoles.find(
            (role) => role.value === access.role || role.label === access.role,
        );
        return roleData?.value || access.role;
    }, [access.role, organizationRoles]);

    return (
        <>
            <tr key={access.groupUuid}>
                <td width="30%">
                    <Stack spacing="xs" align="flex-start">
                        <Text fw={500}>{group.name}</Text>
                        <Text size="xs" color="dimmed">
                            {group.members.length} member
                            {group.members.length !== 1 ? 's' : ''}
                        </Text>
                    </Stack>
                </td>
                <td width="70%">
                    <Stack spacing="xs">
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
