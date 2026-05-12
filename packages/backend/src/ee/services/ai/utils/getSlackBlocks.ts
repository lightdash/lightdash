import {
    AiAgent,
    AiAgentMessageAssistantArtifact,
    AiAgentToolResult,
    AiArtifact,
    FollowUpTools,
    followUpToolsText,
    parseVizConfig,
    SlackPrompt,
    type Explore,
} from '@lightdash/common';
import { Block, KnownBlock } from '@slack/bolt';
import { partition } from 'lodash';
import { populateCustomMetricsSQL } from './populateCustomMetricsSQL';

const SLACK_SECTION_TEXT_LIMIT = 3000;

/**
 * Splits text into chunks that fit within Slack's section block text limit (3000 chars).
 * Splits at markdown-safe boundaries to avoid breaking links, code blocks, or formatting.
 * Priority: newlines > spaces > hard cut (as last resort).
 */
const findSplitIndex = (window: string): { index: number; skip: number } => {
    // Try to split at the last newline within the limit
    const newlineIdx = window.lastIndexOf('\n');
    if (newlineIdx > 0) {
        return { index: newlineIdx, skip: 1 };
    }

    // Fall back to the last space
    const spaceIdx = window.lastIndexOf(' ');
    if (spaceIdx > 0) {
        return { index: spaceIdx, skip: 1 };
    }

    // Hard cut as last resort (no whitespace at all in 3000 chars)
    return { index: SLACK_SECTION_TEXT_LIMIT, skip: 0 };
};

const chunkSlackText = (text: string): string[] => {
    if (text.length <= SLACK_SECTION_TEXT_LIMIT) {
        return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= SLACK_SECTION_TEXT_LIMIT) {
            chunks.push(remaining);
            break;
        }

        const window = remaining.slice(0, SLACK_SECTION_TEXT_LIMIT);
        const { index, skip } = findSplitIndex(window);

        chunks.push(remaining.slice(0, index));
        remaining = remaining.slice(index + skip);
    }

    return chunks;
};

/**
 * Converts text into Slack section blocks, splitting long text
 * into multiple blocks to stay within Slack's 3000 character limit.
 */
export const getTextBlocks = (
    text: string,
    format: 'mrkdwn' | 'plain_text' = 'mrkdwn',
): (Block | KnownBlock)[] =>
    chunkSlackText(text).map((chunk) => ({
        type: 'section' as const,
        text: {
            type: format,
            text: chunk,
        },
    }));

/**
 * Converts standard markdown into Slack `markdown` blocks. Unlike `mrkdwn`
 * inside a section block, the markdown block natively renders GitHub-flavoured
 * markdown including tables, task lists, code blocks with language hints, etc.
 *
 * Pass the agent's raw markdown response here — no slackifyMarkdown needed.
 */
export const getMarkdownBlocks = (text: string): (Block | KnownBlock)[] =>
    chunkSlackText(text).map(
        (chunk) =>
            ({
                type: 'markdown',
                text: chunk,
            }) as unknown as Block,
    );

/**
 * Returns compact Slack blocks showing a "thinking" animation with a GIF.
 * Uses context block for smaller, dimmed text appearance.
 * Used while the AI agent is processing a request.
 *
 * @param text - Custom progress text to display (e.g., "Running your query...")
 * @param siteUrl - The base URL of the Lightdash instance
 */
export function getThinkingBlocks(
    text: string,
    siteUrl: string,
): (Block | KnownBlock)[] {
    return [
        {
            type: 'context',
            elements: [
                {
                    type: 'image',
                    image_url: `${siteUrl}/lightdash-bolt-pixelating.gif`,
                    alt_text: text,
                },
                {
                    type: 'mrkdwn',
                    text: `_${text}_`,
                },
            ],
        },
    ];
}

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
                    action_id: `view_artifact_${artifact.artifactUuid}`,
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

// Tool names whose successful results count as "an answer the user can score".
// Discovery tools (findExplores, findFields, listWarehouseTables,
// describeWarehouseTable) are deliberately excluded — they don't deliver a
// final answer, only context for the agent.
const ANSWER_PRODUCING_TOOLS = new Set([
    'runQuery',
    'runSql',
    'runSavedChart',
    'generateDashboard',
]);

// One compact footer: small "How did I do?" header + a single row with
// thumbs and the chat permalink. Only rendered when at least one
// answer-producing tool succeeded for this prompt.
export function getFeedbackBlocks(
    slackPrompt: SlackPrompt,
    toolResults: AiAgentToolResult[],
    agentUuid: string,
    siteUrl: string,
): (Block | KnownBlock)[] {
    const hasAnswer = toolResults.some(
        (r) =>
            ANSWER_PRODUCING_TOOLS.has(r.toolName) &&
            (r.metadata as { status?: string } | null)?.status === 'success',
    );
    if (!hasAnswer) return [];

    const threadUrl = `${siteUrl}/projects/${slackPrompt.projectUuid}/ai-agents/${agentUuid}/threads/${slackPrompt.threadUuid}`;
    return [
        {
            block_id: 'prompt_human_score',
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: '👍', emoji: true },
                    value: slackPrompt.promptUuid,
                    action_id: 'prompt_human_score.upvote',
                },
                {
                    type: 'button',
                    text: { type: 'plain_text', text: '👎', emoji: true },
                    value: slackPrompt.promptUuid,
                    action_id: 'prompt_human_score.downvote',
                },
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'View chat in Lightdash',
                    },
                    url: threadUrl,
                    action_id: 'view_chat_in_lightdash',
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
    getExplore: (exploreName: string) => Promise<Explore>,
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

    // Get explore to populate SQL for additional metrics
    const explore = await getExplore(vizConfig.metricQuery.exploreName);
    const additionalMetricsWithSql = populateCustomMetricsSQL(
        vizConfig.metricQuery.additionalMetrics,
        explore,
    );

    // Build column order including all field types
    const additionalMetricFieldIds = additionalMetricsWithSql.map(
        (m) => `${m.table}_${m.name}`,
    );
    const tableCalculationNames = vizConfig.metricQuery.tableCalculations.map(
        (tc) => tc.name,
    );
    const columnOrder = [
        ...vizConfig.metricQuery.dimensions,
        ...vizConfig.metricQuery.metrics,
        ...additionalMetricFieldIds,
        ...tableCalculationNames,
    ];

    const configState = {
        tableName: vizConfig.metricQuery.exploreName,
        metricQuery: {
            ...vizConfig.metricQuery,
            additionalMetrics: additionalMetricsWithSql,
        },
        tableConfig: {
            columnOrder,
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
    // Prominent "View Dashboard" link only — the regular "View chat in
    // Lightdash" link now lives inside the unified feedback row.
    if (!artifacts || artifacts.length === 0) return [];
    const hasDashboard = artifacts.some((artifact) => artifact.dashboardConfig);
    if (!hasDashboard) return [];
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
    shouldSkipForwardingQuery = false,
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
                            shouldSkipForwardingQuery,
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
                            shouldSkipForwardingQuery,
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
