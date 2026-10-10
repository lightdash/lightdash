import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Removes the Raw SQL agent scope from every user-owned custom role in every organization, including explicit grants. Previous pods tolerate missing scope rows and refuse managed agent Raw SQL unless another role grants it. Legacy and flag-off execution remain unchanged. No schema shape changes.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        DELETE FROM scoped_roles AS sr
        USING roles AS r
        WHERE sr.role_uuid = r.role_uuid
          AND r.owner_type = 'user'
          AND sr.scope_name = 'view:AgentRawSql'
    `);
}

export async function down(): Promise<void> {
    throw new Error('irreversible: removed Raw SQL grants cannot be rebuilt');
}
