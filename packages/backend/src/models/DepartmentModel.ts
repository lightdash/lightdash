// packages/backend/src/models/DepartmentModel.ts
import {
    AlreadyExistsError,
    NotFoundError,
    ParameterError,
    truncateForMessage,
    type CreateDepartment,
    type Department,
    type DepartmentGroupLink,
    type DepartmentOwner,
    type DepartmentOwnerInput,
    type OrganizationMemberRole,
    type ResolvedMemberRow,
    type UpdateDepartment,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbDepartment,
    DepartmentLinkTableName,
    DepartmentMemberTableName,
    DepartmentOwnerTableName,
    DepartmentTableName,
} from '../database/entities/departments';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { OrganizationTableName } from '../database/entities/organizations';
import { UserTableName } from '../database/entities/users';

const UNIQUE_VIOLATION = '23505';

type Deps = { database: Knex };

type DepartmentRow = Omit<DbDepartment, 'target_date'> & {
    target_date: string | null;
};

type OwnerRow = {
    department_uuid: string;
    principal_uuid: string;
    position: number;
    name: string;
};

// target_date is read as text so no JS Date (and no timezone shift) is built
const departmentColumns = (db: Knex): Array<string | Knex.Raw> => [
    'department_uuid',
    'organization_uuid',
    'parent_department_uuid',
    'name',
    'headcount',
    'headcount_note',
    'target_active_users',
    db.raw(`to_char(target_date, 'YYYY-MM-DD') as target_date`),
    'created_at',
    'updated_at',
    'updated_by_user_uuid',
];

const isUniqueViolation = (e: unknown): boolean =>
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    e.code === UNIQUE_VIOLATION;

const normalizeNote = (note: string | null): string | null => {
    const trimmed = note?.trim() ?? '';
    return trimmed.length > 0 ? trimmed : null;
};

export class DepartmentModel {
    private readonly database: Knex;

    constructor({ database }: Deps) {
        this.database = database;
    }

    private async getRow(
        organizationUuid: string,
        departmentUuid: string,
        db: Knex = this.database,
    ): Promise<DepartmentRow> {
        const [row] = await db(DepartmentTableName)
            .where({
                organization_uuid: organizationUuid,
                department_uuid: departmentUuid,
            })
            .select<DepartmentRow[]>(departmentColumns(db));
        if (!row) {
            throw new NotFoundError(`Department ${departmentUuid} not found`);
        }
        return row;
    }

