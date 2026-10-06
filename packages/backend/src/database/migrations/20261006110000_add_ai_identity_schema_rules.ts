import { Knex } from 'knex';

export const classification: { kind: 'safe' | 'breaking'; reason: string } = {
    kind: 'safe',
    reason: 'Adds nullable schema rule and ungranted schema columns; older application versions keep writing the schemas column, which the model still reads when the rule is null.',
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('ai_identity_ai_roles', (table) => {
        table.jsonb('schema_rule').nullable();
    });
    await knex.raw(`UPDATE ai_identity_ai_roles SET schema_rule = CASE
        WHEN jsonb_array_length(schemas) = 0 THEN '{"mode":"existing_role"}'::jsonb
        ELSE jsonb_build_object('mode', 'list', 'schemas', schemas)
    END`);
    await knex.schema.alterTable('ai_identity_provisioners', (table) => {
        table.jsonb('ungranted_schemas').notNullable().defaultTo('[]');
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '5s'");
    await knex.schema.alterTable('ai_identity_provisioners', (table) => {
        table.dropColumn('ungranted_schemas');
    });
    await knex.schema.alterTable('ai_identity_ai_roles', (table) => {
        table.dropColumn('schema_rule');
    });
}
