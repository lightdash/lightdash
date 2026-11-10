import type { Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Adds nullable organization and creation time columns plus an organization index to ssh_key_pairs; older binaries insert and read rows without these columns',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    // created_at gets its default after the column exists, so rows created
    // before this migration keep a NULL creation time.
    await knex.raw(`
        ALTER TABLE ssh_key_pairs
            ADD COLUMN IF NOT EXISTS organization_uuid uuid NULL
                REFERENCES organizations (organization_uuid) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS created_at timestamptz NULL
    `);
    await knex.raw(`
        ALTER TABLE ssh_key_pairs
            ALTER COLUMN created_at SET DEFAULT now()
    `);
    await knex.raw(`
        CREATE INDEX IF NOT EXISTS ssh_key_pairs_organization_uuid_idx
        ON ssh_key_pairs (organization_uuid)
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET LOCAL lock_timeout = '5s'`);
    await knex.raw(`DROP INDEX IF EXISTS ssh_key_pairs_organization_uuid_idx`);
    await knex.raw(`
        ALTER TABLE ssh_key_pairs
            DROP COLUMN IF EXISTS created_at,
            DROP COLUMN IF EXISTS organization_uuid
    `);
}
