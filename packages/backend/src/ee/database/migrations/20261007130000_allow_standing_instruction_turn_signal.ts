import { Knex } from 'knex';

const TURN_SIGNAL_TABLE = 'ai_agent_review_turn_signal';
const CHECK_CONSTRAINT = `${TURN_SIGNAL_TABLE}_signal_check`;

const SIGNALS_BEFORE = [
    'normal_refinement',
    'implicit_correction',
    'explicit_dispute',
    'retry_after_failure',
    'output_shape_correction',
    'new_question',
    'acceptance_or_continuation',
    'product_capability_request',
    'human_intervention',
    'ambiguous',
];

const SIGNALS_WITH_STANDING_INSTRUCTION = [
    ...SIGNALS_BEFORE.slice(0, -1),
    'standing_instruction',
    'ambiguous',
];

// Widening a CHECK list: existing rows all satisfy the new constraint and the
// previous backend never writes the new value, so rolling upgrades are safe.
export const classification: {
    kind: 'safe' | 'breaking';
    reason: string;
} = {
    kind: 'safe',
    reason: 'Adds one allowed value to the turn signal CHECK constraint; existing rows and the previous backend remain valid.',
};

const setCheckConstraint = async (knex: Knex, allowed: string[]) => {
    const list = allowed.map((value) => `'${value}'`).join(', ');
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [
        TURN_SIGNAL_TABLE,
        CHECK_CONSTRAINT,
    ]);
    await knex.raw(
        `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK (signal = ANY (ARRAY[${list}]::text[]))`,
        [TURN_SIGNAL_TABLE, CHECK_CONSTRAINT],
    );
};

export async function up(knex: Knex): Promise<void> {
    await setCheckConstraint(knex, SIGNALS_WITH_STANDING_INSTRUCTION);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DELETE FROM ?? WHERE signal = ?`, [
        TURN_SIGNAL_TABLE,
        'standing_instruction',
    ]);
    await setCheckConstraint(knex, SIGNALS_BEFORE);
}
