import { z } from 'zod';
import {
    AI_DEEP_RESEARCH_CONFIDENCE_LEVELS,
    AI_DEEP_RESEARCH_HYPOTHESIS_VERDICTS,
    type AiDeepResearchHypothesis,
    type AiDeepResearchInvestigationReport,
} from './types';

// Upper bounds keep model-authored submissions from overflowing the judge's
// context; they are far above what a useful submission needs.
const MAX_FIELD_CHARS = 2_000;
const MAX_LIST_ITEMS = 10;
const MAX_EVIDENCE_ITEMS = 20;
const MAX_EVIDENCE_REFS = 20;
export const AI_DEEP_RESEARCH_MAX_PLANNED_HYPOTHESES = 10;

export const aiDeepResearchHypothesisInputSchema = z.object({
    claim: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe('A single falsifiable explanation of the observed question'),
    rationale: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe('Why this claim is plausible given what is already known'),
    supportingEvidence: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe('Concrete evidence that would support the claim if found'),
    falsifyingEvidence: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe('Concrete evidence that would falsify the claim if found'),
});

export const aiDeepResearchHypothesesInputSchema = z.object({
    hypotheses: z
        .array(aiDeepResearchHypothesisInputSchema)
        .min(1)
        .max(AI_DEEP_RESEARCH_MAX_PLANNED_HYPOTHESES)
        .describe(
            'Distinct, mutually competing hypotheses. Submit exactly the requested number.',
        ),
});

export type AiDeepResearchHypothesesInput = z.infer<
    typeof aiDeepResearchHypothesesInputSchema
>;

export const aiDeepResearchInvestigationReportInputSchema = z.object({
    verdict: z
        .enum(AI_DEEP_RESEARCH_HYPOTHESIS_VERDICTS)
        .describe('Whether the evidence supports or refutes the hypothesis'),
    summary: z
        .string()
        .min(1)
        .max(MAX_FIELD_CHARS)
        .describe('What the investigation found, in a few sentences'),
    evidence: z
        .array(
            z.object({
                finding: z.string().min(1).max(MAX_FIELD_CHARS),
                queryUuids: z
                    .array(z.string().max(100))
                    .max(MAX_EVIDENCE_REFS)
                    .describe(
                        'queryUuid values from warehouse query results produced during this investigation',
                    ),
                sources: z
                    .array(z.string().max(500))
                    .max(MAX_EVIDENCE_REFS)
                    .describe(
                        'Non-warehouse references such as documents or URLs',
                    ),
            }),
        )
        .max(MAX_EVIDENCE_ITEMS),
    alternativeExplanations: z
        .array(z.string().max(MAX_FIELD_CHARS))
        .max(MAX_LIST_ITEMS)
        .describe('Other explanations consistent with the same evidence'),
    causalLimitations: z
        .array(z.string().max(MAX_FIELD_CHARS))
        .max(MAX_LIST_ITEMS)
        .describe(
            'Why the evidence does or does not establish causation, not just correlation',
        ),
    confidence: z.enum(AI_DEEP_RESEARCH_CONFIDENCE_LEVELS),
}) satisfies z.ZodType<AiDeepResearchInvestigationReport>;

export type AiDeepResearchInvestigationReportInput = z.infer<
    typeof aiDeepResearchInvestigationReportInputSchema
>;

/** Stamps planner-submitted hypotheses with stable ordinal ids. */
export const toAiDeepResearchHypotheses = (
    input: AiDeepResearchHypothesesInput,
): AiDeepResearchHypothesis[] =>
    input.hypotheses.map((hypothesis, index) => ({
        id: `hypothesis-${index + 1}`,
        ...hypothesis,
    }));
