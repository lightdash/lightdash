import { SupportedDbtVersions } from '@lightdash/common';
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (t) => {
        t.string('dbt_version')
            .notNullable()
            .defaultTo(SupportedDbtVersions.V1_4);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('projects', (t) => {
        t.dropColumns('dbt_version');
    });
}
