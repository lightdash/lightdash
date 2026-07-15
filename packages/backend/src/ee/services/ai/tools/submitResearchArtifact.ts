import { type AiDeepResearchArtifact } from '@lightdash/common';
import { tool } from 'ai';
import { z } from 'zod';
import { toModelOutput } from '../utils/toModelOutput';

const evidenceSchema = z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    sourceType: z.enum([
        'lightdash',
        'warehouse',
        'external_mcp',
        'knowledge',
        'repository',
        'web',
    ]),
    toolName: z.string().nullable(),
    toolCallId: z.string().nullable(),
    mcpServerUuid: z.string().nullable(),
    queryUuid: z.string().nullable(),
});

export const researchArtifactSchema = z.object({
    findings: z.array(z.string().min(1)),
    evidence: z.array(evidenceSchema),
    queryUuids: z.array(z.string().min(1)),
    metricDefinitions: z.array(
        z.object({
            name: z.string().min(1),
            definition: z.string().min(1),
            source: z.string().nullable(),
        }),
    ),
    hypotheses: z.array(z.string().min(1)),
    contradictions: z.array(z.string().min(1)),
    confidence: z.enum(['low', 'medium', 'high']),
    limitations: z.array(z.string().min(1)),
    finalReport: z.string().min(1),
});

export const parseResearchArtifact = (input: unknown): AiDeepResearchArtifact =>
    researchArtifactSchema.parse(input);

export const getSubmitResearchArtifact = () =>
    tool({
        description:
            'Submit the final structured Research Artifact. Deep Research must call this exactly once after investigating and validating the evidence.',
        inputSchema: researchArtifactSchema,
        execute: async () => ({
            result: JSON.stringify({ submitted: true }),
            metadata: { status: 'success' as const },
        }),
        toModelOutput: ({ output }) => toModelOutput(output),
    });
