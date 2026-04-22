import { type Knex } from 'knex';

export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.text('status_message');
        table.timestamp('status_updated_at', { useTz: false });
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.dropColumn('status_updated_at');
        table.dropColumn('status_message');
    });
};