    private async hydrate(rows: DepartmentRow[]): Promise<Department[]> {
        if (rows.length === 0) return [];
        const uuids = rows.map((r) => r.department_uuid);
        const [links, members, userOwners, groupOwners] = await Promise.all([
            // Inner join drops links whose group has since been deleted
            this.database(DepartmentLinkTableName)
                .innerJoin(
                    GroupTableName,
                    `${GroupTableName}.group_uuid`,
                    `${DepartmentLinkTableName}.link_uuid`,
                )
                .whereIn(`${DepartmentLinkTableName}.department_uuid`, uuids)
                .where(`${DepartmentLinkTableName}.link_type`, 'group')
                .orderBy(`${GroupTableName}.name`, 'asc')
                .select<
                    {
                        department_uuid: string;
                        group_uuid: string;
                        name: string;
                    }[]
                >(
                    `${DepartmentLinkTableName}.department_uuid`,
                    `${GroupTableName}.group_uuid`,
                    `${GroupTableName}.name`,
                ),
            this.database(DepartmentMemberTableName)
                .whereIn('department_uuid', uuids)
                .orderBy('user_uuid', 'asc')
                .select('department_uuid', 'user_uuid'),
            this.database(DepartmentOwnerTableName)
                .innerJoin(
                    UserTableName,
                    `${UserTableName}.user_uuid`,
                    `${DepartmentOwnerTableName}.principal_uuid`,
                )
                .whereIn(`${DepartmentOwnerTableName}.department_uuid`, uuids)
                .where(`${DepartmentOwnerTableName}.principal_type`, 'user')
                .select<OwnerRow[]>(
                    `${DepartmentOwnerTableName}.department_uuid`,
                    `${DepartmentOwnerTableName}.principal_uuid`,
                    `${DepartmentOwnerTableName}.position`,
                    this.database.raw(`trim(concat(??, ' ', ??)) as name`, [
                        `${UserTableName}.first_name`,
                        `${UserTableName}.last_name`,
                    ]),
                ),
            this.database(DepartmentOwnerTableName)
                .innerJoin(
                    GroupTableName,
                    `${GroupTableName}.group_uuid`,
                    `${DepartmentOwnerTableName}.principal_uuid`,
                )
                .whereIn(`${DepartmentOwnerTableName}.department_uuid`, uuids)
                .where(`${DepartmentOwnerTableName}.principal_type`, 'group')
                .select<OwnerRow[]>(
                    `${DepartmentOwnerTableName}.department_uuid`,
                    `${DepartmentOwnerTableName}.principal_uuid`,
                    `${DepartmentOwnerTableName}.position`,
                    `${GroupTableName}.name`,
                ),
        ]);

        const ownersFor = (departmentUuid: string): DepartmentOwner[] =>
            [
                ...userOwners
                    .filter((o) => o.department_uuid === departmentUuid)
                    .map((o) => ({ row: o, type: 'user' as const })),
                ...groupOwners
                    .filter((o) => o.department_uuid === departmentUuid)
                    .map((o) => ({ row: o, type: 'group' as const })),
            ]
                .sort((a, b) => a.row.position - b.row.position)
                .map(({ row, type }) => ({
                    type,
                    uuid: row.principal_uuid,
                    name: row.name,
                }));

        return rows.map((row) => ({
            departmentUuid: row.department_uuid,
            parentDepartmentUuid: row.parent_department_uuid,
            name: row.name,
            headcount: row.headcount,
            headcountNote: row.headcount_note,
            targetActiveUsers: row.target_active_users,
            targetDate: row.target_date,
            owners: ownersFor(row.department_uuid),
            linkedGroups: links
                .filter((l) => l.department_uuid === row.department_uuid)
                .map((l) => ({ groupUuid: l.group_uuid, name: l.name })),
            explicitMemberUuids: members
                .filter((m) => m.department_uuid === row.department_uuid)
                .map((m) => m.user_uuid),
        }));
    }

    async listByOrganization(organizationUuid: string): Promise<Department[]> {
        const rows = await this.database(DepartmentTableName)
            .where('organization_uuid', organizationUuid)
            .orderBy('name', 'asc')
            .select<DepartmentRow[]>(departmentColumns(this.database));
        return this.hydrate(rows);
    }

    async getByUuid(
        organizationUuid: string,
        departmentUuid: string,
    ): Promise<Department> {
        const row = await this.getRow(organizationUuid, departmentUuid);
        const [department] = await this.hydrate([row]);
        return department;
    }

    private async assertParentInOrg(
        organizationUuid: string,
        parentDepartmentUuid: string,
    ): Promise<void> {
        const [row] = await this.database(DepartmentTableName)
            .where({
                organization_uuid: organizationUuid,
                department_uuid: parentDepartmentUuid,
            })
            .select('department_uuid');
        if (!row) {
            throw new ParameterError(
                `Department ${parentDepartmentUuid} is not in this organization`,
            );
        }
    }

    // Walks up from the new parent; reaching the moved department means a cycle
    private async assertNoCycle(
        organizationUuid: string,
        departmentUuid: string,
        newParentUuid: string,
    ): Promise<void> {
        const result = await this.database.raw<{
            rows: { department_uuid: string }[];
        }>(
            `
            WITH RECURSIVE ancestors AS (
                SELECT department_uuid, parent_department_uuid
                FROM organization_departments
                WHERE department_uuid = ? AND organization_uuid = ?
                UNION
                SELECT d.department_uuid, d.parent_department_uuid
                FROM organization_departments d
                JOIN ancestors a ON d.department_uuid = a.parent_department_uuid
                WHERE d.organization_uuid = ?
            )
            SELECT department_uuid FROM ancestors WHERE department_uuid = ? LIMIT 1
            `,
            [newParentUuid, organizationUuid, organizationUuid, departmentUuid],
        );
        if (result.rows.length > 0) {
            throw new ParameterError(
                'A department cannot sit under itself or one of its sub-departments',
            );
        }
    }

