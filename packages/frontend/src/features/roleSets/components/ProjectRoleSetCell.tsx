import {
    isSystemRole,
    type ProjectMemberRole,
    type ProjectRoleSet,
    type Role,
} from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    useProjectGroupRoleSet,
    useProjectUserRoleSet,
    useResolvedRoleSet,
} from '../hooks/useRoleSets';
import { RoleSetMultiSelect } from './RoleSetMultiSelect';

type Props = {
    projectUuid: string;
    assignee: { type: 'user' | 'group'; uuid: string; label: string };
    /** Primary-slot role id of the direct assignment (system name or custom uuid), null when none. */
    slotRoleId: string | null;
    hasMultipleRoles: boolean;
    organizationRoles: Role[] | undefined;
    disabled?: boolean;
    placeholder?: string;
    onChange: (roleSet: ProjectRoleSet) => void;
};

const roleSetFromSlot = (slotRoleId: string | null): ProjectRoleSet => {
    if (slotRoleId === null) {
        return { systemRole: null, customRoleUuids: [] };
    }
    return isSystemRole(slotRoleId)
        ? { systemRole: slotRoleId, customRoleUuids: [] }
        : { systemRole: null, customRoleUuids: [slotRoleId] };
};

export const ProjectRoleSetCell: FC<Props> = ({
    projectUuid,
    assignee,
    slotRoleId,
    hasMultipleRoles,
    organizationRoles,
    disabled,
    placeholder,
    onChange,
}) => {
    const userSetQuery = useProjectUserRoleSet(projectUuid, assignee.uuid, {
        enabled: hasMultipleRoles && assignee.type === 'user',
    });
    const groupSetQuery = useProjectGroupRoleSet(projectUuid, assignee.uuid, {
        enabled: hasMultipleRoles && assignee.type === 'group',
    });
    const fetched = assignee.type === 'user' ? userSetQuery : groupSetQuery;

    const slotSet = useMemo(() => roleSetFromSlot(slotRoleId), [slotRoleId]);
    const { value, isPending } = useResolvedRoleSet(
        slotSet,
        hasMultipleRoles,
        fetched,
    );

    const { systemRoles, customRoles } = useMemo(() => {
        const roles = organizationRoles ?? [];
        return {
            systemRoles: roles
                .filter((role) => role.ownerType === 'system')
                .map((role) => ({ value: role.roleUuid, label: role.name })),
            customRoles: roles
                .filter(
                    (role) =>
                        role.ownerType === 'user' && role.level === 'project',
                )
                .map((role) => ({ value: role.roleUuid, label: role.name })),
        };
    }, [organizationRoles]);

    return (
        <RoleSetMultiSelect<ProjectMemberRole>
            id={`${assignee.type}-roles-${assignee.uuid}`}
            systemRoles={systemRoles}
            customRoles={customRoles}
            value={value}
            onChange={onChange}
            disabled={disabled || isPending}
            placeholder={placeholder}
            ariaLabel={`Roles for ${assignee.label}`}
            w={300}
        />
    );
};
