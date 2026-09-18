import {
    generateDashboardToolDefinition,
    toolDashboardV2ArgsSchemaTransformed,
    type Explore,
    type ToolDashboardV2StructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler, toolErrorOutput } from '../utils/toolErrorHandler';
import { validateRunQueryTool } from './runQuery';

type Dependencies = {
    availableExplores: Explore[];
    getPrompt: GetPromptFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
};

type VisualizationValidation =
    | { status: 'valid'; index: number }
    | { status: 'invalid'; index: number; title: string; error: string };

const toolDefinition = generateDashboardToolDefinition.for('agent');

export const getGenerateDashboardV2 = ({
    availableExplores,
    getPrompt,
    createOrUpdateArtifact,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            toolArgs,
        ): Promise<
            | ExecuteStructuredToolResult<ToolDashboardV2StructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const ctx = new AgentContext(availableExplores);
                const transformedToolArgs =
                    toolDashboardV2ArgsSchemaTransformed.parse(toolArgs);

                const validations: VisualizationValidation[] =
                    transformedToolArgs.visualizations.map((viz, index) => {
                        try {
                            const explore = ctx.getExplore(
                                viz.queryConfig.exploreName,
                            );
                            validateRunQueryTool(viz, explore);
                            return { status: 'valid', index };
                        } catch (error) {
                            return {
                                status: 'invalid',
                                index,
                                title: viz.title,
                                error: toolErrorHandler(
                                    error,
                                    `Validation failed for visualization ${
                                        index + 1
                                    } (${viz.title})`,
                                ),
                            };
                        }
                    });

                const validIndices = new Set(
                    validations
                        .filter((v) => v.status === 'valid')
                        .map((v) => v.index),
                );
                const excludedVisualizations = validations.flatMap((v) =>
                    v.status === 'invalid'
                        ? [{ title: v.title, error: v.error }]
                        : [],
                );
                const errors = excludedVisualizations.map((v) => v.error);

                // Check if we have at least one valid visualization
                if (validIndices.size === 0) {
                    const result = `Dashboard generation failed - all visualizations had validation errors:\n${errors.join(
                        '\n',
                    )}
                    Please fix these issues and try again.
                    `;
                    return {
                        result,
                        metadata: {
                            status: 'error',
                        },
                        structuredContent: { error: result },
                    };
                }

                // Create dashboard with valid visualizations only
                const prompt = await getPrompt();

                // Store the original (untransformed) toolArgs, not the transformed version
                // This is important because when reading from DB, we parse with the base schema
                await createOrUpdateArtifact({
                    threadUuid: prompt.threadUuid,
                    promptUuid: prompt.promptUuid,
                    artifactType: 'dashboard',
                    title: toolArgs.title,
                    description: toolArgs.description,
                    vizConfig: {
                        ...toolArgs,
                        visualizations: toolArgs.visualizations.filter(
                            (_, index) => validIndices.has(index),
                        ),
                    },
                });

                const structuredContent: ToolDashboardV2StructuredContent = {
                    visualizationCount: validIndices.size,
                    excludedVisualizations,
                };

                // Return appropriate message based on whether some visualizations failed
                if (errors.length > 0) {
                    return {
                        result: `Dashboard created with ${
                            validIndices.size
                        } visualization${
                            validIndices.size > 1 ? 's' : ''
                        }.\n\nThe following visualizations were excluded due to validation errors:\n${excludedVisualizations
                            .map(({ title }) => `- ${title}`)
                            .join('\n')}\n\nErrors:\n${errors.join('\n')}`,
                        metadata: {
                            status: 'success',
                        },
                        structuredContent,
                    };
                }

                return {
                    result: `Success`,
                    metadata: {
                        status: 'success',
                    },
                    structuredContent,
                };
            } catch (e) {
                return toolErrorOutput(e, 'Error generating dashboard.');
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
