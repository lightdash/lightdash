import {
    type ExploreMetadataBreakdown,
    type MetadataCompletenessEvaluation,
    type ScorerContext,
    type SimplifiedExplore,
} from '@lightdash/common';
import { type LanguageModel } from 'ai';

const EXCELLENT_THRESHOLD = 90;
const GOOD_THRESHOLD = 70;
const FAIR_THRESHOLD = 40;
const POOR_THRESHOLD = 20;
// Below 20% is very poor (score 1)

const validString = (value?: string | null) =>
    value ? value.trim().length > 0 : false;

const getScore = (percentage: number): Score => {
    if (percentage >= EXCELLENT_THRESHOLD) return 5;
    if (percentage >= GOOD_THRESHOLD) return 4;
    if (percentage >= FAIR_THRESHOLD) return 3;
    if (percentage >= POOR_THRESHOLD) return 2;
    return 1;
};

/**
 * Calculates a completeness score for a single explore based on its metadata
 */
function calculateExploreCompleteness(
    explore: SimplifiedExplore,
): ExploreMetadataBreakdown {
    const exploreName = explore.label || explore.name;
    const { fields } = explore;

    const hasDescription = validString(explore.description);
    const hasLabel = validString(explore.label);
    let hasAiHint = false;
    if (explore.aiHint) {
        hasAiHint =
            typeof explore.aiHint === 'string'
                ? validString(explore.aiHint)
                : explore.aiHint.length > 0;
    }

    let fieldsWithDescriptions = 0;
    let fieldsWithLabels = 0;
    let fieldsWithAiHints = 0;
    let totalFieldScore = 0;

    for (const field of fields) {
        const hasFieldDescription = validString(field.description);
        const hasFieldLabel = validString(field.label);
        let hasFieldAiHint = false;
        if (field.aiHint) {
            hasFieldAiHint =
                typeof field.aiHint === 'string'
                    ? validString(field.aiHint)
                    : field.aiHint.length > 0;
        }

        if (hasFieldDescription) fieldsWithDescriptions += 1;
        if (hasFieldLabel) fieldsWithLabels += 1;
        if (hasFieldAiHint) fieldsWithAiHints += 1;

        const metadataCount =
            (hasFieldDescription ? 1 : 0) +
            (hasFieldLabel ? 1 : 0) +
            (hasFieldAiHint ? 1 : 0);

        let fieldScore = 0;
        if (metadataCount === 0) {
            fieldScore = 0;
        } else if (metadataCount === 1) {
            fieldScore = 40;
        } else if (metadataCount === 2) {
            fieldScore = 70;
        } else {
            fieldScore = 100;
        }

        totalFieldScore += fieldScore;
    }

    const totalFields = fields.length;
    const fieldCompletenessPercentage =
        totalFields > 0 ? totalFieldScore / totalFields : 0;

    let exploreBonus = 0;
    if (hasDescription) exploreBonus += 4;
    if (hasLabel) exploreBonus += 2;
    if (hasAiHint) exploreBonus += 4;

    const completenessPercentage = Math.round(
        Math.min(100, fieldCompletenessPercentage + exploreBonus),
    );

    return {
        exploreName,
        score: getScore(completenessPercentage),
        completenessPercentage,
        hasDescription,
        hasLabel,
        hasAiHint,
        fieldStats: {
            total: totalFields,
            withDescriptions: fieldsWithDescriptions,
            withLabels: fieldsWithLabels,
            withAiHints: fieldsWithAiHints,
        },
    };
}

const scoreMessages = {
    5: 'Excellent metadata coverage! This helps the AI agent provide accurate responses',
    4: 'Good metadata coverage. Consider improving:',
    3: 'Fair metadata coverage. Focus on improving:',
    2: 'Poor metadata coverage. Prioritize adding metadata to:',
    1: 'Critical: Very poor metadata coverage. Start by adding descriptions and AI hints to:',
} as const;

type Score = keyof typeof scoreMessages;
const needsImprovementExplores = (explores: ExploreMetadataBreakdown[]) =>
    explores.slice(0, 5).map((e) => `'${e.exploreName}'`);

/**
 * Analyzes metadata completeness across explores, tables, and fields.
 * Calculates per-explore scores and aggregates them for an overall assessment.
 */
export async function evaluateMetadataCompleteness(
    context: ScorerContext,
): Promise<MetadataCompletenessEvaluation> {
    const { simplifiedExplores: explores } = context;

    if (explores.length === 0) {
        return {
            score: 0,
            recommendations: ['No explores found available for this agent'],
            overallPercentage: 0,
            exploreBreakdown: [],
            overallMetrics: {
                fieldDescriptionPercentage: 0,
                exploreDescriptionPercentage: 0,
                exploreAiHintPercentage: 0,
            },
        };
    }

    const exploreBreakdown: ExploreMetadataBreakdown[] = [];
    let totalCompletenessPercentage = 0;
    let exploresWithDescription = 0;
    let exploresWithAiHint = 0;
    let totalFields = 0;
    let fieldsWithDescription = 0;

    for (const explore of explores) {
        const breakdown = calculateExploreCompleteness(explore);
        exploreBreakdown.push(breakdown);

        totalCompletenessPercentage += breakdown.completenessPercentage;
        if (breakdown.hasDescription) exploresWithDescription += 1;
        if (breakdown.hasAiHint) exploresWithAiHint += 1;
        totalFields += breakdown.fieldStats.total;
        fieldsWithDescription += breakdown.fieldStats.withDescriptions;
    }

    exploreBreakdown.sort((a, b) => a.score - b.score);

    const overallPercentage = Math.round(
        totalCompletenessPercentage / explores.length,
    );

    const overallMetrics = {
        fieldDescriptionPercentage:
            totalFields > 0
                ? Math.round((fieldsWithDescription / totalFields) * 100)
                : 0,
        exploreDescriptionPercentage: Math.round(
            (exploresWithDescription / explores.length) * 100,
        ),
        exploreAiHintPercentage: Math.round(
            (exploresWithAiHint / explores.length) * 100,
        ),
    };

    const score: Score = getScore(overallPercentage);

    const scoreMessage = scoreMessages[score];
    const needsImprovement =
        score === 5
            ? ''
            : needsImprovementExplores(exploreBreakdown).join(', ');

    const recommendations = [[scoreMessage, needsImprovement].join(' ')];

    return {
        score,
        recommendations,
        overallPercentage,
        exploreBreakdown,
        overallMetrics,
    };
}
