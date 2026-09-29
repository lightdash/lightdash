import { type Knex } from 'knex';

export const classification = {
    kind: 'safe',
    reason: 'Drops NOT NULL on sandbox_registry.project_uuid, a metadata-only change that keeps every existing write valid',
} as const;

const SandboxRegistryTableName = 'sandbox_registry';

// Organization chart types build in a sandbox without an owning project.
export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw("SET LOCAL lock_timeout = '5s'");
        await trx.raw(
            `ALTER TABLE ${SandboxRegistryTableName} ALTER COLUMN project_uuid DROP NOT NULL`,
        );
    });
}

export async function down(): Promise<void> {
    throw new Error(
        'irreversible: organization chart type sandboxes have no project',
    );
}
