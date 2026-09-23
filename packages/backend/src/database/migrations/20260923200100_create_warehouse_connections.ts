import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Creates new warehouse connection tables and their indexes, which older binaries never read or write',
} as const;

const NEW_TABLES = [
    'project_connection_mode_events',
    'warehouse_connection_catalog_cache',
    'warehouse_connection_manifests',
    'warehouse_connection_tables',
    'warehouse_connection_user_credentials_preference',
    'warehouse_connections',
];

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);

    await knex.raw(`
        CREATE TABLE IF NOT EXISTS warehouse_connections (
            warehouse_connection_uuid uuid NOT NULL DEFAULT uuid_generate_v4(),
            project_uuid uuid NOT NULL,
            is_original boolean NOT NULL,
            name text NOT NULL,
            warehouse_type varchar(255) NULL,
            encrypted_credentials bytea NULL,
            organization_warehouse_credentials_uuid uuid NULL,
            list_all_databases boolean NOT NULL DEFAULT false,
            additional_databases text[] NOT NULL DEFAULT '{}',
            created_by_user_uuid uuid NULL,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT warehouse_connections_pkey
                PRIMARY KEY (warehouse_connection_uuid),
            CONSTRAINT warehouse_connections_project_uuid_fkey
                FOREIGN KEY (project_uuid)
                REFERENCES projects (project_uuid) ON DELETE CASCADE,
            CONSTRAINT warehouse_connections_warehouse_type_fkey
                FOREIGN KEY (warehouse_type)
                REFERENCES warehouse_types (warehouse_type),
            CONSTRAINT warehouse_connections_organization_credentials_fkey
                FOREIGN KEY (organization_warehouse_credentials_uuid)
                REFERENCES organization_warehouse_credentials (organization_warehouse_credentials_uuid)
                DEFERRABLE INITIALLY DEFERRED,
            CONSTRAINT warehouse_connections_created_by_user_uuid_fkey
                FOREIGN KEY (created_by_user_uuid)
                REFERENCES users (user_uuid) ON DELETE SET NULL,
            CONSTRAINT warehouse_connections_name_check
                CHECK (char_length(name) BETWEEN 1 AND 100 AND name !~ '^\\s' AND name !~ '\\s$'),
            CONSTRAINT warehouse_connections_original_check
                CHECK (is_original = (warehouse_type IS NULL AND encrypted_credentials IS NULL AND organization_warehouse_credentials_uuid IS NULL)),
            CONSTRAINT warehouse_connections_credential_source_check
                CHECK (is_original OR ((encrypted_credentials IS NULL) <> (organization_warehouse_credentials_uuid IS NULL))),
            CONSTRAINT warehouse_connections_extra_warehouse_type_check
                CHECK (is_original OR warehouse_type IS NOT NULL),
            CONSTRAINT warehouse_connections_project_connection_unique
                UNIQUE (project_uuid, warehouse_connection_uuid),
            CONSTRAINT warehouse_connections_project_name_unique
                UNIQUE (project_uuid, name)
        )
    `);
    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS warehouse_connections_one_original_per_project
        ON warehouse_connections (project_uuid) WHERE is_original
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_connections_organization_credentials_idx
        ON warehouse_connections (organization_warehouse_credentials_uuid)
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_connections_created_by_user_uuid_idx
        ON warehouse_connections (created_by_user_uuid)
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_connections_warehouse_type_idx
        ON warehouse_connections (warehouse_type)
    `);

    await knex.raw(`
        CREATE TABLE IF NOT EXISTS warehouse_connection_user_credentials_preference (
            user_uuid uuid NOT NULL,
            warehouse_connection_uuid uuid NOT NULL,
            user_warehouse_credentials_uuid uuid NOT NULL,
            CONSTRAINT warehouse_connection_user_credentials_preference_pkey
                PRIMARY KEY (user_uuid, warehouse_connection_uuid),
            CONSTRAINT warehouse_connection_preference_user_uuid_fkey
                FOREIGN KEY (user_uuid)
                REFERENCES users (user_uuid) ON DELETE CASCADE,
            CONSTRAINT warehouse_connection_preference_connection_fkey
                FOREIGN KEY (warehouse_connection_uuid)
                REFERENCES warehouse_connections (warehouse_connection_uuid) ON DELETE CASCADE,
            CONSTRAINT warehouse_connection_preference_user_credentials_fkey
                FOREIGN KEY (user_warehouse_credentials_uuid)
                REFERENCES user_warehouse_credentials (user_warehouse_credentials_uuid) ON DELETE CASCADE
        )
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_connection_preference_connection_idx
        ON warehouse_connection_user_credentials_preference (warehouse_connection_uuid)
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_connection_preference_user_credentials_idx
        ON warehouse_connection_user_credentials_preference (user_warehouse_credentials_uuid)
    `);

    await knex.raw(`
        CREATE TABLE IF NOT EXISTS warehouse_connection_tables (
            warehouse_connection_table_uuid uuid NOT NULL DEFAULT uuid_generate_v4(),
            warehouse_connection_uuid uuid NOT NULL,
            user_warehouse_credentials_uuid uuid NULL,
            listed_database text NOT NULL,
            database text NOT NULL,
            schema text NOT NULL,
            "table" text NOT NULL,
            partition_column jsonb NULL,
            table_type varchar(255) NULL,
            CONSTRAINT warehouse_connection_tables_pkey
                PRIMARY KEY (warehouse_connection_table_uuid),
            CONSTRAINT warehouse_connection_tables_connection_fkey
                FOREIGN KEY (warehouse_connection_uuid)
                REFERENCES warehouse_connections (warehouse_connection_uuid) ON DELETE CASCADE,
            CONSTRAINT warehouse_connection_tables_user_credentials_fkey
                FOREIGN KEY (user_warehouse_credentials_uuid)
                REFERENCES user_warehouse_credentials (user_warehouse_credentials_uuid) ON DELETE CASCADE
        )
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_connection_tables_scope_idx
        ON warehouse_connection_tables (warehouse_connection_uuid, user_warehouse_credentials_uuid, listed_database)
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS warehouse_connection_tables_user_credentials_idx
        ON warehouse_connection_tables (user_warehouse_credentials_uuid)
    `);

    await knex.raw(`
        CREATE TABLE IF NOT EXISTS warehouse_connection_manifests (
            warehouse_connection_uuid uuid NOT NULL,
            manifest bytea NOT NULL,
            created_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT warehouse_connection_manifests_pkey
                PRIMARY KEY (warehouse_connection_uuid),
            CONSTRAINT warehouse_connection_manifests_connection_fkey
                FOREIGN KEY (warehouse_connection_uuid)
                REFERENCES warehouse_connections (warehouse_connection_uuid) ON DELETE CASCADE
        )
    `);

    await knex.raw(`
        CREATE TABLE IF NOT EXISTS warehouse_connection_catalog_cache (
            warehouse_connection_uuid uuid NOT NULL,
            warehouse jsonb NOT NULL,
            created_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT warehouse_connection_catalog_cache_pkey
                PRIMARY KEY (warehouse_connection_uuid),
            CONSTRAINT warehouse_connection_catalog_cache_connection_fkey
                FOREIGN KEY (warehouse_connection_uuid)
                REFERENCES warehouse_connections (warehouse_connection_uuid) ON DELETE CASCADE
        )
    `);

    await knex.raw(`
        CREATE TABLE IF NOT EXISTS project_connection_mode_events (
            project_connection_mode_event_uuid uuid NOT NULL DEFAULT uuid_generate_v4(),
            project_uuid uuid NOT NULL,
            actor_user_uuid uuid NULL,
            event text NOT NULL,
            plan jsonb NULL,
            plan_hash text NULL,
            idempotency_key text NULL,
            created_at timestamp NOT NULL DEFAULT now(),
            CONSTRAINT project_connection_mode_events_pkey
                PRIMARY KEY (project_connection_mode_event_uuid),
            CONSTRAINT project_connection_mode_events_project_uuid_fkey
                FOREIGN KEY (project_uuid)
                REFERENCES projects (project_uuid) ON DELETE CASCADE,
            CONSTRAINT project_connection_mode_events_actor_user_uuid_fkey
                FOREIGN KEY (actor_user_uuid)
                REFERENCES users (user_uuid) ON DELETE SET NULL,
            CONSTRAINT project_connection_mode_events_event_check
                CHECK (event IN ('switched_to_multi', 'connection_added', 'connection_removed', 'rescued_by_engineering'))
        )
    `);
    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS project_connection_mode_events_idempotency_key_unique
        ON project_connection_mode_events (idempotency_key)
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS project_connection_mode_events_project_uuid_idx
        ON project_connection_mode_events (project_uuid)
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS project_connection_mode_events_actor_user_uuid_idx
        ON project_connection_mode_events (actor_user_uuid)
    `);
}

