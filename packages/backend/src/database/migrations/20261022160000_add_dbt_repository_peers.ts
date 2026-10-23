import { type Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds repository metadata and nullable peer identity without changing legacy connections or inserting sources visible to older binaries',
};

const inSequence = <T>(items: T[], step: (item: T) => Promise<void>) =>
    items.reduce<Promise<void>>(
        (previous, item) => previous.then(() => step(item)),
        Promise.resolve(),
    );

const withSession = async (
    knex: Knex,
    run: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await knex.raw("SET lock_timeout = '5s'").connection(connection);
        await run(connection);
    } finally {
        try {
            await knex.raw('RESET lock_timeout').connection(connection);
        } finally {
            try {
                await knex
                    .raw('RESET statement_timeout')
                    .connection(connection);
            } finally {
                await knex.client.releaseConnection(connection);
            }
        }
    }
};

const ensureIndex = async (
    knex: Knex,
    connection: unknown,
    name: string,
    definition: string,
): Promise<void> => {
    const invalid = await knex
        .raw(
            `SELECT 1 FROM pg_index WHERE indexrelid = to_regclass(?) AND NOT indisvalid`,
            [name],
        )
        .connection(connection);
    if (invalid.rows.length) {
        await knex
            .raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`)
            .connection(connection);
    }
    console.log(`Creating ${name}`);
    await knex
        .raw(
            `CREATE ${definition.startsWith('UNIQUE') ? 'UNIQUE ' : ''}INDEX CONCURRENTLY IF NOT EXISTS ${name} ${definition.replace(/^UNIQUE /, '')}`,
        )
        .connection(connection);
};

const addConstraint = async (
    knex: Knex,
    connection: unknown,
    name: string,
    definition: string,
): Promise<void> => {
    const existing = await knex
        .raw(
            `SELECT 1 FROM pg_constraint WHERE conrelid = 'project_dbt_sources'::regclass AND conname = ?`,
            [name],
        )
        .connection(connection);
    if (!existing.rows.length) {
        await knex
            .raw(
                `ALTER TABLE project_dbt_sources ADD CONSTRAINT ${name} ${definition} NOT VALID`,
            )
            .connection(connection);
    }
    console.log(`Validating ${name}`);
    await knex
        .raw(`ALTER TABLE project_dbt_sources VALIDATE CONSTRAINT ${name}`)
        .connection(connection);
};

export async function up(knex: Knex): Promise<void> {
    await withSession(knex, async (connection) => {
        await knex
            .raw(`
            CREATE TABLE IF NOT EXISTS dbt_repositories (
                dbt_repository_uuid uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
                organization_uuid uuid NOT NULL REFERENCES organizations(organization_uuid) ON DELETE CASCADE,
                provider text NOT NULL CHECK (provider IN ('github', 'gitlab', 'bitbucket', 'azure_devops')),
                host text NOT NULL CHECK (host <> '' AND host = lower(btrim(host))),
                owner text NOT NULL CHECK (owner <> '' AND owner = lower(btrim(owner))),
                name text NOT NULL CHECK (name <> '' AND name = lower(btrim(name))),
                default_branch text NULL,
                dbt_project_name text NULL CHECK (dbt_project_name <> '' AND dbt_project_name = lower(btrim(dbt_project_name))),
                credential_project_uuid uuid NULL REFERENCES projects(project_uuid) ON DELETE SET NULL,
                credential_source_uuid uuid NULL REFERENCES project_dbt_sources(project_dbt_source_uuid) ON DELETE SET NULL,
                created_by_project_uuid uuid NULL REFERENCES projects(project_uuid) ON DELETE SET NULL,
                is_shared boolean NOT NULL DEFAULT false,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                CHECK (credential_project_uuid IS NULL OR credential_source_uuid IS NULL),
                UNIQUE (organization_uuid, provider, host, owner, name)
            )
        `)
            .connection(connection);
        await inSequence(
            [
                'organization_uuid',
                'credential_project_uuid',
                'credential_source_uuid',
                'created_by_project_uuid',
            ],
            async (column) => {
                await ensureIndex(
                    knex,
                    connection,
                    `dbt_repositories_${column}_idx`,
                    `ON dbt_repositories (${column})`,
                );
            },
        );
        await knex
            .raw(`
            ALTER TABLE project_dbt_sources
                ADD COLUMN IF NOT EXISTS dbt_repository_uuid uuid NULL,
                ADD COLUMN IF NOT EXISTS dbt_project_name text NULL,
                ADD COLUMN IF NOT EXISTS dbt_project_name_conflict text NULL,
                ADD COLUMN IF NOT EXISTS membership_role text NOT NULL DEFAULT 'publish',
                ADD COLUMN IF NOT EXISTS refresh_policy text NOT NULL DEFAULT 'ci_managed',
                ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'extra',
                ADD COLUMN IF NOT EXISTS repository_fill_state text NOT NULL DEFAULT 'pending',
                ADD COLUMN IF NOT EXISTS repository_fill_attempted_at timestamptz NULL,
                ADD COLUMN IF NOT EXISTS dbt_project_name_initialized_at timestamptz NULL
        `)
            .connection(connection);
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_repository_fkey',
            'FOREIGN KEY (dbt_repository_uuid) REFERENCES dbt_repositories(dbt_repository_uuid) ON DELETE SET NULL',
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_peer_name_check',
            "CHECK (dbt_project_name IS NULL OR (dbt_project_name <> '' AND dbt_project_name = lower(btrim(dbt_project_name))))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_peer_conflict_check',
            "CHECK (dbt_project_name_conflict IS NULL OR (dbt_project_name_conflict <> '' AND dbt_project_name_conflict = lower(btrim(dbt_project_name_conflict))))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_membership_role_check',
            "CHECK (membership_role IN ('publish', 'dependency_only'))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_refresh_policy_check',
            "CHECK (refresh_policy IN ('git_refresh', 'ci_managed'))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_role_check',
            "CHECK (role IN ('main', 'extra'))",
        );
        await addConstraint(
            knex,
            connection,
            'project_dbt_sources_repository_fill_state_check',
            "CHECK (repository_fill_state IN ('pending', 'registered', 'not_git', 'cannot_decrypt', 'cannot_parse', 'failed'))",
        );
        await ensureIndex(
            knex,
            connection,
            'project_dbt_sources_dbt_repository_uuid_idx',
            'ON project_dbt_sources (dbt_repository_uuid)',
        );
        await ensureIndex(
            knex,
            connection,
            'project_dbt_sources_peer_name_connection_unique',
            "UNIQUE ON project_dbt_sources (project_uuid, lower(dbt_project_name), COALESCE(warehouse_connection_uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE dbt_project_name IS NOT NULL",
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await withSession(knex, async (connection) => {
        try {
            await knex.raw('BEGIN').connection(connection);
            await knex
                .raw('LOCK TABLE project_dbt_sources IN ACCESS EXCLUSIVE MODE')
                .connection(connection);
            const roleColumn = await knex
                .raw(`
                    SELECT 1 FROM pg_attribute
                    WHERE attrelid = 'project_dbt_sources'::regclass
                      AND attname = 'role' AND NOT attisdropped
                `)
                .connection(connection);
            const peers = await knex
                .raw(
                    `SELECT 1 FROM project_dbt_sources
                     WHERE dbt_connection IS NULL${roleColumn.rows.length ? " OR role = 'main'" : ''}
                     LIMIT 1`,
                )
                .connection(connection);
            if (peers.rows.length) {
                throw new Error(
                    'irreversible: remove consumer and main dbt source rows before rolling back repository peers',
                );
            }
            await knex
                .raw(`
                    ALTER TABLE project_dbt_sources
                        DROP COLUMN IF EXISTS dbt_repository_uuid,
                        DROP COLUMN IF EXISTS dbt_project_name,
                        DROP COLUMN IF EXISTS dbt_project_name_conflict,
                        DROP COLUMN IF EXISTS membership_role,
                        DROP COLUMN IF EXISTS refresh_policy,
                        DROP COLUMN IF EXISTS role,
                        DROP COLUMN IF EXISTS repository_fill_state,
                        DROP COLUMN IF EXISTS repository_fill_attempted_at,
                        DROP COLUMN IF EXISTS dbt_project_name_initialized_at
                `)
                .connection(connection);
            await knex
                .raw('DROP TABLE IF EXISTS dbt_repositories')
                .connection(connection);
            await knex.raw('COMMIT').connection(connection);
        } catch (error) {
            await knex.raw('ROLLBACK').connection(connection);
            throw error;
        }
    });
}
