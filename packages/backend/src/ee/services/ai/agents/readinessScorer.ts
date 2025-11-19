import {
    type Explore,
    getFields,
    ReadinessScore,
    ScorerContext,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';
import clamp from 'lodash/clamp';
import mean from 'lodash/mean';
import sumBy from 'lodash/sumBy';
import { evaluateExploreAnalysis } from './scorers/exploreAnalysisScorer';
import { evaluateInstructionQuality } from './scorers/instructionQualityScorer';
import { evaluateMetadataCompleteness } from './scorers/metadataCompletenessScorer';

export async function evaluateAgentReadiness(
    model: LanguageModel,
    explores: Explore[],
    agentInstructions: string | null,
): Promise<ReadinessScore> {
    const context: ScorerContext = {
        explores,
        agentInstructions,
    };

    const [metadataCompleteness, exploreAnalysis, instructionQuality] =
        await Promise.all([
            evaluateMetadataCompleteness(model, context),
            evaluateExploreAnalysis(model, context),
            evaluateInstructionQuality(model, context),
        ]);

    const overallScore = clamp(
        Math.round(
            mean([
                metadataCompleteness.score,
                exploreAnalysis.score,
                instructionQuality.score,
            ]),
        ),
        1,
        5,
    );

    const projectSnapshot = {
        exploreCount: context.explores.length,
        fieldCount: sumBy(
            context.explores,
            (explore) => getFields(explore).length,
        ),
    };

    return {
        overallScore,
        metadataCompleteness,
        exploreAnalysis,
        instructionQuality,
        timestamp: new Date(),
        projectSnapshot,
    };
}
