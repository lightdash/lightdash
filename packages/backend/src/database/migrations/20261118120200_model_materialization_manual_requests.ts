import { type Knex } from 'knex';

const generations = 'model_materialization_generations';

export const classification = {
    kind: 'safe',
    reason: 'Adds an optional request identifier and accepts manual refresh attempts alongside publish attempts',
} as const;

export async function up(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex.schema.alterTable(generations, (table) => {
        table.uuid('manual_request_uuid').nullable().index();
    });
    await knex.raw(`ALTER TABLE model_materialization_generations
        DROP CONSTRAINT model_materialization_generations_trigger_check,
        ADD CONSTRAINT model_materialization_generations_trigger_check CHECK (trigger IN ('publish','manual'))`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw("SET LOCAL lock_timeout = '60s'");
    await knex(generations)
        .where({ trigger: 'manual' })
        .update({ trigger: 'publish' });
    await knex.raw(`ALTER TABLE model_materialization_generations
        DROP CONSTRAINT model_materialization_generations_trigger_check,
        ADD CONSTRAINT model_materialization_generations_trigger_check CHECK (trigger = 'publish')`);
    await knex.schema.alterTable(generations, (table) =>
        table.dropColumn('manual_request_uuid'),
    );
}
