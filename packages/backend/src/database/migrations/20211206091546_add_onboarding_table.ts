import { Knex } from 'knex';

const ONBOARDING_TABLE_NAME = 'onboarding';

export async function up(knex: Knex): Promise<void> {
    if (!(await knex.schema.hasTable(ONBOARDING_TABLE_NAME))) {
        await knex.schema.createTable(ONBOARDING_TABLE_NAME, (table) => {
            table.specificType(
                'onboarding_id',
                `integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY`,
            );
            table
                .integer('organization_id')
                .notNullable()
                .references('organization_id')
                .inTable('organizations')
                .onDelete('CASCADE');
            table.timestamp('ranQuery_at', { useTz: false }).nullable();
            table.timestamp('shownSuccess_at', { useTz: false }).nullable();
        });

        const orgs = await knex('organizations')
            .select(['organization_id'])
            .limit(1);

        if (orgs.length > 0) {
            await knex(ONBOARDING_TABLE_NAME).insert({
                organization_id: orgs[0].organization_id,
                ranQuery_at: new Date(),
                shownSuccess_at: null,
            });
        }
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(ONBOARDING_TABLE_NAME);
}
