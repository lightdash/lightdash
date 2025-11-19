import {
    type Explore,
    getFields,
    ReadinessScore,
    ScorerContext,
    SimplifiedExplore,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';
import clamp from 'lodash/clamp';
import mean from 'lodash/mean';
import sumBy from 'lodash/sumBy';
import { evaluateExploreAnalysis } from './scorers/exploreAnalysisScorer';
import { evaluateInstructionQuality } from './scorers/instructionQualityScorer';
import { evaluateMetadataCompleteness } from './scorers/metadataCompletenessScorer';

/**
 * Converts explores to a simplified format with only metadata needed for scoring
 */
function simplifyExplores(explores: Explore[]): SimplifiedExplore[] {
    return explores.map((explore) => {
        const baseTable = explore.tables[explore.baseTable];
        const fields = getFields(explore);

        return {
            name: explore.name,
            label: explore.label || null,
            description: baseTable?.description || null,
            aiHint: explore.aiHint || null,
            fields: fields.map((field) => ({
                name: field.name,
                label: field.label || null,
                description: field.description || null,
                aiHint: field.aiHint || null,
            })),
        };
    });
}

export async function evaluateAgentReadiness(
    model: LanguageModel,
    explores: Explore[],
    agentInstructions: string | null,
): Promise<ReadinessScore> {
    const simplifiedExplores = simplifyExplores(explores);

    const context: ScorerContext = {
        agentInstructions,
        simplifiedExplores,
    };

    const [metadataCompleteness, exploreAnalysis, instructionQuality] =
        await Promise.all([
            evaluateMetadataCompleteness(context),
            evaluateExploreAnalysis(context),
            evaluateInstructionQuality(model, context),
        ]);

    const scores = [
        instructionQuality.score,
        metadataCompleteness.score,
        exploreAnalysis.score,
    ];

    const overallScore = clamp(Math.round(mean(scores)), 1, 5);

    const projectSnapshot = {
        exploreCount: simplifiedExplores.length,
        fieldCount: sumBy(
            context.simplifiedExplores,
            (explore) => explore.fields.length,
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
