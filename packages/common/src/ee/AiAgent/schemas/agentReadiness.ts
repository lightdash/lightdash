import { z } from 'zod';
import { type ApiSuccess } from '../../../types/api/success';

export interface SimplifiedField {
    name: string;
    label: string | null;
    description: string | null;
    aiHint: string | string[] | null;
}

export interface SimplifiedExplore {
    name: string;
    label: string | null;
    description: string | null;
    aiHint: string | string[] | null;
    fields: SimplifiedField[];
}

export interface ScorerContext {
    agentInstructions: string | null;
    simplifiedExplores: SimplifiedExplore[];
}

export const ScoreSchema = z
    .number()
    .min(1)
    .max(5)
    .describe(
        'Score from 1-5 where 1=very poor, 2=poor, 3=fair, 4=good, 5=excellent',
    );

export const RecommendationsSchema = z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
        'List of 2-5 specific, actionable recommendations for improvement',
    );

export const BaseScorerSchema = z.object({
    score: ScoreSchema,
    recommendations: RecommendationsSchema,
});

export type BaseScorerEvaluation = z.infer<typeof BaseScorerSchema>;

export interface Scorer<
    ScoreEvaluationResult extends BaseScorerEvaluation = BaseScorerEvaluation,
> {
    evaluate(context: ScorerContext): Promise<ScoreEvaluationResult>;
}
// Base evaluation type for all scorers
export type ReadinessScoreEvaluation = {
    score: number;
    recommendations: string[];
};

// Per-explore metadata breakdown
export type ExploreMetadataBreakdown = {
    exploreName: string;
    score: number;
    completenessPercentage: number;
    hasDescription: boolean;
    hasLabel: boolean;
    hasAiHint: boolean;
    fieldStats: {
        total: number;
        withDescriptions: number;
        withLabels: number;
        withAiHints: number;
    };
};

// Aggregate metrics across all explores
export type OverallMetadataMetrics = {
    fieldDescriptionPercentage: number;
    exploreDescriptionPercentage: number;
    exploreAiHintPercentage: number;
};

// Explicit types for each scorer (TSOA-compatible)
export type MetadataCompletenessEvaluation = ReadinessScoreEvaluation & {
    overallPercentage: number;
    exploreBreakdown: ExploreMetadataBreakdown[];
    overallMetrics: OverallMetadataMetrics;
};
export type ExploreAnalysisEvaluation = ReadinessScoreEvaluation & {
    largeExplores: string[];
};
export type InstructionQualityEvaluation = ReadinessScoreEvaluation;

// Zod schemas for validation (backend only)
export const ExploreMetadataBreakdownSchema = z.object({
    exploreName: z.string(),
    score: ScoreSchema,
    completenessPercentage: z.number().min(0).max(100),
    hasDescription: z.boolean(),
    hasLabel: z.boolean(),
    hasAiHint: z.boolean(),
    fieldStats: z.object({
        total: z.number(),
        withDescriptions: z.number(),
        withLabels: z.number(),
        withAiHints: z.number(),
    }),
});

export const OverallMetadataMetricsSchema = z.object({
    fieldDescriptionPercentage: z.number().min(0).max(100),
    exploreDescriptionPercentage: z.number().min(0).max(100),
    exploreAiHintPercentage: z.number().min(0).max(100),
});

export const MetadataCompletenessSchema = BaseScorerSchema.extend({
    overallPercentage: z.number().min(0).max(100),
    exploreBreakdown: z.array(ExploreMetadataBreakdownSchema),
    overallMetrics: OverallMetadataMetricsSchema,
});
export const ExploreAnalysisSchema = BaseScorerSchema.extend({
    largeExplores: z.array(z.string()),
});
export const InstructionQualitySchema = BaseScorerSchema;

export interface ReadinessScore {
    overallScore: number;
    metadataCompleteness: MetadataCompletenessEvaluation;
    exploreAnalysis: ExploreAnalysisEvaluation;
    instructionQuality: InstructionQualityEvaluation;
    timestamp: Date;
    projectSnapshot: {
        exploreCount: number;
        fieldCount: number;
    };
}

export type ApiAgentReadinessScoreResponse = ApiSuccess<ReadinessScore>;
