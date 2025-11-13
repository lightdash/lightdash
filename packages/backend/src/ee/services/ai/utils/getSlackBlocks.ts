import {
    AiAgentMessageAssistantArtifact,
    AiAgentToolResult,
    AiArtifact,
    FollowUpTools,
    followUpToolsText,
    parseVizConfig,
    SlackPrompt,
} from '@lightdash/common';
import { Block, KnownBlock } from '@slack/bolt';
import { partition } from 'lodash';

export function getReferencedArtifactsBlocks(
    agentUuid: string,
    projectUuid: string,
    siteUrl: string,
    referencedArtifacts: AiAgentMessageAssistantArtifact[],
    threadUuid: string,
    promptUuid: string,
): (Block | KnownBlock)[] {
    if (!referencedArtifacts || referencedArtifacts.length === 0) {
        return [];
    }

    return [
        {
            type: 'divider',
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'plain_text',
                    text: '✨ Referenced answers:',
                },
            ],
        },
        {
            type: 'actions',
            elements: referencedArtifacts.map((artifact) => {
                const title = artifact.title || artifact.artifactType;
                // TODO :: threadUuid and promptUuid should not be required
                const url = `${siteUrl}/projects/${projectUuid}/ai-agents/${agentUuid}/edit/verified-artifacts/${artifact.artifactUuid}?versionUuid=${artifact.versionUuid}&threadUuid=${threadUuid}&promptUuid=${promptUuid}`;
                return {
                    type: 'button',
                    url,
                    text: {
                        type: 'plain_text',
                        text: `📊 ${title}`,
                        emoji: true,
                    },
                    action_id: 'view_artifact',
                };
            }),
        },
    ];
}

export function getFollowUpToolBlocks(
    slackPrompt: SlackPrompt,
    artifacts?: AiArtifact[],
): KnownBlock[] {
    // TODO: Assuming each thread has just one artifact for now
    // TODO: Handle multiple artifacts per thread in the future

    if (!artifacts || artifacts.length === 0) {
        return [];
    }

    // Find the first chart artifact (assuming one artifact per thread for now)
    const chartArtifact = artifacts.find((artifact) => artifact.chartConfig);
    if (!chartArtifact || !chartArtifact.chartConfig) {
        return [];
    }

    // Extract follow-up tools from the chart config if they exist
    let savedFollowUpTools: FollowUpTools = [];
    if (
        'followUpTools' in chartArtifact.chartConfig &&
        Array.isArray(chartArtifact.chartConfig.followUpTools)
    ) {
        savedFollowUpTools = chartArtifact.chartConfig
            .followUpTools as FollowUpTools;
    }

    if (!savedFollowUpTools?.length) {
        return [];
    }

    return [
        {
            type: 'divider',
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'plain_text',
                    text: `❓ What would you like me to do next?`,
                },
            ],
        },
        {
            type: 'actions',
            elements: savedFollowUpTools.map((tool) => ({
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: followUpToolsText[tool],
                },
                value: slackPrompt.promptUuid,
                action_id: `execute_follow_up_tool.${tool}`,
            })),
        },
    ];
}

export function getFeedbackBlocks(
    slackPrompt: SlackPrompt,
    artifacts?: AiArtifact[],
): (Block | KnownBlock)[] {
    // TODO: Assuming each thread has just one artifact for now
    // Show feedback blocks if we have artifacts with visualizations
    if (!artifacts || artifacts.length === 0) {
        return [];
    }

    // Check if any artifacts have chart or dashboard configs
    const hasVisualization = artifacts.some(
        (artifact) => artifact.chartConfig || artifact.dashboardConfig,
    );

    if (!hasVisualization) {
        return [];
    }

    return [
        {
            type: 'divider',
        },
        {
            type: 'context',
            elements: [
                {
                    type: 'plain_text',
                    text: `🤖 How did I do?`,
                },
            ],
        },
        {
            block_id: 'prompt_human_score',
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '👍',
                        emoji: true,
                    },
                    value: slackPrompt.promptUuid,
                    action_id: 'prompt_human_score.upvote',
                },
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: '👎',
                        emoji: true,
                    },
                    value: slackPrompt.promptUuid,
                    action_id: 'prompt_human_score.downvote',
                },
            ],
        },
    ];
}

