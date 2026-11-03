import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates a new empty table for agent table lists. Existing tables keep their columns and constraints, and the previous release never reads or writes the new table.',
};

const TableName = 'ai_agent_warehouse_table_lists';

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.raw(`
        CREATE TABLE ${TableName} (
            ai_agent_warehouse_table_list_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            owner_kind text NOT NULL CHECK (owner_kind IN ('agent_sign_in', 'ai_service_account')),
            user_uuid uuid NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
            ai_service_account_credential_uuid uuid NULL
                REFERENCES ai_service_account_credentials(ai_service_account_credential_uuid) ON DELETE CASCADE,
            credential_generation uuid NOT NULL,
            project_uuid uuid NOT NULL REFERENCES projects(project_uuid) ON DELETE CASCADE,
            scope_fingerprint text NOT NULL CHECK (scope_fingerprint ~ '^[0-9a-f]{64}$'),
            tables jsonb NOT NULL CHECK (jsonb_typeof(tables) = 'object'),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ai_agent_warehouse_table_lists_owner CHECK (
                (owner_kind = 'agent_sign_in'
                    AND user_uuid IS NOT NULL
                    AND ai_service_account_credential_uuid IS NULL)
                OR (owner_kind = 'ai_service_account'
                    AND ai_service_account_credential_uuid IS NOT NULL
                    AND user_uuid IS NULL)
            )
        );
        CREATE UNIQUE INDEX ai_agent_warehouse_table_lists_sign_in_scope
            ON ${TableName} (user_uuid, project_uuid, scope_fingerprint);
        CREATE UNIQUE INDEX ai_agent_warehouse_table_lists_service_account_scope
            ON ${TableName} (ai_service_account_credential_uuid, project_uuid, scope_fingerprint);
        CREATE INDEX ai_agent_warehouse_table_lists_project_fk
            ON ${TableName} (project_uuid);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.dropTableIfExists(TableName);
}
