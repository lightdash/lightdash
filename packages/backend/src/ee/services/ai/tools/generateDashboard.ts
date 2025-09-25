import {
    AiResultType,
    assertUnreachable,
    Explore,
    toolDashboardArgsSchema,
    toolDashboardArgsSchemaTransformed,
    ToolDashboardArgsTransformed,
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
        execute: async (toolArgs) => {
            try {
                const args = toolDashboardArgsSchemaTransformed.parse(toolArgs);

                const errors: string[] = [];
                const failedVisualizations: string[] = [];

                const vizPromises = args.visualizations.map(
                    async (viz, index) => {
                        try {
                            const explore = await getExplore({
                                exploreName: viz.vizConfig.exploreName,
                            });

                            validateVisualization(viz, explore);
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
                    ): viz is ToolDashboardArgsTransformed['visualizations'][0] =>
                        viz !== null,
                );

                // Check if we have at least one valid visualization
                if (validVisualizations.length === 0) {
                    return `Dashboard generation failed - all visualizations had validation errors:\n${errors.join(
                        '\n',
                    )}
                    Please fix these issues and try again.
                    `;
                }

                // Create dashboard with valid visualizations only
                const prompt = await getPrompt();
                const dashboardWithValidViz = {
                    ...toolArgs,
                    visualizations: validVisualizations,
                };

                await createOrUpdateArtifact({
                    threadUuid: prompt.threadUuid,
                    promptUuid: prompt.promptUuid,
                    artifactType: 'dashboard',
                    title: toolArgs.title,
                    description: toolArgs.description,
                    vizConfig: dashboardWithValidViz,
                });

                // Return appropriate message based on whether some visualizations failed
                if (errors.length > 0) {
                    return `Dashboard created with ${
                        validVisualizations.length
                    } visualization${
                        validVisualizations.length > 1 ? 's' : ''
                    }.\n\nThe following visualizations were excluded due to validation errors:\n${failedVisualizations
                        .map((title) => `- ${title}`)
                        .join('\n')}\n\nErrors:\n${errors.join('\n')}`;
                }

                return `Success`;
            } catch (e) {
                return toolErrorHandler(e, 'Error generating dashboard.');
            }
        },
    });
};
