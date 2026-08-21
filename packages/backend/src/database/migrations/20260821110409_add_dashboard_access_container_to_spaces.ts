import { Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Adds a nullable internal relation without changing existing rows',
} as const;

const SpacesTableName = 'spaces';
const DashboardsTableName = 'dashboards';
const AccessContainerColumnName = 'is_access_container';
const DashboardColumnName = 'access_container_dashboard_uuid';
const ForeignKeyName = 'spaces_access_container_dashboard_uuid_foreign';
const UniqueIndexName = 'spaces_access_container_dashboard_uuid_unique';
const VisibleSpacesIndexName = 'spaces_customer_visible_project_id_index';
const ShapeCheckName = 'spaces_access_container_shape_check';
const LockTimeout = '5s';

const getRowCount = (result: { rowCount?: number }): number =>
    result.rowCount ?? 0;

async function addColumnsAndConstraints(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${SpacesTableName}
        ADD COLUMN IF NOT EXISTS ${AccessContainerColumnName} boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS ${DashboardColumnName} uuid
    `);

    const foreignKey = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_constraint
         WHERE conname = ? AND conrelid = ?::regclass`,
        [ForeignKeyName, SpacesTableName],
    );
    if (getRowCount(foreignKey) === 0) {
        await knex.raw(`
            ALTER TABLE ${SpacesTableName}
            ADD CONSTRAINT ${ForeignKeyName}
            FOREIGN KEY (${DashboardColumnName})
            REFERENCES ${DashboardsTableName}(dashboard_uuid)
            ON DELETE CASCADE
            NOT VALID
        `);
    }

    const shapeCheck = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_constraint
         WHERE conname = ? AND conrelid = ?::regclass`,
        [ShapeCheckName, SpacesTableName],
    );
    if (getRowCount(shapeCheck) === 0) {
        await knex.raw(`
            ALTER TABLE ${SpacesTableName}
            ADD CONSTRAINT ${ShapeCheckName}
            CHECK (
                (
                    ${AccessContainerColumnName}
                    AND ${DashboardColumnName} IS NOT NULL
                    AND parent_space_uuid IS NULL
                    AND inherit_parent_permissions IS FALSE
                    AND is_default_user_space IS FALSE
                ) OR (
                    NOT ${AccessContainerColumnName}
                    AND ${DashboardColumnName} IS NULL
                )
            ) NOT VALID
        `);
    }
}

async function createUniqueIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ? AND NOT pg_index.indisvalid`,
        [UniqueIndexName],
    );
    if (getRowCount(invalidIndex) > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY ${UniqueIndexName}`);
    }

    await knex.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${UniqueIndexName}
        ON ${SpacesTableName} (${DashboardColumnName})
        WHERE ${DashboardColumnName} IS NOT NULL
    `);
}

async function createVisibleSpacesIndex(knex: Knex): Promise<void> {
    const invalidIndex = await knex.raw<{ rowCount: number }>(
        `SELECT 1
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ? AND NOT pg_index.indisvalid`,
        [VisibleSpacesIndexName],
    );
    if (getRowCount(invalidIndex) > 0) {
        await knex.raw(`DROP INDEX CONCURRENTLY ${VisibleSpacesIndexName}`);
    }

    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${VisibleSpacesIndexName}
        ON ${SpacesTableName} (project_id)
        WHERE deleted_at IS NULL AND ${AccessContainerColumnName} = FALSE
    `);
}

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '${LockTimeout}'`);
    await knex.raw('SET statement_timeout = 0');
    try {
        await addColumnsAndConstraints(knex);
        await createUniqueIndex(knex);
        await createVisibleSpacesIndex(knex);
        await knex.raw(`
            ALTER TABLE ${SpacesTableName}
            VALIDATE CONSTRAINT ${ForeignKeyName}
        `);
        await knex.raw(`
            ALTER TABLE ${SpacesTableName}
            VALIDATE CONSTRAINT ${ShapeCheckName}
        `);
    } finally {
        await knex.raw('RESET statement_timeout');
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '${LockTimeout}'`);
    try {
        await knex.raw(`
            ALTER TABLE ${SpacesTableName}
            DROP CONSTRAINT IF EXISTS ${ShapeCheckName},
            DROP CONSTRAINT IF EXISTS ${UniqueIndexName}
        `);
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${UniqueIndexName}`);
        await knex.raw(
            `DROP INDEX CONCURRENTLY IF EXISTS ${VisibleSpacesIndexName}`,
        );
        await knex.raw(`
            ALTER TABLE ${SpacesTableName}
            DROP CONSTRAINT IF EXISTS ${ForeignKeyName},
            DROP COLUMN IF EXISTS ${DashboardColumnName},
            DROP COLUMN IF EXISTS ${AccessContainerColumnName}
        `);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
