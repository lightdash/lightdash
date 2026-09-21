import {
    getFields,
    ReadinessScore,
    ScorerContext,
    type Explore,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';
import clamp from 'lodash/clamp';
import mean from 'lodash/mean';
import sumBy from 'lodash/sumBy';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { evaluateExploreAnalysis } from './scorers/exploreAnalysisScorer';
import { evaluateInstructionQuality } from './scorers/instructionQualityScorer';
import { evaluateMetadataCompleteness } from './scorers/metadataCompletenessScorer';

export async function evaluateAgentReadiness(
    model: LanguageModel,
    explores: Explore[],
    agentInstructions: string | null,
    decisions?: AiDecisionClient,
): Promise<ReadinessScore> {
    const context: ScorerContext = {
        explores,
        agentInstructions,
    };

    const [metadataCompleteness, exploreAnalysis, instructionQuality] =
        await Promise.all([
            evaluateMetadataCompleteness(model, context, !!decisions),
            evaluateExploreAnalysis(model, context, !!decisions),
            evaluateInstructionQuality(model, context, !!decisions),
        ]);

    if (decisions) {
        const answers = await decisions.evaluate({
            operation: 'agent-readiness',
            state: {
                instructions: agentInstructions,
                explores: explores.slice(0, 15).map((explore) => ({
                    name: explore.name,
                    description: explore.tables[explore.baseTable]?.description,
                    fields: getFields(explore)
                        .slice(0, 15)
                        .map((field) => ({
                            name: field.name,
                            label: field.label,
                            description: field.description,
                        })),
                })),
            },
            questions: {
                instructionQuality: {
                    type: 'score',
                    instructions:
                        'How actionable are the agent instructions for choosing metrics, respecting business definitions and handling ambiguity? Judge instructions only.',
                    criteria: [
                        'Absent or unusable',
                        'Generic role description',
                        'Some specific business guidance',
                        'Clear metric and scope rules',
                        'Precise definitions, boundaries and examples',
                    ],
                },
            },
        });
        const answer = answers?.instructionQuality;
        if (
            answer?.type === 'score' &&
            answer.confidence >= 0.8 &&
            answer.score >= 0 &&
            answer.score <= 4
        ) {
            instructionQuality.score = Math.round((answer.score + 1) * 10) / 10;
        }
    }

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