    async create(
        organizationUuid: string,
        data: CreateDepartment,
        updatedByUserUuid: string,
    ): Promise<Department> {
        if (data.parentDepartmentUuid !== null) {
            await this.assertParentInOrg(
                organizationUuid,
                data.parentDepartmentUuid,
            );
        }
        try {
            const [created] = await this.database(DepartmentTableName)
                .insert({
                    organization_uuid: organizationUuid,
                    parent_department_uuid: data.parentDepartmentUuid,
                    name: data.name.trim(),
                    headcount: data.headcount,
                    headcount_note: normalizeNote(data.headcountNote),
                    target_active_users: data.targetActiveUsers,
                    target_date: data.targetDate,
                    updated_by_user_uuid: updatedByUserUuid,
                })
                .returning('department_uuid');
            return await this.getByUuid(
                organizationUuid,
                created.department_uuid,
            );
        } catch (e) {
            if (isUniqueViolation(e)) {
                throw new AlreadyExistsError(
                    `A department named "${truncateForMessage(data.name.trim())}" already exists`,
                );
            }
            throw e;
        }
    }

    async update(
        organizationUuid: string,
        departmentUuid: string,
        data: UpdateDepartment,
        updatedByUserUuid: string,
    ): Promise<Department> {
        await this.getRow(organizationUuid, departmentUuid);
        const parent = data.parentDepartmentUuid;
        if (parent !== undefined && parent !== null) {
            await this.assertParentInOrg(organizationUuid, parent);
            await this.assertNoCycle(organizationUuid, departmentUuid, parent);
        }
        try {
            await this.database(DepartmentTableName)
                .where({
                    organization_uuid: organizationUuid,
                    department_uuid: departmentUuid,
                })
                .update({
                    ...(data.name !== undefined
                        ? { name: data.name.trim() }
                        : {}),
                    ...(parent !== undefined
                        ? { parent_department_uuid: parent }
                        : {}),
                    ...(data.headcount !== undefined
                        ? { headcount: data.headcount }
                        : {}),
                    ...(data.headcountNote !== undefined
                        ? { headcount_note: normalizeNote(data.headcountNote) }
                        : {}),
                    ...(data.targetActiveUsers !== undefined
                        ? { target_active_users: data.targetActiveUsers }
                        : {}),
                    ...(data.targetDate !== undefined
                        ? { target_date: data.targetDate }
                        : {}),
                    updated_by_user_uuid: updatedByUserUuid,
                    updated_at: new Date(),
                });
        } catch (e) {
            if (isUniqueViolation(e)) {
                throw new AlreadyExistsError(
                    `A department named "${truncateForMessage(data.name?.trim() ?? '')}" already exists`,
                );
            }
            throw e;
        }
        return this.getByUuid(organizationUuid, departmentUuid);
    }

