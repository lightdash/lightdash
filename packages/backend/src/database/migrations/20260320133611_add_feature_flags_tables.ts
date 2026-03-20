import { Knex } from 'knex';

const FEATURE_FLAGS_TABLE = 'feature_flags';
const FEATURE_FLAG_OVERRIDES_TABLE = 'feature_flag_overrides';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable(FEATURE_FLAGS_TABLE, (table) => {
        table.string('flag_id').primary();
        table.boolean('default_enabled').notNullable().defaultTo(false);
        table.timestamps(true, true);
    });

    await knex.schema.createTable(FEATURE_FLAG_OVERRIDES_TABLE, (table) => {
        table.increments('feature_flag_override_id').primary();
        table
            .string('flag_id')
            .notNullable()
            .references('flag_id')
            .inTable(FEATURE_FLAGS_TABLE)
            .onDelete('CASCADE');
        table.uuid('user_uuid').nullable();
        table.uuid('organization_uuid').nullable();
        table.boolean('enabled').notNullable();
        table.timestamps(true, true);
    });

    // Ensure at least one targeting field is set
    await knex.raw(`
        ALTER TABLE ${FEATURE_FLAG_OVERRIDES_TABLE}
        ADD CONSTRAINT feature_flag_overrides_target_check
        CHECK (user_uuid IS NOT NULL OR organization_uuid IS NOT NULL)
    `);

    // Unique constraint: one override per flag per user
    await knex.raw(`
        CREATE UNIQUE INDEX feature_flag_overrides_user_unique
        ON ${FEATURE_FLAG_OVERRIDES_TABLE} (flag_id, user_uuid)
        WHERE user_uuid IS NOT NULL
    `);

    // Unique constraint: one override per flag per org
    await knex.raw(`
        CREATE UNIQUE INDEX feature_flag_overrides_org_unique
        ON ${FEATURE_FLAG_OVERRIDES_TABLE} (flag_id, organization_uuid)
        WHERE organization_uuid IS NOT NULL AND user_uuid IS NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(FEATURE_FLAG_OVERRIDES_TABLE);
    await knex.schema.dropTableIfExists(FEATURE_FLAGS_TABLE);
}
