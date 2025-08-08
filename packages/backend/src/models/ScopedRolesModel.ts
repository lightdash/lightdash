import { NotFoundError, RoleWithScopes } from '@lightdash/common';
import { Knex } from 'knex';
import {
    RolesTableName,
    ScopedRolesTableName,
    ScopesTableName,
} from '../database/entities/roles';

export class ScopedRolesModel {
    private readonly database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    async addScopesToRole(
        roleUuid: string,
        scopeUuids: string[],
        grantedBy: string,
    ): Promise<void> {
        if (scopeUuids.length === 0) {
            return;
        }

        // Check for existing relationships to avoid duplicates
        const existing = await this.database(ScopedRolesTableName)
            .where('role_uuid', roleUuid)
            .whereIn('scope_uuid', scopeUuids)
            .select('scope_uuid');

        const existingScopeUuids = existing.map((row) => row.scope_uuid);
        const newScopeUuids = scopeUuids.filter(
            (scopeUuid) => !existingScopeUuids.includes(scopeUuid),
        );

        if (newScopeUuids.length === 0) {
            return; // All scopes already exist
        }

        const scopedRolesToInsert = newScopeUuids.map((scopeUuid) => ({
            role_uuid: roleUuid,
            scope_uuid: scopeUuid,
            granted_by: grantedBy,
        }));

        await this.database.batchInsert(
            ScopedRolesTableName,
            scopedRolesToInsert,
        );
    }

    async removeScopesFromRole(
        roleUuid: string,
        scopeUuids: string[],
    ): Promise<void> {
        if (scopeUuids.length === 0) {
            return;
        }

        const deletedCount = await this.database(ScopedRolesTableName)
            .where('role_uuid', roleUuid)
            .whereIn('scope_uuid', scopeUuids)
            .delete();

        if (deletedCount === 0) {
            throw new NotFoundError('No scope assignments found for this role');
        }
    }

    async removeAllScopesFromRole(roleUuid: string): Promise<void> {
        await this.database(ScopedRolesTableName)
            .where('role_uuid', roleUuid)
            .delete();
    }

    async removeAllRolesFromScope(scopeUuid: string): Promise<void> {
        await this.database(ScopedRolesTableName)
            .where('scope_uuid', scopeUuid)
            .delete();
    }

    async getScopedRole(roleUuid: string): Promise<RoleWithScopes> {
        // Get the role with its scopes using a join
        const roleWithScopes = await this.database(RolesTableName)
            .leftJoin(
                ScopedRolesTableName,
                'roles.role_uuid',
                'scoped_roles.role_uuid',
            )
            .leftJoin(
                ScopesTableName,
                'scoped_roles.scope_uuid',
                'scopes.scope_uuid',
            )
            .where('roles.role_uuid', roleUuid)
            .select(
                'roles.*',
                'scopes.scope_uuid',
                'scopes.resource',
                'scopes.action',
                'scopes.name as scope_name',
                'scopes.description as scope_description',
                'scopes.created_at as scope_created_at',
            );

        if (roleWithScopes.length === 0) {
            throw new NotFoundError(`Role with UUID ${roleUuid} not found`);
        }

        // Extract the role data from the first row
        const roleData = roleWithScopes[0];
        const role: RoleWithScopes = {
            roleUuid: roleData.role_uuid,
            name: roleData.name,
            description: roleData.description,
            organizationUuid: roleData.organization_uuid,
            createdBy: roleData.created_by,
            createdAt: roleData.created_at,
            updatedAt: roleData.updated_at,
            scopes: [],
        };

        // Extract scopes from all rows (filtering out null scopes from left join)
        role.scopes = roleWithScopes
            .filter((row) => row.scope_uuid !== null)
            .map((row) => ({
                scopeUuid: row.scope_uuid,
                resource: row.resource,
                action: row.action,
                name: row.scope_name,
                description: row.scope_description,
                createdAt: row.scope_created_at,
            }));

        return role;
    }
}
