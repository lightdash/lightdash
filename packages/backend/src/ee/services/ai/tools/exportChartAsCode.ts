import {
    exportChartAsCodeToolDefinition,
    ParameterError,
    type ToolExportChartAsCodeOutput,
} from '@lightdash/common';
import { tool } from 'ai';
import { AgentContext } from '../utils/AgentContext';
import type { ArtifactChartExportAccess } from '../utils/artifactChartAsCode';
import { prepareChartAsCode, serializeChartAsCode } from '../utils/chartAsCode';
import { yamlCodeBlock } from '../utils/GeneratedResponseBlocks';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

const toolDefinition = exportChartAsCodeToolDefinition.for('agent');

export const getExportChartAsCode = (
    agentContext: AgentContext,
    artifacts?: ArtifactChartExportAccess,
) =>
    tool({
        ...toolDefinition,
        execute: async ({
            queryUuid,
            artifactUuid,
            versionUuid,
            slug,
            spaceSlug,
        }): Promise<ToolExportChartAsCodeOutput> => {
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
                    const missingDestination: Array<'slug' | 'spaceSlug'> = [];
                    if (!slug) missingDestination.push('slug');
                    if (!spaceSlug) missingDestination.push('spaceSlug');
                    const structuredContent = {
                        ...(artifacts && !queryUuid && !artifactUuid
                            ? { artifacts: await artifacts.list() }
                            : {}),
                        missingDestination,
                    };
                    return {
                        result: JSON.stringify({
                            ...structuredContent,
                            instruction:
                                'Ask the user for the missing destination values. Do not infer them, search content, or write YAML yourself. Then call exportChartAsCode again.',
                        }),
                        metadata: { status: 'success' },
                        structuredContent,
                    };
                }
                if (!queryUuid && !artifactUuid) {
                    if (!artifacts)
                        throw new ParameterError(
                            'Existing-chart export is unavailable in this context.',
                        );
                    const structuredContent = {
                        artifacts: await artifacts.list(),
                    };
                    return {
                        result: JSON.stringify({
                            ...structuredContent,
                            instruction:
                                'Select the chart requested by the user and export its exact artifactUuid/versionUuid. Ask if the intended chart is ambiguous.',
                        }),
                        metadata: { status: 'success' },
                        structuredContent,
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
                    metadata: { status: 'success', deliveryToken },
                    structuredContent: {
                        exportReady: true,
                        deliveryToken,
                        insertsValidatedYamlAtToken: true,
                        contentSaved: false,
                    },
                };
            } catch (error) {
                return toolErrorOutput(error, 'Could not export chart.');
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
