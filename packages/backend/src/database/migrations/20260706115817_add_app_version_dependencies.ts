import { type Knex } from 'knex';

// Declared-dependency summary for the version's build:
// { custom: [{ name, version }], lockfileHash }. Null = template dependency set.
export const up = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.jsonb('dependencies').nullable();
    });
};

export const down = async (knex: Knex): Promise<void> => {
    await knex.schema.alterTable('app_versions', (table) => {
        table.dropColumn('dependencies');
    });
};
