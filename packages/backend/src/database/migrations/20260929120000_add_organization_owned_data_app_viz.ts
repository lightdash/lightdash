import { type Knex } from 'knex';

export const config = { transaction: false };

export const classification = {
    kind: 'safe',
    reason: 'Expands app ownership for organization chart types while existing project app writes remain valid',
} as const;

const OwnerCheck = 'apps_exactly_one_owner_check';
const OwnerForeignKey = 'apps_owner_organization_uuid_foreign';
const OwnerIndex = 'apps_owner_organization_uuid_idx';
const OrganizationSlugIndex = 'apps_owner_organization_slug_unique';
const OrganizationNameIndex = 'apps_owner_organization_name_unique';

const hasConstraint = async (knex: Knex, name: string): Promise<boolean> => {
    const result = await knex.raw<{ rows: Array<{ exists: boolean }> }>(
        `SELECT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'apps'::regclass AND conname = ?
        ) AS exists`,
        [name],
    );
    return result.rows[0].exists;
};

const dropInvalidIndex = async (knex: Knex, name: string): Promise<void> => {
    const result = await knex.raw<{ rows: Array<{ invalid: boolean }> }>(
        `SELECT NOT pg_index.indisvalid AS invalid
         FROM pg_class
         JOIN pg_index ON pg_index.indexrelid = pg_class.oid
         WHERE pg_class.relname = ?
           AND pg_index.indrelid = 'apps'::regclass`,
        [name],
    );
    if (result.rows[0]?.invalid) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${name}`);
    }
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex.transaction(async (trx) => {
            await trx.raw("SET LOCAL lock_timeout = '5s'");
            await trx.raw(`
                ALTER TABLE apps
                ADD COLUMN IF NOT EXISTS owner_organization_uuid uuid
            `);
            if (!(await hasConstraint(trx, OwnerForeignKey))) {
                await trx.raw(`
                    ALTER TABLE apps
                    ADD CONSTRAINT ${OwnerForeignKey}
                    FOREIGN KEY (owner_organization_uuid)
                    REFERENCES organizations(organization_uuid)
                    ON DELETE CASCADE NOT VALID
                `);
            }
            if (!(await hasConstraint(trx, OwnerCheck))) {
                await trx.raw(`
                    ALTER TABLE apps
                    ADD CONSTRAINT ${OwnerCheck}
                    CHECK (
                        (project_uuid IS NOT NULL AND owner_organization_uuid IS NULL)
                        OR
                        (project_uuid IS NULL AND owner_organization_uuid IS NOT NULL
                         AND template IS NOT DISTINCT FROM 'data_app_viz'
                         AND space_uuid IS NULL)
                    ) NOT VALID
                `);
            }
            await trx.raw(
                `ALTER TABLE apps ALTER COLUMN project_uuid DROP NOT NULL`,
            );
        });

        // eslint-disable-next-line no-console
        console.log('Validating organization-owned app constraints');
        await knex.transaction(async (trx) => {
            await trx.raw("SET LOCAL lock_timeout = '5s'");
            await trx.raw(
                `ALTER TABLE apps VALIDATE CONSTRAINT ${OwnerForeignKey}`,
            );
            await trx.raw(`ALTER TABLE apps VALIDATE CONSTRAINT ${OwnerCheck}`);
        });

        for (const index of [
            OwnerIndex,
            OrganizationSlugIndex,
            OrganizationNameIndex,
        ]) {
            // eslint-disable-next-line no-await-in-loop
            await dropInvalidIndex(knex, index);
        }
        // eslint-disable-next-line no-console
        console.log('Indexing organization-owned app lookup and conflicts');
        await knex.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS ${OwnerIndex}
            ON apps (owner_organization_uuid)
            WHERE owner_organization_uuid IS NOT NULL
        `);
        await knex.raw(`
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${OrganizationSlugIndex}
            ON apps (owner_organization_uuid, slug)
            WHERE owner_organization_uuid IS NOT NULL
        `);
        await knex.raw(`
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${OrganizationNameIndex}
            ON apps (owner_organization_uuid, lower(name))
            WHERE owner_organization_uuid IS NOT NULL AND name <> '' AND deleted_at IS NULL
        `);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(): Promise<void> {
    throw new Error('irreversible: organization chart types would lose owner');
}
