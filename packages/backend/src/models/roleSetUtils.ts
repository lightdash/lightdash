import {
    OrganizationMemberRole,
    OrganizationRoleSet,
    ParameterError,
    ProjectMemberRole,
    ProjectRoleSet,
} from '@lightdash/common';
import { Knex } from 'knex';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { ProjectGroupAccessCustomRolesTableName } from '../database/entities/projectGroupAccessCustomRoles';
import { ProjectMembershipCustomRolesTableName } from '../database/entities/projectMembershipCustomRoles';

type RoleSet = OrganizationRoleSet | ProjectRoleSet;

/** Dedupes custom roles (first occurrence wins) and rejects empty sets. */
export const normalizeRoleSet = <T extends RoleSet>(set: T): T => {
    const customRoleUuids = [...new Set(set.customRoleUuids)];
    if (set.systemRole === null && customRoleUuids.length === 0) {
        throw new ParameterError('A role set must contain at least one role');
    }
    return { ...set, customRoleUuids };
};

/**
 * Splits a set into the primary slot (`role`/`role_uuid` columns) and the extra
 * custom roles stored in the join tables. A custom-only set puts its first
 * custom role in the slot with the level's placeholder system role.
 */
export const splitRoleSet = <TRole extends string>(
    set: { systemRole: TRole | null; customRoleUuids: string[] },
    placeholder: TRole,
): {
    slot: { role: TRole; roleUuid: string | null };
    extraRoleUuids: string[];
} => {
    if (set.systemRole !== null) {
        return {
            slot: { role: set.systemRole, roleUuid: null },
            extraRoleUuids: set.customRoleUuids,
        };
    }
    const [first, ...rest] = set.customRoleUuids;
    return {
        slot: { role: placeholder, roleUuid: first },
        extraRoleUuids: rest,
    };
};

/** Rebuilds a set from a slot row plus its extras (placeholder never surfaces). */
export const joinRoleSet = <TRole extends string>(
    slot: { role: TRole; roleUuid: string | null },
    extraRoleUuids: string[],
): { systemRole: TRole | null; customRoleUuids: string[] } => ({
    systemRole: slot.roleUuid ? null : slot.role,
    customRoleUuids: slot.roleUuid
        ? [slot.roleUuid, ...extraRoleUuids.filter((u) => u !== slot.roleUuid)]
        : [...extraRoleUuids],
});

export const ORGANIZATION_PLACEHOLDER_ROLE = OrganizationMemberRole.MEMBER;
export const PROJECT_PLACEHOLDER_ROLE = ProjectMemberRole.VIEWER;

export const clearOrganizationExtraRoles = async (
    db: Knex,
    organizationId: number,
    userId: number,
): Promise<void> => {
    await db(OrganizationMembershipCustomRolesTableName)
        .where({ organization_id: organizationId, user_id: userId })
        .delete();
};

export const clearProjectExtraRoles = async (
    db: Knex,
    projectId: number,
    userId: number,
): Promise<void> => {
    await db(ProjectMembershipCustomRolesTableName)
        .where({ project_id: projectId, user_id: userId })
        .delete();
};

export const clearGroupExtraRoles = async (
    db: Knex,
    projectUuid: string,
    groupUuid: string,
): Promise<void> => {
    await db(ProjectGroupAccessCustomRolesTableName)
        .where({ project_uuid: projectUuid, group_uuid: groupUuid })
        .delete();
};

/** Replaces the extra custom roles of one parent row (delete + insert) inside `db`. */
export const replaceExtraRoles = async (
    db: Knex,
    table:
        | typeof OrganizationMembershipCustomRolesTableName
        | typeof ProjectMembershipCustomRolesTableName
        | typeof ProjectGroupAccessCustomRolesTableName,
    parentKey: Record<string, number | string>,
    extraRoleUuids: string[],
): Promise<void> => {
    // Untyped table handle: the three join tables share the (parent key + role_uuid) shape.
    const rows = db<Record<string, number | string>>(table);
    await rows.clone().where(parentKey).delete();
    if (extraRoleUuids.length > 0) {
        await rows.clone().insert(
            extraRoleUuids.map((roleUuid) => ({
                ...parentKey,
                role_uuid: roleUuid,
            })),
        );
    }
};
