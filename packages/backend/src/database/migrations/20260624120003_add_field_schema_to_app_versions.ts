import { type Knex } from 'knex';

// A data app viz declares a typed schema (its data-binding fields + config
// options). Stored per-version so each generated version carries its own.
export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.jsonb('viz_schema').nullable();
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.dropColumn('viz_schema');
    });
};
