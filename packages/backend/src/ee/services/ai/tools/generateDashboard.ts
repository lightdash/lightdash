import {
    AiResultType,
    assertUnreachable,
    Explore,
    toolDashboardArgsSchema,
    toolDashboardArgsSchemaTransformed,
    ToolDashboardArgsTransformed,
    toolDashboardOutputSchema,
} from '@lightdash/common';
import { tool } from 'ai';
import type {
    CreateOrUpdateArtifactFn,
    GetExploreFn,
    GetPromptFn,
    RunMiniMetricQueryFn,
    SendFileFn,
    UpdateProgressFn,
    UpdatePromptFn,
} from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';
import { validateBarVizConfig } from '../utils/validateBarVizConfig';
import { validateTableVizConfig } from '../utils/validateTableVizConfig';
import { validateTimeSeriesVizConfig } from '../utils/validateTimeSeriesVizConfig';

type Dependencies = {
    getExplore: GetExploreFn;
    updateProgress: UpdateProgressFn;
    runMiniMetricQuery: RunMiniMetricQueryFn;
    getPrompt: GetPromptFn;
    updatePrompt: UpdatePromptFn;
    sendFile: SendFileFn;
    createOrUpdateArtifact: CreateOrUpdateArtifactFn;
    maxLimit: number;
};

export const getGenerateDashboard = ({
    getExplore,
    getPrompt,
    createOrUpdateArtifact,
}: Dependencies) => {
    const validateVisualization = (
        visualization: ToolDashboardArgsTransformed['visualizations'][0],
        explore: Explore,
    ) => {
        switch (visualization.type) {
            case AiResultType.TABLE_RESULT: {
                validateTableVizConfig(visualization, explore);
                break;
            }
            case AiResultType.VERTICAL_BAR_RESULT:
                validateBarVizConfig(visualization, explore);
                break;
            case AiResultType.TIME_SERIES_RESULT:
                validateTimeSeriesVizConfig(visualization, explore);
                break;
            default:
                assertUnreachable(visualization, 'Invalid visualization type');
        }
    };

    return tool({
        description: toolDashboardArgsSchema.description,
        inputSchema: toolDashboardArgsSchema,
        outputSchema: toolDashboardOutputSchema,
        execute: async (toolArgs) => {
            try {
                const transformedToolArgs =
                    toolDashboardArgsSchemaTransformed.parse(toolArgs);

                const errors: string[] = [];
                const failedVisualizations: string[] = [];
                const validIndices = new Set<number>();

                const vizPromises = transformedToolArgs.visualizations.map(
                    async (viz, index) => {
                        try {
                            const explore = await getExplore({
                                exploreName: viz.vizConfig.exploreName,
                            });

                            validateVisualization(viz, explore);
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
                    ): viz is ToolDashboardArgsTransformed['visualizations'][number] =>
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
};
