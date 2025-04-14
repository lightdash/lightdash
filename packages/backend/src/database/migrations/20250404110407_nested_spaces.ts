import { Knex } from 'knex';

const SpacesTableName = 'spaces';

export async function up(knex: Knex): Promise<void> {
    // Install native Postgres extension ltree
    await knex.raw('CREATE EXTENSION IF NOT EXISTS ltree');

    await knex.schema.alterTable(SpacesTableName, (table) => {
        table.uuid('parent_space_uuid').nullable();
        // Enables much faster queries for finding all descendants or ancestors
        // Examples: https://www.postgresql.org/docs/current/ltree.html#LTREE-EXAMPLE
        table.specificType('path', 'ltree').notNullable().defaultTo('');

        table
            .foreign('parent_space_uuid')
            .references('space_uuid')
            .inTable(SpacesTableName)
            .onDelete('CASCADE');
    });

    // Reference: https://www.postgresql.org/docs/current/ltree.html#LTREE-INDEXES
    await knex.raw(
        `CREATE INDEX spaces_path_idx ON ${SpacesTableName} USING gist (path)`, // Gist is a GiST index for path, which is a path in a tree
    );
    await knex.raw(
        `CREATE INDEX spaces_parent_space_uuid_index ON ${SpacesTableName} USING btree (parent_space_uuid)`, // Btree is a B-tree index for parent_space_uuid, which is a UUID
    );

    // Converts slugs to ltree paths (e.g. '-parent-space4' -> '_parent_space4') so that all root spaces have paths
    // Uses text2ltree to cast the slug to a ltree path (reference: https://www.postgresql.org/docs/current/ltree.html#LTREE-OPS-FUNCS)
    await knex
        .update({
            path: knex.raw(`text2ltree(replace(slug, '-', '_'))`),
        })
        .from(SpacesTableName)
        .where('path', '=', '');
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(SpacesTableName, (table) => {
        table.dropIndex('path', 'spaces_path_idx');
        table.dropIndex('parent_space_uuid', 'spaces_parent_space_uuid_index');
    });

    await knex.schema.alterTable(SpacesTableName, (table) => {
        table.dropForeign(['parent_space_uuid']);
        table.dropColumn('parent_space_uuid');
        table.dropColumn('path');
    });
}