    async delete(
        organizationUuid: string,
        departmentUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const row = await this.getRow(
                organizationUuid,
                departmentUuid,
                trx,
            );
            // Children move up one level instead of jumping to the top
            await trx(DepartmentTableName)
                .where({
                    organization_uuid: organizationUuid,
                    parent_department_uuid: departmentUuid,
                })
                .update({ parent_department_uuid: row.parent_department_uuid });
            await trx(DepartmentTableName)
                .where({
                    organization_uuid: organizationUuid,
                    department_uuid: departmentUuid,
                })
                .delete();
        });
    }

    private async assertGroupsInOrg(
        organizationUuid: string,
        groupUuids: string[],
    ): Promise<void> {
        if (groupUuids.length === 0) return;
        const found = await this.database(GroupTableName)
            .innerJoin(
                OrganizationTableName,
                `${GroupTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .whereIn(`${GroupTableName}.group_uuid`, groupUuids)
            .select<{ group_uuid: string }[]>(`${GroupTableName}.group_uuid`);
        const foundSet = new Set(found.map((g) => g.group_uuid));
        const missing = groupUuids.find((g) => !foundSet.has(g));
        if (missing) {
            throw new ParameterError(
                `Group ${missing} is not in this organization`,
            );
        }
    }

    private async assertUsersInOrg(
        organizationUuid: string,
        userUuids: string[],
    ): Promise<void> {
        if (userUuids.length === 0) return;
        const found = await this.database(OrganizationMembershipsTableName)
            .innerJoin(
                UserTableName,
                `${OrganizationMembershipsTableName}.user_id`,
                `${UserTableName}.user_id`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationMembershipsTableName}.organization_id`,
                `${OrganizationTableName}.organization_id`,
            )
            .where(
                `${OrganizationTableName}.organization_uuid`,
                organizationUuid,
            )
            .where(`${UserTableName}.is_internal`, false)
            .whereIn(`${UserTableName}.user_uuid`, userUuids)
            .select<{ user_uuid: string }[]>(`${UserTableName}.user_uuid`);
        const foundSet = new Set(found.map((u) => u.user_uuid));
        const missing = userUuids.find((u) => !foundSet.has(u));
        if (missing) {
            throw new ParameterError(
                `User ${missing} is not in this organization`,
            );
        }
    }

    async setGroupLinks(
        organizationUuid: string,
        departmentUuid: string,
        groupUuids: string[],
    ): Promise<Department> {
        const unique = Array.from(new Set(groupUuids));
        await this.assertGroupsInOrg(organizationUuid, unique);
        await this.getRow(organizationUuid, departmentUuid);
        await this.database.transaction(async (trx) => {
            // A group maps to one department, so take it from any other
            await trx(DepartmentLinkTableName)
                .where('link_type', 'group')
                .whereIn('link_uuid', unique)
                .delete();
            await trx(DepartmentLinkTableName)
                .where({ department_uuid: departmentUuid, link_type: 'group' })
                .delete();
            if (unique.length > 0) {
                await trx(DepartmentLinkTableName).insert(
                    unique.map((link_uuid) => ({
                        department_uuid: departmentUuid,
                        link_type: 'group' as const,
                        link_uuid,
                    })),
                );
            }
        });
        return this.getByUuid(organizationUuid, departmentUuid);
    }

    async setMembers(
        organizationUuid: string,
        departmentUuid: string,
        userUuids: string[],
    ): Promise<Department> {
        const unique = Array.from(new Set(userUuids));
        await this.assertUsersInOrg(organizationUuid, unique);
        await this.getRow(organizationUuid, departmentUuid);
        await this.database.transaction(async (trx) => {
            // One explicit assignment per user per org
            const orgDepartments = trx(DepartmentTableName)
                .select('department_uuid')
                .where('organization_uuid', organizationUuid);
            await trx(DepartmentMemberTableName)
                .whereIn('department_uuid', orgDepartments)
                .whereIn('user_uuid', unique)
                .delete();
            await trx(DepartmentMemberTableName)
                .where('department_uuid', departmentUuid)
                .delete();
            if (unique.length > 0) {
                await trx(DepartmentMemberTableName).insert(
                    unique.map((user_uuid) => ({
                        department_uuid: departmentUuid,
                        user_uuid,
                    })),
                );
            }
        });
        return this.getByUuid(organizationUuid, departmentUuid);
    }

    async setOwners(
        organizationUuid: string,
        departmentUuid: string,
        owners: DepartmentOwnerInput[],
    ): Promise<Department> {
        const seen = new Set<string>();
        const unique = owners.filter((o) => {
            const key = `${o.type}:${o.uuid}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        await this.assertUsersInOrg(
            organizationUuid,
            unique.filter((o) => o.type === 'user').map((o) => o.uuid),
        );
        await this.assertGroupsInOrg(
            organizationUuid,
            unique.filter((o) => o.type === 'group').map((o) => o.uuid),
        );
        await this.getRow(organizationUuid, departmentUuid);
        await this.database.transaction(async (trx) => {
            await trx(DepartmentOwnerTableName)
                .where('department_uuid', departmentUuid)
                .delete();
            if (unique.length > 0) {
                await trx(DepartmentOwnerTableName).insert(
                    unique.map((owner, position) => ({
                        department_uuid: departmentUuid,
                        principal_type: owner.type,
                        principal_uuid: owner.uuid,
                        position,
                    })),
                );
            }
        });
        return this.getByUuid(organizationUuid, departmentUuid);
    }

    // Only active users who finished sign-up count; pending is derived as in the organization members list
    async getResolvedMemberRows(
        organizationUuid: string,
    ): Promise<ResolvedMemberRow[]> {
        const result = await this.database.raw<{
            rows: Array<{
                user_uuid: string;
                email: string;
                first_name: string;
                last_name: string;
                role: OrganizationMemberRole;
                explicit_department_uuid: string | null;
                group_links: DepartmentGroupLink[] | null;
            }>;
        }>(
            `
            WITH org AS (
                SELECT organization_id, organization_uuid
                FROM organizations WHERE organization_uuid = ?
            ),
            org_users AS (
                SELECT u.user_id, u.user_uuid, u.first_name, u.last_name, om.role, e.email
                FROM organization_memberships om
                JOIN org ON org.organization_id = om.organization_id
                JOIN users u ON u.user_id = om.user_id
                JOIN emails e ON e.user_id = u.user_id AND e.is_primary = true
                WHERE u.is_internal = false
                  AND u.is_active = true
                  AND (
                      e.is_verified = true
                      OR EXISTS (SELECT 1 FROM password_logins pl WHERE pl.user_id = u.user_id)
                      OR EXISTS (SELECT 1 FROM openid_identities oi WHERE oi.user_id = u.user_id)
                  )
            ),
            explicit AS (
                SELECT dm.user_uuid, MIN(dm.department_uuid::text) AS department_uuid
                FROM department_members dm
                JOIN organization_departments d ON d.department_uuid = dm.department_uuid
                JOIN org ON org.organization_uuid = d.organization_uuid
                GROUP BY dm.user_uuid
            ),
            via_groups AS (
                SELECT ou.user_uuid,
                       json_agg(DISTINCT jsonb_build_object(
                           'departmentUuid', dl.department_uuid,
                           'groupUuid', g.group_uuid,
                           'groupName', g.name
                       )) AS group_links
                FROM org_users ou
                JOIN group_memberships gm ON gm.user_id = ou.user_id
                JOIN groups g ON g.group_uuid = gm.group_uuid
                JOIN department_links dl ON dl.link_type = 'group' AND dl.link_uuid = g.group_uuid
                JOIN organization_departments d ON d.department_uuid = dl.department_uuid
                JOIN org ON org.organization_uuid = d.organization_uuid
                GROUP BY ou.user_uuid
            )
            SELECT ou.user_uuid, ou.email, ou.first_name, ou.last_name, ou.role,
                   ex.department_uuid AS explicit_department_uuid,
                   vg.group_links
            FROM org_users ou
            LEFT JOIN explicit ex ON ex.user_uuid = ou.user_uuid
            LEFT JOIN via_groups vg ON vg.user_uuid = ou.user_uuid
            `,
            [organizationUuid],
        );
        return result.rows.map((r) => ({
            userUuid: r.user_uuid,
            email: r.email,
            firstName: r.first_name,
            lastName: r.last_name,
            role: r.role,
            explicitDepartmentUuid: r.explicit_department_uuid,
            groupLinks: r.group_links ?? [],
        }));
    }
}
