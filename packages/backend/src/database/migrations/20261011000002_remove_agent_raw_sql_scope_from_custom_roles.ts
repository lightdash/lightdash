import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'The migration removes the Raw SQL agent scope from every user-owned custom role that holds another scope, in every organization, including explicit grants. A role whose only scope is the Raw SQL agent scope keeps it. The statement locks the other scope row, so the role still holds a scope when the migration commits. Previous pods tolerate the missing rows. Legacy and flag-off execution do not change. The schema shape does not change.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        DELETE FROM scoped_roles AS sr
        USING roles AS r
        WHERE sr.role_uuid = r.role_uuid
          AND r.owner_type = 'user'
          AND sr.scope_name = 'view:AgentRawSql'
          AND EXISTS (
              SELECT 1
              FROM scoped_roles AS other
              WHERE other.role_uuid = sr.role_uuid
                AND other.scope_name <> 'view:AgentRawSql'
              FOR KEY SHARE OF other
          )
    `);
}

export async function down(): Promise<void> {
    throw new Error('irreversible: removed Raw SQL grants cannot be rebuilt');
}
