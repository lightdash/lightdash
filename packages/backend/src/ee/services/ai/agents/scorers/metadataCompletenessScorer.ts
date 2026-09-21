import {
    flattenAiHints,
    getFields,
    MetadataCompletenessEvaluation,
    ScorerContext,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';

/**
 * Analyzes metadata completeness across explores and fields
 */
export async function evaluateMetadataCompleteness(
    model: LanguageModel,
    context: ScorerContext,
    enableMeasuredScores = false,
): Promise<MetadataCompletenessEvaluation> {
    if (!enableMeasuredScores) {
        return {
            score: 3,
            recommendations: [
                'Add descriptions to fields',
                'Add AI hints to explores',
            ],
        };
    }
    const fields = context.explores.flatMap(getFields);
    const described = fields.filter((field) =>
        field.description?.trim(),
    ).length;
    const exploresWithHints = context.explores.filter(
        (explore) =>
            flattenAiHints(explore.tables[explore.baseTable]?.aiHint).length >
            0,
    ).length;
    const coverage = fields.length === 0 ? 0 : described / fields.length;
    const hints =
        context.explores.length === 0
            ? 0
            : exploresWithHints / context.explores.length;
    return {
        score: Math.round((1 + 4 * (coverage * 0.8 + hints * 0.2)) * 10) / 10,
        recommendations: [
            described < fields.length
                ? `Add descriptions to the ${fields.length - described} fields without one, starting with frequently queried metrics.`
                : 'Keep field descriptions aligned with their metric definitions.',
            exploresWithHints < context.explores.length
                ? `Add AI hints to the ${context.explores.length - exploresWithHints} explores without guidance.`
                : 'Review explore hints when business definitions change.',
        ],
    };
}
