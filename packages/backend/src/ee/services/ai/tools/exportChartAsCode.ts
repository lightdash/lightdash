import { ParameterError } from '@lightdash/common';
import { tool } from 'ai';
import { z } from 'zod';
import { AgentContext } from '../utils/AgentContext';
import type { ArtifactChartExportAccess } from '../utils/artifactChartAsCode';
import { prepareChartAsCode, serializeChartAsCode } from '../utils/chartAsCode';
import { yamlCodeBlock } from '../utils/GeneratedResponseBlocks';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

export const getExportChartAsCode = (artifacts?: ArtifactChartExportAccess) =>
    tool({
        description:
            'Export a chart as schema-validated chart-as-code YAML without running queries, saving or publishing content. Always call this tool for chart YAML; never reconstruct YAML yourself. For charts generated in this turn pass queryUuid from generateVisualization and null artifact identifiers. For an existing chart in this conversation, use its exact artifactUuid and versionUuid with null queryUuid. If these identifiers are unknown, pass null for all three source identifiers to list available artifacts first; never regenerate the chart just to export it. Never invent or use placeholder UUIDs. Supports built-in semantic, merged and pinned custom charts; use content tools for other sources. Pass null for an unspecified destination slug or spaceSlug: the tool will report exactly what is missing so you can ask the user. Never search content to infer a destination.',
        inputSchema: z.object({
            queryUuid: z.string().uuid().nullable().optional(),
            artifactUuid: z.string().uuid().nullable().optional(),
            versionUuid: z.string().uuid().nullable().optional(),
            slug: z.string().min(1).max(255).nullable().optional(),
            spaceSlug: z.string().min(1).max(1024).nullable().optional(),
        }),
        execute: async (
            { queryUuid, artifactUuid, versionUuid, slug, spaceSlug },
            { experimental_context },
        ) => {
            try {
                const ctx = AgentContext.from(experimental_context);
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
                        ctx.getChartExport(queryUuid),
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
                const deliveryToken = ctx.responseBlocks.register(result);
                return {
                    result,
                    metadata: { status: 'success' as const, deliveryToken },
                };
            } catch (error) {
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
