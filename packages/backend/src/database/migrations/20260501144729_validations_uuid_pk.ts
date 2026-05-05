import { Knex } from 'knex';

const VALIDATIONS_TABLE = 'validations';
const PK_NAME = 'validations_pkey';
const LEGACY_INDEX_NAME = 'validations_validation_id_legacy_idx';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL statement_timeout = 0`);

    await knex.schema.alterTable(VALIDATIONS_TABLE, (table) => {
        table
            .uuid('validation_uuid')
            .notNullable()
            .defaultTo(knex.raw('uuid_generate_v4()'));
    });

    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT ??`, [
        VALIDATIONS_TABLE,
        PK_NAME,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN validation_id DROP IDENTITY IF EXISTS`,
        [VALIDATIONS_TABLE],
    );
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN validation_id DROP NOT NULL`, [
        VALIDATIONS_TABLE,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? PRIMARY KEY (validation_uuid)`,
        [VALIDATIONS_TABLE, PK_NAME],
    );

    await knex.raw(
        `CREATE UNIQUE INDEX ?? ON ?? (validation_id) WHERE validation_id IS NOT NULL`,
        [LEGACY_INDEX_NAME, VALIDATIONS_TABLE],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL statement_timeout = 0`);

    // Rows inserted after the up() migration have validation_id IS NULL.
    // Drop them so we can re-add NOT NULL and a fresh IDENTITY sequence.
    await knex(VALIDATIONS_TABLE).whereNull('validation_id').delete();

    await knex.raw(`DROP INDEX IF EXISTS ??`, [LEGACY_INDEX_NAME]);
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT ??`, [
        VALIDATIONS_TABLE,
        PK_NAME,
    ]);
    await knex.raw(`ALTER TABLE ?? ALTER COLUMN validation_id SET NOT NULL`, [
        VALIDATIONS_TABLE,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN validation_id ADD GENERATED ALWAYS AS IDENTITY`,
        [VALIDATIONS_TABLE],
    );
    // ADD GENERATED ALWAYS AS IDENTITY starts the sequence at 1 even when
    // the column already has values. Advance it past the current max so
    // subsequent inserts don't collide with existing rows.
    await knex.raw(
        `SELECT setval(
            pg_get_serial_sequence(?, 'validation_id'),
            COALESCE((SELECT MAX(validation_id) FROM ??), 0) + 1,
            false
        )`,
        [VALIDATIONS_TABLE, VALIDATIONS_TABLE],
    );
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? PRIMARY KEY (validation_id)`,
        [VALIDATIONS_TABLE, PK_NAME],
    );
    await knex.schema.alterTable(VALIDATIONS_TABLE, (table) => {
        table.dropColumn('validation_uuid');
    });
}
