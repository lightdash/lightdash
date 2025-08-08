import { NotFoundError, Scope } from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbScope,
    DbScopeInsert,
    ScopesTableName,
} from '../database/entities/roles';

export class ScopesModel {
    private readonly database: Knex;

    constructor(database: Knex) {
        this.database = database;
    }

    static mapDbScopeToScope(dbScope: DbScope): Scope {
        return {
            scopeUuid: dbScope.scope_uuid,
            resource: dbScope.resource,
            action: dbScope.action,
            name: dbScope.name,
            description: dbScope.description,
            createdAt: dbScope.created_at,
        };
    }

    /**
     * List scopes, optionally filtered by scope UUIDs
     * @param scopeUuids - Optional array of scope UUIDs to filter by
     * @returns Array of scopes
     */
    async list(scopeUuids?: string[]): Promise<Scope[]> {
        const query = this.database(ScopesTableName);

        if (scopeUuids) {
            void query.whereIn('scope_uuid', scopeUuids);
        }

        const scopes = await query.orderBy('resource', 'asc');
        return scopes.map(ScopesModel.mapDbScopeToScope);
    }

    async getByUuid(scopeUuid: string): Promise<Scope> {
        const dbScope = await this.database(ScopesTableName)
            .where('scope_uuid', scopeUuid)
            .first();

        if (!dbScope) {
            throw new NotFoundError(`Scope with UUID ${scopeUuid} not found`);
        }

        return ScopesModel.mapDbScopeToScope(dbScope);
    }

    async create(scope: DbScopeInsert): Promise<Scope> {
        const [newScope] = await this.database(ScopesTableName)
            .insert(scope)
            .returning('*');

        return ScopesModel.mapDbScopeToScope(newScope);
    }
}
