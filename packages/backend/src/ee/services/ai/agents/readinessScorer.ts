import {
    type Explore,
    getFields,
    ReadinessScore,
    ScorerContext,
    SimplifiedExplore,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';
import sumBy from 'lodash/sumBy';
import { evaluateAgentReadiness as evaluateAgentReadinessScorer } from './scorers/agentReadinessScorer';
import { evaluateExploreAnalysis } from './scorers/exploreAnalysisScorer';
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
        simplifiedExplores,
        agentInstructions,
    };

    const [metadataCompleteness, exploreAnalysis] = await Promise.all([
        evaluateMetadataCompleteness(context),
        evaluateExploreAnalysis(context),
    ]);

    const agentReadiness = await evaluateAgentReadinessScorer(
        model,
        context,
        metadataCompleteness,
        exploreAnalysis,
    );

    const overallScore = agentReadiness.score;

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
        agentReadiness,
        timestamp: new Date(),
        projectSnapshot,
    };
}
