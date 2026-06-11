import { Knex } from 'knex';

const TURN_SIGNAL_TABLE = 'ai_agent_review_turn_signal';
const CHECK_CONSTRAINT = `${TURN_SIGNAL_TABLE}_primary_root_cause_check`;

const ROOT_CAUSES_WITHOUT_DATA_GAP = [
    'semantic_layer',
    'project_context',
    'agent_configuration',
    'product_capability',
    'runtime_reliability',
    'feedback_quality',
    'not_a_failure',
    'ambiguous',
];

const ROOT_CAUSES_WITH_DATA_GAP = [
    'semantic_layer',
    'project_context',
    'agent_configuration',
    'data_gap',
    'product_capability',
    'runtime_reliability',
    'feedback_quality',
    'not_a_failure',
    'ambiguous',
];

const setCheckConstraint = async (knex: Knex, allowed: string[]) => {
    const list = allowed.map((value) => `'${value}'`).join(', ');
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        TURN_SIGNAL_TABLE,
        CHECK_CONSTRAINT,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (primary_root_cause = ANY (ARRAY[${list}]::text[]))`,
        [TURN_SIGNAL_TABLE, CHECK_CONSTRAINT],
    );
};

export async function up(knex: Knex): Promise<void> {
    // Relabel data_gap primary findings as semantic_layer — the durable fix lives
    // in the semantic layer and the writeback agent decides whether to expose the
    // data or report that upstream modeling is needed.
    await knex.raw(
        `UPDATE ?? SET primary_root_cause = ? WHERE primary_root_cause = ?`,
        [TURN_SIGNAL_TABLE, 'semantic_layer', 'data_gap'],
    );

    // Collapse data_gap out of secondary_root_causes arrays, de-duplicating.
    await knex.raw(
        `
        UPDATE ??
        SET secondary_root_causes = (
            SELECT jsonb_agg(DISTINCT cause)
            FROM jsonb_array_elements_text(secondary_root_causes) AS elem(value),
            LATERAL (
                SELECT CASE WHEN elem.value = 'data_gap'
                            THEN 'semantic_layer' ELSE elem.value END
            ) AS mapped(cause)
        )
        WHERE secondary_root_causes IS NOT NULL
          AND secondary_root_causes @> '["data_gap"]'::jsonb
    `,
        [TURN_SIGNAL_TABLE],
    );

    await setCheckConstraint(knex, ROOT_CAUSES_WITHOUT_DATA_GAP);
}

export async function down(knex: Knex): Promise<void> {
    // Restore the constraint so data_gap is an allowed value again. The relabeled
    // rows are not restored — the original data_gap classification is not recoverable.
    await setCheckConstraint(knex, ROOT_CAUSES_WITH_DATA_GAP);
}
