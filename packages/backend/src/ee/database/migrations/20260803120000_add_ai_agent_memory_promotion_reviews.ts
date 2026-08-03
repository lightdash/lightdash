import { Knex } from 'knex';

const reviewItemTable = 'ai_agent_review_item';
const memoryTable = 'ai_agent_memory';
const sourceConstraint = 'ai_agent_review_item_source_check';
const stagedSourceConstraint = 'ai_agent_review_item_source_check_staged';
const memoryForeignKey =
    'ai_agent_review_item_source_ai_agent_memory_uuid_foreign';
const memoryIndex = 'ai_agent_review_item_source_ai_agent_memory_uuid_index';

export const config = { transaction: false };

const getConstraintDefinition = async (
    knex: Knex,
    name: string,
): Promise<string | null> => {
    const result = await knex.raw<{ rows: Array<{ definition: string }> }>(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid = '${reviewItemTable}'::regclass AND conname = ?`,
        [name],
    );
    return result.rows[0]?.definition ?? null;
};

const replaceSourceConstraint = async (
    knex: Knex,
    includePromotion: boolean,
): Promise<void> => {
    const desiredValues = includePromotion
        ? "'ai_finding', 'manual', 'memory_promotion'"
        : "'ai_finding', 'manual'";
    const current = await getConstraintDefinition(knex, sourceConstraint);
    if (
        current !== null &&
        current.includes("'memory_promotion'::text") === includePromotion
    ) {
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            DROP CONSTRAINT IF EXISTS ${stagedSourceConstraint}
        `);
        return;
    }

    const staged = await getConstraintDefinition(knex, stagedSourceConstraint);
    if (
        staged !== null &&
        staged.includes("'memory_promotion'::text") !== includePromotion
    ) {
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            DROP CONSTRAINT ${stagedSourceConstraint}
        `);
    }
    if (
        (await getConstraintDefinition(knex, stagedSourceConstraint)) === null
    ) {
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            ADD CONSTRAINT ${stagedSourceConstraint}
            CHECK (source IN (${desiredValues})) NOT VALID
        `);
    }

    console.log(`Validating ${stagedSourceConstraint}`);
    await knex.raw(`
        ALTER TABLE ${reviewItemTable}
        VALIDATE CONSTRAINT ${stagedSourceConstraint}
    `);
    await knex.raw(`
        ALTER TABLE ${reviewItemTable}
        DROP CONSTRAINT IF EXISTS ${sourceConstraint}
    `);
    await knex.raw(`
        ALTER TABLE ${reviewItemTable}
        RENAME CONSTRAINT ${stagedSourceConstraint} TO ${sourceConstraint}
    `);
};

const createMemoryIndex = async (knex: Knex): Promise<void> => {
    const result = await knex.raw<{ rows: Array<{ is_valid: boolean }> }>(`
        SELECT index.indisvalid AS is_valid
        FROM pg_index AS index
        JOIN pg_class AS relation ON relation.oid = index.indexrelid
        WHERE relation.relname = '${memoryIndex}'
    `);
    if (result.rows[0]?.is_valid === false) {
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${memoryIndex}`);
    }
    console.log(`Creating ${memoryIndex}`);
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${memoryIndex}
        ON ${reviewItemTable} (source_ai_agent_memory_uuid)
    `);
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await replaceSourceConstraint(knex, true);
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            ADD COLUMN IF NOT EXISTS source_ai_agent_memory_uuid uuid,
            ADD COLUMN IF NOT EXISTS project_context_entry jsonb
        `);
        await createMemoryIndex(knex);
        if ((await getConstraintDefinition(knex, memoryForeignKey)) === null) {
            await knex.raw(`
                ALTER TABLE ${reviewItemTable}
                ADD CONSTRAINT ${memoryForeignKey}
                FOREIGN KEY (source_ai_agent_memory_uuid)
                REFERENCES ${memoryTable} (ai_agent_memory_uuid)
                ON DELETE CASCADE NOT VALID
            `);
        }
        console.log(`Validating ${memoryForeignKey}`);
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            VALIDATE CONSTRAINT ${memoryForeignKey}
        `);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('SET statement_timeout = 0');
    try {
        await knex(reviewItemTable)
            .where('source', 'memory_promotion')
            .delete();
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            DROP CONSTRAINT IF EXISTS ${memoryForeignKey}
        `);
        await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${memoryIndex}`);
        await knex.raw(`
            ALTER TABLE ${reviewItemTable}
            DROP COLUMN IF EXISTS project_context_entry,
            DROP COLUMN IF EXISTS source_ai_agent_memory_uuid
        `);
        await replaceSourceConstraint(knex, false);
    } finally {
        await knex.raw('RESET statement_timeout');
    }
}
