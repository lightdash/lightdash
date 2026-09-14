import {
    OrganizationMemberRole,
    OrganizationMemberRoleLabels,
    type OrganizationMemberProfile,
    type OrganizationRoleSet,
    type Role,
} from '@lightdash/common';
import { useMemo, type FC } from 'react';
import {
    useOrganizationUserRoleSet,
    useResolvedRoleSet,
} from '../hooks/useRoleSets';
import { RoleSetMultiSelect } from './RoleSetMultiSelect';

type Props = {
    user: Pick<
        OrganizationMemberProfile,
        'userUuid' | 'email' | 'role' | 'roleUuid' | 'hasMultipleRoles'
    >;
    organizationRoles: Role[] | undefined;
    disabled?: boolean;
    onChange: (roleSet: OrganizationRoleSet) => void;
};

/** Role set derived from the primary slot; exact when the user holds no extras. */
const roleSetFromSlot = (
    user: Pick<OrganizationMemberProfile, 'role' | 'roleUuid'>,
): OrganizationRoleSet =>
    user.roleUuid
        ? { systemRole: null, customRoleUuids: [user.roleUuid] }
        : { systemRole: user.role, customRoleUuids: [] };

export const OrganizationRoleSetCell: FC<Props> = ({
    user,
    organizationRoles,
    disabled,
    onChange,
}) => {
    // Only users flagged with extra roles need the full set fetched
    const hasMultipleRoles = user.hasMultipleRoles === true;
    const roleSetQuery = useOrganizationUserRoleSet(user.userUuid, {
        enabled: hasMultipleRoles,
    });
    const slotSet = useMemo(() => roleSetFromSlot(user), [user]);
    const { value, isPending } = useResolvedRoleSet(
        slotSet,
        hasMultipleRoles,
        roleSetQuery,
    );

    const systemRoles = useMemo(
        () =>
            Object.values(OrganizationMemberRole).map((role) => ({
                value: role,
                label: OrganizationMemberRoleLabels[role],
            })),
        [],
    );
    const customRoles = useMemo(
        () =>
            (organizationRoles ?? [])
                .filter(
                    (role) =>
                        role.ownerType === 'user' &&
                        role.level === 'organization',
                )
                .map((role) => ({ value: role.roleUuid, label: role.name })),
        [organizationRoles],
    );

    return (
        <RoleSetMultiSelect<OrganizationMemberRole>
            id={`user-roles-${user.userUuid}`}
            systemRoles={systemRoles}
            customRoles={customRoles}
            value={value}
            onChange={onChange}
            disabled={disabled || isPending}
            ariaLabel={`Roles for ${user.email}`}
            w={280}
        />
    );
};