const hasRows = async (knex: Knex, sql: string): Promise<boolean> =>
    ((await knex.raw<{ rowCount: number }>(sql)).rowCount ?? 0) > 0;

const findReversalBlockers = async (knex: Knex): Promise<string[]> => {
    const blockers: string[] = [];
    const hasConnectionMode = await hasRows(
        knex,
        `SELECT 1 FROM pg_attribute
         WHERE attrelid = 'projects'::regclass
           AND attname = 'connection_mode'
           AND NOT attisdropped`,
    );
    if (
        hasConnectionMode &&
        (await hasRows(
            knex,
            `SELECT 1 FROM projects WHERE connection_mode = 'multi' LIMIT 1`,
        ))
    ) {
        blockers.push('a project uses multiple warehouse connections');
    }
    const hasConnections = await hasRows(
        knex,
        `SELECT 1 WHERE to_regclass('warehouse_connections') IS NOT NULL`,
    );
    if (
        hasConnections &&
        (await hasRows(
            knex,
            `SELECT 1 FROM warehouse_connections WHERE NOT is_original LIMIT 1`,
        ))
    ) {
        blockers.push('a project has an extra warehouse connection');
    }
    return blockers;
};

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    const blockers = await findReversalBlockers(knex);
    if (blockers.length > 0) {
        throw new Error(
            `irreversible: ${blockers.join(
                ', ',
            )}, and dropping the warehouse connection tables would lose it`,
        );
    }
    await knex.raw(`DROP TABLE IF EXISTS ${NEW_TABLES.join(', ')}`);
}
