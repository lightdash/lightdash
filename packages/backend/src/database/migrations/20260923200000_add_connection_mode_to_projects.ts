import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds projects.connection_mode with a constant default and a check added NOT VALID then validated, so older binaries keep inserting projects that default to single',
} as const;

export const config = { transaction: false };

const LOCK_TIMEOUT = '5s';
const CONNECTION_MODE_CHECK = 'projects_connection_mode_check';

const runDdl = async (
    knex: Knex,
    connection: unknown,
    message: string,
    sql: string,
): Promise<void> => {
    console.log(message);
    await knex
        .raw(`SET lock_timeout = '${LOCK_TIMEOUT}'`)
        .connection(connection);
    try {
        await knex.raw(sql).connection(connection);
    } finally {
        await knex.raw('RESET lock_timeout').connection(connection);
    }
};

const constraintExists = async (
    knex: Knex,
    connection: unknown,
    constraint: string,
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1 FROM pg_constraint WHERE conname = ? AND conrelid = 'projects'::regclass`,
            [constraint],
        )
        .connection(connection);
    return (result.rowCount ?? 0) > 0;
};

const connectionModeExists = async (
    knex: Knex,
    connection: unknown,
): Promise<boolean> => {
    const result = await knex
        .raw<{ rowCount: number }>(
            `SELECT 1 FROM pg_attribute
             WHERE attrelid = 'projects'::regclass
               AND attname = 'connection_mode'
               AND NOT attisdropped`,
        )
        .connection(connection);
    return (result.rowCount ?? 0) > 0;
};

const withSession = async (
    knex: Knex,
    migrate: (connection: unknown) => Promise<void>,
): Promise<void> => {
    const connection = await knex.client.acquireConnection();
    try {
        await knex.raw('SET statement_timeout = 0').connection(connection);
        await migrate(connection);
    } finally {
        try {
            await knex.raw('RESET statement_timeout').connection(connection);
        } finally {
            await knex.client.releaseConnection(connection);
        }
    }
};

export async function up(knex: Knex): Promise<void> {
    await withSession(knex, async (connection) => {
        await runDdl(
            knex,
            connection,
            'Adding projects.connection_mode',
            `ALTER TABLE projects ADD COLUMN IF NOT EXISTS connection_mode text NOT NULL DEFAULT 'single'`,
        );
        if (
            !(await constraintExists(knex, connection, CONNECTION_MODE_CHECK))
        ) {
            await runDdl(
                knex,
                connection,
                `Adding ${CONNECTION_MODE_CHECK}`,
                `ALTER TABLE projects ADD CONSTRAINT ${CONNECTION_MODE_CHECK} CHECK (connection_mode IN ('single', 'multi')) NOT VALID`,
            );
        }
        await runDdl(
            knex,
            connection,
            `Validating ${CONNECTION_MODE_CHECK}`,
            `ALTER TABLE projects VALIDATE CONSTRAINT ${CONNECTION_MODE_CHECK}`,
        );
    });
}

export async function down(knex: Knex): Promise<void> {
    await withSession(knex, async (connection) => {
        if (!(await connectionModeExists(knex, connection))) {
            return;
        }
        const multiProjects = await knex
            .raw<{ rowCount: number }>(
                `SELECT 1 FROM projects WHERE connection_mode = 'multi' LIMIT 1`,
            )
            .connection(connection);
        if ((multiProjects.rowCount ?? 0) > 0) {
            throw new Error(
                'irreversible: a project uses multiple warehouse connections, and dropping projects.connection_mode would lose that mode',
            );
        }
        await runDdl(
            knex,
            connection,
            'Dropping projects.connection_mode',
            `ALTER TABLE projects DROP COLUMN IF EXISTS connection_mode`,
        );
    });
}
