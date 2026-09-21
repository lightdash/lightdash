import { InstructionQualityEvaluation, ScorerContext } from '@lightdash/common';
import { type LanguageModel } from 'ai';

/**
 * Analyzes agent instruction quality and coverage
 */
export async function evaluateInstructionQuality(
    model: LanguageModel,
    context: ScorerContext,
    enableMeasuredScores = false,
): Promise<InstructionQualityEvaluation> {
    if (!enableMeasuredScores) {
        return {
            score: 3,
            recommendations: [
                'Add agent instructions to guide AI behavior',
                'Include specific explore references in instructions',
            ],
        };
    }
    const instructions = context.agentInstructions?.trim() ?? '';
    const namesExplore = context.explores.some((explore) =>
        instructions.toLowerCase().includes(explore.name.toLowerCase()),
    );
    const presentScore = namesExplore ? 3 : 2;
    return {
        score: instructions.length === 0 ? 1 : presentScore,
        recommendations: [
            instructions
                ? 'Specify which metric definitions, date conventions and business rules the agent should use.'
                : 'Add agent instructions describing the business questions this agent answers.',
            namesExplore
                ? 'Document when to ask for clarification rather than choosing between competing definitions.'
                : 'Name the explores and measures that should answer common questions.',
        ],
    };
}
