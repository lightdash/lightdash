import {
    ExploreAnalysisEvaluation,
    getFields,
    ScorerContext,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';

/**
 * Analyzes explore structure, naming, and field organization
 */
export async function evaluateExploreAnalysis(
    model: LanguageModel,
    context: ScorerContext,
    enableMeasuredScores = false,
): Promise<ExploreAnalysisEvaluation> {
    if (!enableMeasuredScores) {
        return {
            score: 3,
            recommendations: [
                'Review explore naming conventions',
                'Ensure appropriate field distribution',
            ],
        };
    }
    const empty = context.explores.filter(
        (explore) => getFields(explore).length === 0,
    ).length;
    const described = context.explores.filter((explore) =>
        explore.tables[explore.baseTable]?.description?.trim(),
    ).length;
    const coverage =
        context.explores.length === 0
            ? 0
            : (context.explores.length - empty + described) /
              (2 * context.explores.length);
    return {
        score: Math.round((1 + 4 * coverage) * 10) / 10,
        recommendations: [
            empty
                ? `Review the ${empty} explores with no fields available to this agent.`
                : 'Keep each explore focused on a clearly documented entity and grain.',
            described < context.explores.length
                ? `Describe the purpose and grain of the ${context.explores.length - described} explores without descriptions.`
                : 'Document join relationships and fan-out risks in explore guidance.',
        ],
    };
}
