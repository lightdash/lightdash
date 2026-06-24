import { Knex } from 'knex';

const OrgMemberTable = 'organization_member_user_attributes';
const GroupTable = 'group_user_attributes';
const UserAttributesTable = 'user_attributes';

export async function up(knex: Knex): Promise<void> {
    // Widen the single-value columns to arrays, then rename to plurals so the
    // column names reflect that they now hold multiple values.
    await knex.raw(
        'ALTER TABLE ?? ALTER COLUMN value TYPE text[] USING ARRAY[value]',
        [OrgMemberTable],
    );
    await knex.raw(
        'ALTER TABLE ?? ALTER COLUMN value TYPE text[] USING ARRAY[value]',
        [GroupTable],
    );
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN attribute_default TYPE text[]
         USING (CASE WHEN attribute_default IS NULL THEN NULL ELSE ARRAY[attribute_default] END)`,
        [UserAttributesTable],
    );

    await knex.schema.alterTable(OrgMemberTable, (table) => {
        table.renameColumn('value', 'values');
    });
    await knex.schema.alterTable(GroupTable, (table) => {
        table.renameColumn('value', 'values');
    });
    await knex.schema.alterTable(UserAttributesTable, (table) => {
        table.renameColumn('attribute_default', 'attribute_defaults');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable(OrgMemberTable, (table) => {
        table.renameColumn('values', 'value');
    });
    await knex.schema.alterTable(GroupTable, (table) => {
        table.renameColumn('values', 'value');
    });
    await knex.schema.alterTable(UserAttributesTable, (table) => {
        table.renameColumn('attribute_defaults', 'attribute_default');
    });

    await knex.raw(
        'ALTER TABLE ?? ALTER COLUMN value TYPE text USING value[1]',
        [OrgMemberTable],
    );
    await knex.raw(
        'ALTER TABLE ?? ALTER COLUMN value TYPE text USING value[1]',
        [GroupTable],
    );
    await knex.raw(
        `ALTER TABLE ?? ALTER COLUMN attribute_default TYPE text
         USING (CASE WHEN attribute_default IS NULL THEN NULL ELSE attribute_default[1] END)`,
        [UserAttributesTable],
    );
}
