import { z } from 'zod';
import { type ApiSuccess } from '../../../types/api/success';
import { type Explore } from '../../../types/explore';

export interface ScorerContext {
    explores: Explore[];
    agentInstructions: string | null;
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

// Explicit types for each scorer (TSOA-compatible)
export type MetadataCompletenessEvaluation = ReadinessScoreEvaluation;
export type ExploreAnalysisEvaluation = ReadinessScoreEvaluation;
export type InstructionQualityEvaluation = ReadinessScoreEvaluation;

// Zod schemas for validation (backend only)
export const MetadataCompletenessSchema = BaseScorerSchema;
export const ExploreAnalysisSchema = BaseScorerSchema;
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
