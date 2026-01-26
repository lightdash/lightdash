import {
    toolDashboardV2ArgsSchema,
    toolDashboardV2ArgsSchemaTransformed,
    toolDashboardV2OutputSchema,
    type ToolDashboardV2ArgsTransformed,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    CreateOrUpdateArtifactFn,
    GetPromptFn,
} from '../types/aiAgentDependencies';
import { AgentContext } from '../utils/AgentContext';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { validateRunQueryTool } from './runQuery';

type Dependencies = {
    getPrompt: GetPromptFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
};

export const getGenerateDashboardV2 = ({
    getPrompt,
    createOrUpdateArtifact,
}: Dependencies) =>
    tool({
        description: toolDashboardV2ArgsSchema.description,
        inputSchema: toolDashboardV2ArgsSchema,
        outputSchema: toolDashboardV2OutputSchema,
        execute: async (toolArgs, { experimental_context: context }) => {
            try {
                const ctx = AgentContext.from(context);
                const transformedToolArgs =
                    toolDashboardV2ArgsSchemaTransformed.parse(toolArgs);

                const errors: string[] = [];
                const failedVisualizations: string[] = [];
                const validIndices = new Set<number>();

                const vizPromises = transformedToolArgs.visualizations.map(
                    async (viz, index) => {
                        try {
                            const explore = ctx.getExplore(
                                viz.queryConfig.exploreName,
                            );

                            validateRunQueryTool(viz, explore);
                            validIndices.add(index);
                            return viz;
                        } catch (error) {
                            const errorMessage = toolErrorHandler(
                                error,
                                `Validation failed for visualization ${
                                    index + 1
                                } (${viz.title})`,
                            );
                            errors.push(errorMessage);
                            failedVisualizations.push(viz.title);
                            return null;
                        }
                    },
                );

                const validatedVisualizations = await Promise.all(vizPromises);

                // Filter out null values (failed validations)
                const validVisualizations = validatedVisualizations.filter(
                    (
                        viz,
                    ): viz is ToolDashboardV2ArgsTransformed['visualizations'][number] =>
                        viz !== null,
                );

                // Check if we have at least one valid visualization
                if (validVisualizations.length === 0) {
                    return {
                        result: `Dashboard generation failed - all visualizations had validation errors:\n${errors.join(
                            '\n',
                        )}
                    Please fix these issues and try again.
                    `,
                        metadata: {
                            status: 'error',
                        },
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

                // Return appropriate message based on whether some visualizations failed
                if (errors.length > 0) {
                    return {
                        result: `Dashboard created with ${
                            validVisualizations.length
                        } visualization${
                            validVisualizations.length > 1 ? 's' : ''
                        }.\n\nThe following visualizations were excluded due to validation errors:\n${failedVisualizations
                            .map((title) => `- ${title}`)
                            .join('\n')}\n\nErrors:\n${errors.join('\n')}`,
                        metadata: {
                            status: 'success',
                        },
                    };
                }

                return {
                    result: `Success`,
                    metadata: {
                        status: 'success',
                    },
                };
            } catch (e) {
                return {
                    result: toolErrorHandler(e, 'Error generating dashboard.'),
                    metadata: {
                        status: 'error',
                    },
                };
            }
        },
        toModelOutput: (output) => toModelOutput(output),
    });
