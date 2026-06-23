import { Knex } from 'knex';

const AI_PROMPT_CONTEXT_TABLE_NAME = 'ai_prompt_context';
const OLD_UNIQUE = 'ai_prompt_context_prompt_entity_unique';
const NEW_UNIQUE = 'ai_prompt_context_prompt_entity_ref_unique';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(AI_PROMPT_CONTEXT_TABLE_NAME)) {
        if (
            !(await knex.schema.hasColumn(
                AI_PROMPT_CONTEXT_TABLE_NAME,
                'entity_ref',
            ))
        ) {
            await knex.schema.alterTable(
                AI_PROMPT_CONTEXT_TABLE_NAME,
                (table) => {
                    table
                        .text('entity_ref')
                        .nullable()
                        .comment(
                            'Natural-key reference for entities without a uuid (file path, repository owner/repo).',
                        );
                    table.uuid('entity_uuid').nullable().alter();
                },
            );
        }

        // The original unique constraint keys on entity_uuid, which is null for
        // file/repository rows. Replace it with a functional unique index that
        // dedupes on the natural key for every entity type.
        await knex.schema.alterTable(AI_PROMPT_CONTEXT_TABLE_NAME, (table) => {
            table.dropUnique(
                ['ai_prompt_uuid', 'entity_type', 'entity_uuid'],
                OLD_UNIQUE,
            );
        });
        await knex.raw(
            `CREATE UNIQUE INDEX ?? ON ?? (ai_prompt_uuid, entity_type, COALESCE(entity_uuid::text, entity_ref))`,
            [NEW_UNIQUE, AI_PROMPT_CONTEXT_TABLE_NAME],
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(AI_PROMPT_CONTEXT_TABLE_NAME)) {
        await knex.raw(`DROP INDEX IF EXISTS ??`, [NEW_UNIQUE]);
        // Rows without a uuid (file/repository) cannot satisfy the restored
        // NOT NULL constraint, so drop them before reverting.
        await knex(AI_PROMPT_CONTEXT_TABLE_NAME)
            .whereNull('entity_uuid')
            .delete();
        await knex.schema.alterTable(AI_PROMPT_CONTEXT_TABLE_NAME, (table) => {
            table.uuid('entity_uuid').notNullable().alter();
            table.dropColumn('entity_ref');
            table.unique(['ai_prompt_uuid', 'entity_type', 'entity_uuid'], {
                indexName: OLD_UNIQUE,
            });
        });
    }
}
