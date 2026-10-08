import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds organization identity rules and copies legacy settings without changing the existing table.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(`
        CREATE TABLE organization_agent_identity_rules (
            organization_uuid uuid NOT NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
            warehouse_type varchar(255) NOT NULL REFERENCES warehouse_types(warehouse_type),
            actor_kind text NOT NULL CHECK (actor_kind IN ('person', 'service_account')),
            source text NOT NULL CHECK (source IN ('marked_person', 'agent_sign_in', 'ai_service_account')),
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (organization_uuid, warehouse_type, actor_kind)
        );
        CREATE INDEX organization_agent_identity_rules_warehouse_type_fk
            ON organization_agent_identity_rules(warehouse_type);
        INSERT INTO organization_agent_identity_rules
            (organization_uuid, warehouse_type, actor_kind, source)
        SELECT organization_uuid, 'snowflake', actor_kind,
            CASE WHEN require_verified_agent_sessions THEN 'agent_sign_in' ELSE 'marked_person' END
        FROM organization_agent_identity_settings
        CROSS JOIN (VALUES ('person'), ('service_account')) AS actors(actor_kind)
        ON CONFLICT DO NOTHING;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.dropTable('organization_agent_identity_rules');
}