export function getExploreBlocks(
    slackPrompt: SlackPrompt,
    siteUrl: string,
    maxQueryLimit: number,
    artifacts?: AiArtifact[],
): (Block | KnownBlock)[] {
    // TODO: Assuming each thread has just one artifact for now
    if (!artifacts || artifacts.length === 0) {
        return [];
    }

    // Find the first chart artifact (assuming one artifact per thread for now)
    const chartArtifact = artifacts.find((artifact) => artifact.chartConfig);
    if (!chartArtifact || !chartArtifact.chartConfig) {
        return [];
    }

    const vizConfig = parseVizConfig(chartArtifact.chartConfig, maxQueryLimit);
    if (!vizConfig) {
        throw new Error('Failed to parse viz config');
    }

    const configState = {
        tableName: vizConfig.metricQuery.exploreName,
        metricQuery: {
            ...vizConfig.metricQuery,
            tableCalculations: [],
        },
        tableConfig: {
            columnOrder: vizConfig.metricQuery.dimensions.concat(
                vizConfig.metricQuery.metrics,
            ),
        },
        chartConfig: {
            type: 'table',
            config: {
                showColumnCalculation: false,
                showRowCalculation: false,
                showTableNames: true,
                showResultsTotal: false,
                showSubtotals: false,
                columns: {},
                hideRowNumbers: false,
                conditionalFormattings: [],
                metricsAsRows: false,
            },
        },
    };

    const configStateQueryString = new URLSearchParams({
        create_saved_chart_version: JSON.stringify(configState),
    });

    const exploreUrl = `${siteUrl}/projects/${slackPrompt.projectUuid}/tables/${vizConfig.metricQuery.exploreName}?${configStateQueryString}`;

    return [
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    url: exploreUrl,
                    action_id: 'actions.explore_button_click',
                    text: {
                        type: 'plain_text',
                        text: '⚡️ Explore in Lightdash',
                        emoji: true,
                    },
                },
            ],
        },
    ];
}

export function getDeepLinkBlocks(
    agentUuid: string,
    slackPrompt: SlackPrompt,
    siteUrl: string,
    artifacts?: AiArtifact[],
): (Block | KnownBlock)[] {
    // TODO: Assuming each thread has just one artifact for now
    // Show debug link when there are artifacts to inspect
    if (!artifacts || artifacts.length === 0) {
        return [];
    }

    // Check if any artifacts have dashboard configs
    const hasDashboard = artifacts.some((artifact) => artifact.dashboardConfig);

    // Add prominent dashboard link if dashboard artifact exists
    if (hasDashboard) {
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `📊 <${siteUrl}/projects/${slackPrompt.projectUuid}/ai-agents/${agentUuid}/threads/${slackPrompt.threadUuid}|View Dashboard in Lightdash ⚡️>`,
                },
            },
        ];
    }

    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `<${siteUrl}/projects/${slackPrompt.projectUuid}/ai-agents/${agentUuid}/threads/${slackPrompt.threadUuid}/messages/${slackPrompt.promptUuid}/debug|View message data in Lightdash ⚡️>`,
            },
        },
    ];
}

export function getProposeChangeBlocks(
    slackPrompt: SlackPrompt,
    siteUrl: string,
    toolResults?: AiAgentToolResult[],
): (Block | KnownBlock)[] {
    if (!toolResults || toolResults.length === 0) {
        return [];
    }

    const proposeChangeResults = toolResults.filter(
        (result) => result.toolName === 'proposeChange',
    );

    if (proposeChangeResults.length === 0) {
        return [];
    }

    const [successes, failures] = partition(
        proposeChangeResults,
        (r) => r.metadata.status === 'success',
    );

    return [
        {
            type: 'divider',
        },
        {
            type: 'context',
            elements: [
                ...successes.map((success) => ({
                    type: 'plain_text' as const,
                    text: `✅ ${success.result}`,
                })),
                ...failures.map((failure) => ({
                    type: 'plain_text' as const,
                    text: `❌ ${failure.result}`,
                })),
            ],
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    url: `${siteUrl}/generalSettings/projectManagement/${slackPrompt.projectUuid}/changesets`,
                    action_id: 'actions.view_changesets_button_click',
                    text: {
                        type: 'plain_text',
                        text: 'View Changeset',
                    },
                },
            ],
        },
    ];
}
