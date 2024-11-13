import { Knex } from 'knex';

const GroupsTableName = 'groups';

export async function up(knex: Knex): Promise<void> {
    // Ensure no duplicate names for organization_id by appending suffixes
    const duplicates = await knex(GroupsTableName)
        .select('name', 'organization_id')
        .count('* as duplicate_count')
        .groupBy('name', 'organization_id')
        .having(knex.raw('count(*) > ?', [1]));

    for (const duplicate of duplicates) {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const { name, organization_id } = duplicate;

        // Get all rows with this name and organization_id to rename them
        // eslint-disable-next-line no-await-in-loop
        const rows = await knex(GroupsTableName)
            .select('group_uuid')
            .where({ name, organization_id })
            .orderBy('created_at', 'asc');

        // Rename duplicates with suffixes
        // eslint-disable-next-line no-plusplus
        for (let i = 1; i < rows.length; i++) {
            // eslint-disable-next-line no-await-in-loop
            await knex(GroupsTableName)
                .where({ group_uuid: rows[i].group_uuid })
                // @ts-ignore Ignore typing error since we didn't have updated_at column at this point
                .update({ name: `${name} ${i + 1}` });
        }
    }

    // Add the unique constraint on name and organization_id
    await knex.schema.alterTable(GroupsTableName, (table) => {
        table.unique(['name', 'organization_id']);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(GroupsTableName, (table) => {
        table.dropUnique(['name', 'organization_id']);
    });
}
