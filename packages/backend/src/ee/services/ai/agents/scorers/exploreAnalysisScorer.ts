import {
    ExploreAnalysisEvaluation,
    getFields,
    ScorerContext,
} from '@lightdash/common';

const OPTIMAL_EXPLORE_COUNT = 20;
const GOOD_EXPLORE_COUNT = 50;
const FAIR_EXPLORE_COUNT = 60;
const POOR_EXPLORE_COUNT = 100;

const OPTIMAL_FIELD_COUNT_PER_EXPLORE = 30;

const MAJOR_PENALTY_THRESHOLD = 50; // >50% of explores are too large
const MINOR_PENALTY_THRESHOLD = 25; // >25% of explores are too large

// Score adjustments
const MAJOR_SCORE_PENALTY = 2;
const MINOR_SCORE_PENALTY = 1;
const MIN_SCORE = 1;

/**
 * Analyzes whether the agent has a focused scope based on explore count and field distribution.
 */
export async function evaluateExploreAnalysis(
    context: ScorerContext,
): Promise<ExploreAnalysisEvaluation> {
    const { simplifiedExplores: explores } = context;
    const exploreCount = explores.length;

    if (exploreCount === 0) {
        return {
            score: 0,
            recommendations: ['No explores found available for this agent'],
            largeExplores: [],
        };
    }

    const exploresWithFieldCounts = explores.map((explore) => ({
        name: explore.label || explore.name,
        fieldCount: explore.fields.length,
    }));

    const largeExplores = exploresWithFieldCounts.filter(
        (e) => e.fieldCount > OPTIMAL_FIELD_COUNT_PER_EXPLORE,
    );

    let score: number;
    const recommendations: string[] = [];

    if (exploreCount <= OPTIMAL_EXPLORE_COUNT) {
        score = 5;
        recommendations.push(
            `Excellent! Your agent has a focused scope with ${OPTIMAL_EXPLORE_COUNT} or fewer explores`,
        );
    } else if (exploreCount <= GOOD_EXPLORE_COUNT) {
        score = 4;
        recommendations.push(
            'Good scope - consider if all explores are necessary for this agent',
            'Review if explores can be grouped by business area to create more specialized agents',
        );
    } else if (exploreCount <= FAIR_EXPLORE_COUNT) {
        score = 3;
        recommendations.push(
            'Agent scope is getting broad - consider splitting into multiple specialized agents',
            'Use tags to limit explores to specific business domains (e.g., marketing, sales, finance)',
        );
    } else if (exploreCount <= POOR_EXPLORE_COUNT) {
        score = 2;
        recommendations.push(
            'Agent has access to too many explores - this significantly impacts response quality',
            'Split into multiple specialized agents (e.g., "Marketing Assistant", "Sales Analytics")',
            'Use tags to restrict access to relevant explores only',
        );
    } else {
        score = 1;
        recommendations.push(
            `Critical: Agent has access to ${POOR_EXPLORE_COUNT}+ explores - this severely impacts performance and security`,
            'Create multiple specialized agents instead of one general agent',
            `Use tags to limit each agent to ${OPTIMAL_EXPLORE_COUNT} or fewer related explores`,
        );
    }

    if (largeExplores.length > 0) {
        const largeExplorePercentage =
            (largeExplores.length / exploreCount) * 100;

        if (largeExplorePercentage > MAJOR_PENALTY_THRESHOLD) {
            score = Math.max(MIN_SCORE, score - MAJOR_SCORE_PENALTY);
        } else if (largeExplorePercentage > MINOR_PENALTY_THRESHOLD) {
            score = Math.max(MIN_SCORE, score - MINOR_SCORE_PENALTY);
        }
    }

    return {
        score,
        recommendations,
        largeExplores: largeExplores.map(
            (e) => `${e.name} (${e.fieldCount} fields)`,
        ),
    };
}
