import { Knex } from 'knex';

const tableName = 'spaces';

export async function up(knex: Knex): Promise<void> {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS ltree');

    await knex.schema.alterTable(tableName, (table) => {
        // Easier to find a space's immediate parent
        table.uuid('parent_space_uuid').nullable();
        // Enables much faster queries for finding all descendants or ancestors
        // Like:
        // SELECT * FROM spaces WHERE path @> '123'; - This will return all spaces that are descendants of space 123
        // SELECT * FROM spaces WHERE path <@ '123'; - This will return all spaces that are ancestors of space 123
        table.specificType('path', 'ltree').nullable();

        table
            .foreign('parent_space_uuid')
            .references('space_uuid')
            .inTable(tableName)
            .onDelete('CASCADE');
    });

    await knex.raw(
        `CREATE INDEX spaces_path_idx ON ${tableName} USING gist (path)`, // Gist is a GiST index for path, which is a path in a tree
    );
    await knex.raw(
        `CREATE INDEX spaces_parent_space_uuid_index ON ${tableName} USING btree (parent_space_uuid)`, // Btree is a B-tree index for parent_space_uuid, which is a UUID
    );

    // Update path for existing spaces (root spaces have their own UUID as path)
    await knex.raw(`
        UPDATE ${tableName}
        SET path = text2ltree(replace(space_uuid::text, '-', '_'))
        WHERE path IS NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(tableName, (table) => {
        table.dropIndex('path', 'spaces_path_idx');
        table.dropIndex('parent_space_uuid', 'spaces_parent_space_uuid_index');
    });

    await knex.schema.alterTable(tableName, (table) => {
        table.dropForeign(['parent_space_uuid']);
        table.dropColumn('parent_space_uuid');
        table.dropColumn('path');
    });
}
