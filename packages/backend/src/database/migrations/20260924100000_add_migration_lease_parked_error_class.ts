import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'adds one nullable column with an inline check to the singleton migration_lease row using idempotent additive DDL; older runners ignore the column',
} as const;

export const MIGRATION_PARK_CLASS_SCHEMA_SQL = `
ALTER TABLE migration_lease
    ADD COLUMN IF NOT EXISTS parked_error_class text
        CONSTRAINT migration_lease_parked_error_class_check
        CHECK (parked_error_class IN ('transient', 'deterministic'));
`;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(MIGRATION_PARK_CLASS_SCHEMA_SQL);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.raw(
        'ALTER TABLE migration_lease DROP COLUMN IF EXISTS parked_error_class',
    );
}
