import { NotFoundError, Role } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbRole,
    DbRoleInsert,
    DbRoleUpdate,
    RolesTableName,
} from '../database/entities/roles';

export class RolesModel {
    private readonly database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static mapDbRoleToRole(dbRole: DbRole): Role {
        return {
            roleUuid: dbRole.role_uuid,
            name: dbRole.name,
            description: dbRole.description,
            organizationUuid: dbRole.organization_uuid,
            createdBy: dbRole.created_by,
            createdAt: dbRole.created_at,
            updatedAt: dbRole.updated_at,
        };
    }

    async listByOrg(organizationUuid: string): Promise<Role[]> {
        const dbRoles = await this.database(RolesTableName)
            .where('organization_uuid', organizationUuid)
            .orderBy('name', 'asc');

        return dbRoles.map(RolesModel.mapDbRoleToRole);
    }

    async getByUuid(roleUuid: string): Promise<Role> {
        const dbRole = await this.database(RolesTableName)
            .where('role_uuid', roleUuid)
            .first();

        if (!dbRole) {
            throw new NotFoundError(`Role with UUID ${roleUuid} not found`);
        }

        return RolesModel.mapDbRoleToRole(dbRole);
    }

    async create(role: DbRoleInsert): Promise<Role> {
        const [newRole] = await this.database(RolesTableName)
            .insert(role)
            .returning('*');

        return RolesModel.mapDbRoleToRole(newRole);
    }

    async update(roleUuid: string, updates: DbRoleUpdate): Promise<Role> {
        const [updatedRole] = await this.database(RolesTableName)
            .where('role_uuid', roleUuid)
            .update({
                ...updates,
                updated_at: new Date(),
            })
            .returning('*');

        if (!updatedRole) {
            throw new NotFoundError(`Role with UUID ${roleUuid} not found`);
        }

        return RolesModel.mapDbRoleToRole(updatedRole);
    }

    async delete(roleUuid: string): Promise<void> {
        const deletedCount = await this.database(RolesTableName)
            .where('role_uuid', roleUuid)
            .delete();

        if (deletedCount === 0) {
            throw new NotFoundError(`Role with UUID ${roleUuid} not found`);
        }
    }

    async findRoleByNameAndOrg(
        name: string,
        organizationUuid: string,
    ): Promise<Role | undefined> {
        const dbRole = await this.database(RolesTableName)
            .where('name', name)
            .where('organization_uuid', organizationUuid)
            .first();

        return dbRole ? RolesModel.mapDbRoleToRole(dbRole) : undefined;
    }
}
