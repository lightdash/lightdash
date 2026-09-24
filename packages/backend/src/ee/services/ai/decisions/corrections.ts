import {
    decisionProbability,
    type AiDecisionClient,
    type DecisionAnswers,
    type DecisionQuestion,
} from './AiDecisionClient';
import type { FieldCandidate } from './chartIntent';

export const CORRECTION_KINDS = [
    'alias',
    'default_scope',
    'metric_choice',
    'field_mapping',
    'preference',
] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

/** A lasting definition or default the user stated, found by JEV; the saved text is always the user's own words. */
export type DetectedCorrection = {
    kind: CorrectionKind;
    /** The chart field the correction is about, when JEV can tie it to one. */
    fieldId: string | null;
    /** An existing instruction line that already says the same thing. */
    coveredBy: string | null;
};

export const CORRECTION_THRESHOLDS = {
    detect: 0.8,
    pick: 0.6,
} as const;

/** Asked on every fast-decisions turn, inside the existing batch. */
export const CORRECTION_QUESTION: Record<string, DecisionQuestion> = {
    lastingCorrection: {
        type: 'noul',
        instructions:
            'Does `prompt` tell the agent what a term means, a default to apply, which field or metric a word refers to, or how to present results, meant to apply from now on rather than only to this answer? Asking what something means, one-off filters, changes to the current chart and complaints without a stated rule are not.',
    },
};

const MAX_INSTRUCTION_LINES = 30;
const MAX_FIELDS = 40;

const instructionLines = (instructions: string | null) =>
    (instructions ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, MAX_INSTRUCTION_LINES);

const picked = (
    answer: DecisionAnswers[string] | undefined,
    threshold: number,
): string | null =>
    answer?.type === 'choice' &&
    (answer.probabilities[answer.choice] ?? 0) >= threshold &&
    answer.choice !== 'none'
        ? answer.choice
        : null;

const isCorrectionKind = (value: string | null): value is CorrectionKind =>
    CORRECTION_KINDS.some((kind) => kind === value);

/** Second request, only when detection says yes: pick the kind, field and any duplicate instruction. */
export const pickCorrection = async ({
    decisions,
    prompt,
    instructions,
    fields,
}: {
    decisions: Pick<AiDecisionClient, 'evaluate'>;
    prompt: string;
    instructions: string | null;
    fields: FieldCandidate[];
}): Promise<{
    correction: DetectedCorrection | null;
    answers: DecisionAnswers | null;
}> => {
    const lines = instructionLines(instructions);
    const fieldOptions = fields.slice(0, MAX_FIELDS);
    const questions: Record<string, DecisionQuestion> = {
        kind: {
            type: 'choice',
            instructions:
                'What kind of lasting rule does `prompt` give the agent?',
            criteria: {
                alias: 'A word or name means another term, value or group',
                default_scope:
                    'A default scope or definition to apply, such as which records count',
                metric_choice: 'Which metric to use for a word',
                field_mapping: 'Which field to use for a word',
                preference: 'How to present or format results',
            },
        },
    };
    if (fieldOptions.length > 0)
        questions.field = {
            type: 'choice',
            instructions:
                'Which of these fields is the rule in `prompt` about, if any?',
            criteria: {
                ...Object.fromEntries(
                    fieldOptions.map(({ id, label, table }) => [
                        id,
                        `${label} (${table})`,
                    ]),
                ),
                none: 'None of these fields',
            },
        };
    if (lines.length > 0)
        questions.coveredBy = {
            type: 'choice',
            instructions:
                'Does one of these existing agent instructions already state the same rule as `prompt`?',
            criteria: {
                ...Object.fromEntries(
                    lines.map((line, index) => [`line${index}`, line]),
                ),
                none: 'None of them states this rule',
            },
        };
    const answers = await decisions.evaluate({
        operation: 'correction-pick',
        state: { prompt },
        questions,
    });
    if (!answers) return { correction: null, answers: null };
    const kind = picked(answers.kind, CORRECTION_THRESHOLDS.pick);
    if (!isCorrectionKind(kind)) return { correction: null, answers };
    const fieldId = picked(answers.field, CORRECTION_THRESHOLDS.pick);
    const line = picked(answers.coveredBy, CORRECTION_THRESHOLDS.pick);
    return {
        correction: {
            kind,
            fieldId: fieldOptions.some(({ id }) => id === fieldId)
                ? fieldId
                : null,
            coveredBy: line ? (lines[Number(line.slice(4))] ?? null) : null,
        },
        answers,
    };
};

export const isLastingCorrection = (answers: DecisionAnswers) =>
    (decisionProbability(answers.lastingCorrection) ?? 0) >=
    CORRECTION_THRESHOLDS.detect;
