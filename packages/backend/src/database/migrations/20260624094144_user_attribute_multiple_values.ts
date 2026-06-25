import { Knex } from 'knex';

const OrgMemberTable = 'organization_member_user_attributes';
const GroupTable = 'group_user_attributes';
const UserAttributesTable = 'user_attributes';

// Additive (expand) migration: add array columns alongside the existing scalar
// columns and backfill them, so old code that still reads/writes `value` /
// `attribute_default` keeps working during a rolling deploy. The scalar columns
// are dropped in a later migration once all code uses the array columns.
export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrgMemberTable, (table) => {
        table.specificType('values', 'text[]').nullable();
    });
    await knex.raw(
        'UPDATE ?? SET "values" = ARRAY[value] WHERE value IS NOT NULL',
        [OrgMemberTable],
    );

    await knex.schema.alterTable(GroupTable, (table) => {
        table.specificType('values', 'text[]').nullable();
    });
    await knex.raw(
        'UPDATE ?? SET "values" = ARRAY[value] WHERE value IS NOT NULL',
        [GroupTable],
    );

    await knex.schema.alterTable(UserAttributesTable, (table) => {
        table.specificType('attribute_defaults', 'text[]').nullable();
    });
    await knex.raw(
        'UPDATE ?? SET attribute_defaults = ARRAY[attribute_default] WHERE attribute_default IS NOT NULL',
        [UserAttributesTable],
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrgMemberTable, (table) => {
        table.dropColumn('values');
    });
    await knex.schema.alterTable(GroupTable, (table) => {
        table.dropColumn('values');
    });
    await knex.schema.alterTable(UserAttributesTable, (table) => {
        table.dropColumn('attribute_defaults');
    });
}
