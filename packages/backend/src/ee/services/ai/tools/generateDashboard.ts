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
    const schema = toolDashboardArgsSchema;

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
        inputSchema: schema,
        execute: async (toolArgs) => {
            try {
                const args = toolDashboardArgsSchemaTransformed.parse(toolArgs);

                const errors: string[] = [];

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
                            return null;
                        }
                    },
                );

                await Promise.all(vizPromises);

                const prompt = await getPrompt();
                // Create dashboard-level artifact
                await createOrUpdateArtifact({
                    threadUuid: prompt.threadUuid,
                    promptUuid: prompt.promptUuid,
                    artifactType: 'dashboard',
                    title: toolArgs.title,
                    description: toolArgs.description,
                    vizConfig: toolArgs,
                });

                // Return summary of generated dashboard

                if (errors.length > 0) {
                    return `Generated dashboard with errors:\n${errors.join(
                        '\n',
                    )}
                    Try again if you believe the error(s) can be resolved, if not, try again with the visualizations that did not fail.
                    `;
                }

                return `Success`;
            } catch (e) {
                return toolErrorHandler(e, 'Error generating dashboard.');
            }
        },
    });
};
