import { InstructionQualityEvaluation, ScorerContext } from '@lightdash/common';
import { type LanguageModel } from 'ai';

/**
 * Analyzes agent instruction quality and coverage
 * TODO: Implement - ZAP-124
 */
export async function evaluateInstructionQuality(
    model: LanguageModel,
    context: ScorerContext,
): Promise<InstructionQualityEvaluation> {
    return {
        score: 3,
        recommendations: [
            'Add agent instructions to guide AI behavior',
            'Include specific explore references in instructions',
        ],
    };
}
