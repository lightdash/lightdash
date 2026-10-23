import { AiAccessRefusedError, ParameterError } from '@lightdash/common';
import { tool } from 'ai';
import { z } from 'zod';
import { AgentContext } from '../utils/AgentContext';
import type { ArtifactChartExportAccess } from '../utils/artifactChartAsCode';
import { prepareChartAsCode, serializeChartAsCode } from '../utils/chartAsCode';
import { yamlCodeBlock } from '../utils/GeneratedResponseBlocks';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler, toolErrorOutput } from '../utils/toolErrorHandler';

export const getExportChartAsCode = (
    agentContext: AgentContext,
    artifacts?: ArtifactChartExportAccess,
) =>
    tool({
        description: `Export a chart as schema-validated chart-as-code YAML without running queries, saving or publishing content. Call it whenever the user wants chart YAML rather than writing YAML yourself, which skips the schema validation. It supports built-in semantic, merged and pinned custom charts; use the content tools for other sources.

Inputs:
- Source: for a chart from an earlier message, its artifactUuid and versionUuid with null queryUuid; queryUuid only for a chart generated in this same turn, with null artifact identifiers. Null for all three lists the conversation's artifacts. Copy identifiers exactly; never invent placeholder UUIDs.
- Destination: pass the slug and spaceSlug the user gave, or null for any the user has not specified.

Returns the YAML. Without a source identifier it returns the conversation's artifacts to choose from; with a destination value missing it names which one, so you can ask the user rather than searching content for it. Export the existing chart instead of regenerating it or rerunning its query.`,
        inputSchema: z.object({
            queryUuid: z
                .string()
                .uuid()
                .nullable()
                .optional()
                .describe(
                    'Query UUID of a chart generated in the current turn; it does not resolve in a later turn.',
                ),
            artifactUuid: z
                .string()
                .uuid()
                .nullable()
                .optional()
                .describe('Exact UUID of a stored chart artifact.'),
            versionUuid: z
                .string()
                .uuid()
                .nullable()
                .optional()
                .describe('Exact version UUID of that stored chart artifact.'),
            slug: z.string().min(1).max(255).nullable().optional(),
            spaceSlug: z.string().min(1).max(1024).nullable().optional(),
        }),
        execute: async ({
            queryUuid,
            artifactUuid,
            versionUuid,
            slug,
            spaceSlug,
        }) => {
            try {
                if (
                    (queryUuid && (artifactUuid || versionUuid)) ||
                    !!artifactUuid !== !!versionUuid
                ) {
                    throw new ParameterError(
                        'Choose a current-turn queryUuid or an exact artifactUuid/versionUuid pair.',
                    );
                }
                if (!slug || !spaceSlug) {
                    return {
                        result: JSON.stringify({
                            ...(artifacts && !queryUuid && !artifactUuid
                                ? { artifacts: await artifacts.list() }
                                : {}),
                            missingDestination: [
                                ...(!slug ? ['slug'] : []),
                                ...(!spaceSlug ? ['spaceSlug'] : []),
                            ],
                            instruction:
                                'Ask the user for the missing destination values. Do not infer them, search content, or write YAML yourself. Then call exportChartAsCode again.',
                        }),
                        metadata: { status: 'success' as const },
                    };
                }
                if (!queryUuid && !artifactUuid) {
                    if (!artifacts)
                        throw new ParameterError(
                            'Existing-chart export is unavailable in this context.',
                        );
                    return {
                        result: JSON.stringify({
                            artifacts: await artifacts.list(),
                            instruction:
                                'Select the chart requested by the user and export its exact artifactUuid/versionUuid. Ask if the intended chart is ambiguous.',
                        }),
                        metadata: { status: 'success' as const },
                    };
                }
                let prepared;
                if (queryUuid) {
                    prepared = prepareChartAsCode(
                        agentContext.getChartExport(queryUuid),
                    );
                } else {
                    if (!artifacts || !artifactUuid || !versionUuid)
                        throw new ParameterError(
                            'Existing-chart export is unavailable in this context.',
                        );
                    prepared = await artifacts.prepare({
                        artifactUuid,
                        versionUuid,
                    });
                }
                const { yaml } = serializeChartAsCode(prepared, {
                    slug,
                    spaceSlug,
                });
                const result = yamlCodeBlock(yaml);
                const deliveryToken =
                    agentContext.responseBlocks.register(result);
                return {
                    result,
                    metadata: { status: 'success' as const, deliveryToken },
                };
            } catch (error) {
                if (error instanceof AiAccessRefusedError) {
                    return {
                        ...toolErrorOutput(error, 'Could not export chart.'),
                        metadata: { status: 'error' as const },
                    };
                }
                return {
                    result: toolErrorHandler(error, 'Could not export chart.'),
                    metadata: { status: 'error' as const },
                };
            }
        },
        toModelOutput: ({ output }) =>
            toModelOutput({
                metadata: output.metadata,
                result:
                    output.metadata.status === 'success' &&
                    output.metadata.deliveryToken
                        ? `Export ready. Include this exact token on its own line in your final response (without a code fence or inline backticks): ${output.metadata.deliveryToken}\nThe server inserts the validated YAML at this token. Do not write or reconstruct YAML yourself. No content has been saved.`
                        : output.result,
            }),
    });
