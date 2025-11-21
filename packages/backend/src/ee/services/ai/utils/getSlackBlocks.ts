import {
    AiAgent,
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

export async function getArtifactBlocks(
    slackPrompt: SlackPrompt,
    siteUrl: string,
    maxQueryLimit: number,
    createShareUrl: (path: string, params: string) => Promise<string>,
    artifacts?: AiArtifact[],
): Promise<(Block | KnownBlock)[]> {
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

    const path = `/projects/${slackPrompt.projectUuid}/tables/${vizConfig.metricQuery.exploreName}`;
    const params = `?create_saved_chart_version=${encodeURIComponent(
        JSON.stringify(configState),
    )}`;

    let exploreUrl: string;
    try {
        exploreUrl = await createShareUrl(path, params);
    } catch {
        // Fall back to full URL if share creation fails
        exploreUrl = `${siteUrl}${path}${params}`;
    }

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

export function getAgentSelectionBlocks(
    agents: AiAgent[],
    channelId: string,
    projectMap?: Map<string, string>,
): (Block | KnownBlock)[] {
    if (agents.length === 0) {
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: ':warning: *No AI agents are available in this channel.*\n\nPlease contact your workspace administrator to configure agents.',
                },
            },
        ];
    }

    const truncateText = (text: string | null, maxLength: number): string => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return `${text.substring(0, maxLength - 3)}...`;
    };

    // Group agents by project if projectMap is provided
    const shouldGroupByProject = projectMap && projectMap.size > 0;

    if (shouldGroupByProject) {
        // Group agents by projectUuid
        const agentsByProject = new Map<string, AiAgent[]>();
        for (const agent of agents) {
            const { projectUuid } = agent;
            if (!agentsByProject.has(projectUuid)) {
                agentsByProject.set(projectUuid, []);
            }
            agentsByProject.get(projectUuid)!.push(agent);
        }

        // Create option groups
        const optionGroups = Array.from(agentsByProject.entries())
            .map(([projectUuid, projectAgents]) => {
                const projectName = projectMap.get(projectUuid) || projectUuid;
                return {
                    label: {
                        type: 'plain_text' as const,
                        // Slack has a 75 character limit for option group labels
                        text: truncateText(projectName, 75),
                    },
                    options: projectAgents.map((agent) => ({
                        text: {
                            type: 'plain_text' as const,
                            // Slack has a 75 character limit for option text
                            text: truncateText(agent.name, 75),
                        },
                        value: JSON.stringify({
                            agentUuid: agent.uuid,
                            channelId,
                        }),
                    })),
                };
            })
            .sort((a, b) => a.label.text.localeCompare(b.label.text)); // Sort groups alphabetically

        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: ':robot_face: *Which AI agent would you like to chat with?*\n\nSelect an agent to get started.',
                },
            },
            {
                type: 'actions',
                block_id: 'agent_selection',
                elements: [
                    {
                        type: 'static_select',
                        action_id: 'select_agent',
                        placeholder: {
                            type: 'plain_text',
                            text: 'Choose an agent...',
                        },
                        option_groups: optionGroups,
                    },
                ],
            },
        ];
    }

    // Fallback to flat list if no projectMap provided
    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: ':robot_face: *Which AI agent would you like to chat with?*\n\nSelect an agent to get started.',
            },
        },
        {
            type: 'actions',
            block_id: 'agent_selection',
            elements: [
                {
                    type: 'static_select',
                    action_id: 'select_agent',
                    placeholder: {
                        type: 'plain_text',
                        text: 'Choose an agent...',
                    },
                    options: agents.map((agent) => ({
                        text: {
                            type: 'plain_text',
                            // Slack has a 75 character limit for option text
                            text: truncateText(agent.name, 75),
                        },
                        value: JSON.stringify({
                            agentUuid: agent.uuid,
                            channelId,
                        }),
                    })),
                },
            ],
        },
    ];
}

export function getAgentConfirmationBlocks(
    agent: AiAgent,
    options?: {
        isMultiAgentChannel?: boolean;
        botMentionName?: string;
    },
): (Block | KnownBlock)[] {
    const { isMultiAgentChannel = false, botMentionName } = options || {};

    // Create helpful instructions based on channel type
    // For multi-agent channels, the tip will be shown after the AI response
    const instructionText = isMultiAgentChannel
        ? `You're now chatting with *${agent.name}*`
        : `You're now chatting with *${agent.name}*${
              botMentionName
                  ? `, tag ${botMentionName} to ask more questions`
                  : ', tag the app to ask more questions'
          }`;

    const blocks: (Block | KnownBlock)[] = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: instructionText,
            },
        },
    ];

    if (agent.description) {
        const truncateDescription = (text: string): string => {
            // Slack context elements have a limit of ~3000 chars
            const maxLength = 500;
            if (text.length <= maxLength) return text;
            return `${text.substring(0, maxLength - 3)}...`;
        };

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateDescription(agent.description),
            },
            ...(agent.imageUrl
                ? {
                      accessory: {
                          type: 'image',
                          image_url: agent.imageUrl,
                          alt_text: agent.name,
                      },
                  }
                : {}),
        });
    }

    blocks.push({
        type: 'divider',
    });

    return blocks;
}
