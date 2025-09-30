import { Knex } from 'knex';

const ChangesTableName = 'changes';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ChangesTableName)) {
        if (
            await knex.schema.hasColumn(ChangesTableName, 'source_prompt_uuid')
        ) {
            // Check if foreign key constraint exists
            const constraintExists = await knex.raw(
                `
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints
                    WHERE constraint_name = ?
                    AND table_name = ?
                    AND constraint_type = 'FOREIGN KEY'
                )
            `,
                ['changes_source_prompt_uuid_foreign', ChangesTableName],
            );

            // eslint-disable-next-line prefer-destructuring
            const exists = constraintExists.rows[0].exists;

            if (exists) {
                await knex.schema.alterTable(ChangesTableName, (table) => {
                    table.dropForeign(
                        ['source_prompt_uuid'],
                        'changes_source_prompt_uuid_foreign',
                    );
                });
            }
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    // do nothing
}
