import { Knex } from 'knex';

export const ScimOrganizationAccessTokenTableName =
    'scim_organization_access_tokens';

export async function up(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ScimOrganizationAccessTokenTableName)) {
        await knex.schema.table(
            ScimOrganizationAccessTokenTableName,
            (table) => {
                table.timestamp('rotated_at', { useTz: false }).nullable();
                table
                    .uuid('rotated_by_user_uuid')
                    .nullable()
                    .references('user_uuid')
                    .inTable('users')
                    .onDelete('SET NULL');
                table.timestamp('last_used_at', { useTz: false }).nullable();
            },
        );
    }
}

export async function down(knex: Knex): Promise<void> {
    if (await knex.schema.hasTable(ScimOrganizationAccessTokenTableName)) {
        await knex.schema.table(
            ScimOrganizationAccessTokenTableName,
            (table) => {
                table.dropColumn('rotated_at');
                table.dropColumn('rotated_by_user_uuid');
                table.dropColumn('last_used_at');
            },
        );
    }
}
