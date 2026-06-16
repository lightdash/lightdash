import {
    AiAgent,
    AiAgentMessageAssistantArtifact,
    AiAgentToolResult,
    AiArtifact,
    FollowUpTools,
    followUpToolsText,
    isToolEditDbtProjectResult,
    isToolProposeChangeResult,
    isToolSetupPreviewDeployResult,
    parseVizConfig,
    SlackPrompt,
    type Explore,
} from '@lightdash/common';
import { Block, KnownBlock } from '@slack/bolt';
import { partition } from 'lodash';
import type { SlackStreamChunk } from '../../../../clients/Slack/SlackClient';
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

const TOOL_TASK_TITLES: Record<string, string> = {
    loadProjectContext: 'Reading project context',
    findExplores: 'Finding data model',
    findFields: 'Choosing fields',
    searchSemanticLayer: 'Searching metrics',
    listWarehouseTables: 'Checking warehouse tables',
    describeWarehouseTable: 'Inspecting table',
    findContent: 'Searching saved content',
    readContent: 'Reading saved content',
    getDashboardCharts: 'Reading dashboard',
    runContentQuery: 'Running saved-content query',
    runSavedChart: 'Running saved chart',
    runQuery: 'Running query',
    runSql: 'Reviewing SQL',
    discoverFields: 'Choosing fields',
    generateVisualization: 'Building chart',
    generateDashboard: 'Creating dashboard',
    createContent: 'Saving content',
    editContent: 'Updating content',
    proposeChange: 'Drafting semantic-layer change',
    editDbtProject: 'Opening dbt project PR',
    setupPreviewDeploy: 'Preparing preview deploy',
    listKnowledgeDocuments: 'Checking project knowledge',
    getKnowledgeDocumentContent: 'Reading project knowledge',
    readPinnedThread: 'Reading pinned conversation',
    repoShell: 'Reading repository',
    listProjects: 'Checking projects',
    getProjectInfo: 'Reading project',
};

const truncateTaskText = (text: string, maxLength = 256) =>
    text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;

const truncateCardText = (text: string, maxLength: number) =>
    text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;

const getSlackTaskId = (toolName: string) =>
    toolName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);

const normalizeTaskCopy = (text: string) =>
    text
        .trim()
        .replace(/[.!?]+$/g, '')
        .toLowerCase();

export const getSlackToolTitle = (toolName: string): string => {
    if (toolName.startsWith('editDbtProject:')) {
        return toolName.replace('editDbtProject:', '');
    }
    return (
        TOOL_TASK_TITLES[toolName] ??
        toolName
            .replace(/^mcp_?/, '')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[_-]+/g, ' ')
            .replace(/^./, (char) => char.toUpperCase())
    );
};

export const buildSlackTaskUpdate = ({
    toolName,
    taskId,
    status,
    details,
    output,
}: {
    toolName: string;
    taskId?: string;
    status: 'pending' | 'in_progress' | 'complete' | 'error';
    details?: string;
    output?: string;
}): SlackStreamChunk => {
    const title = getSlackToolTitle(toolName);
    const resolvedDetails =
        details && normalizeTaskCopy(details) !== normalizeTaskCopy(title)
            ? details
            : undefined;
    const resolvedOutput =
        output && normalizeTaskCopy(output) !== normalizeTaskCopy(title)
            ? output
            : undefined;

    return {
        type: 'task_update',
        id: getSlackTaskId(taskId ?? toolName),
        title,
        status,
        ...(resolvedDetails
            ? { details: truncateTaskText(resolvedDetails) }
            : {}),
        ...(resolvedOutput ? { output: truncateTaskText(resolvedOutput) } : {}),
    };
};

export const buildFeedbackContextActions = (
    promptUuid: string,
): (Block | KnownBlock)[] => [
    {
        block_id: 'prompt_human_score',
        type: 'context_actions',
        elements: [
            {
                type: 'feedback_buttons',
                action_id: 'prompt_human_score.feedback',
                positive_button: {
                    text: {
                        type: 'plain_text',
                        text: 'Good',
                    },
                    accessibility_label: 'Submit positive feedback',
                    value: JSON.stringify({
                        promptUuid,
                        score: 1,
                    }),
                },
                negative_button: {
                    text: {
                        type: 'plain_text',
                        text: 'Bad',
                    },
                    accessibility_label: 'Submit negative feedback',
                    value: JSON.stringify({
                        promptUuid,
                        score: -1,
                    }),
                },
            },
        ],
    } as unknown as Block,
];

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

const parseGithubPrUrl = (prUrl: string) => {
    try {
        const url = new URL(prUrl);
        const [, owner, repo, kind, number] = url.pathname.split('/');
        if (url.hostname !== 'github.com' || kind !== 'pull') {
            return undefined;
        }
        return { owner, repo, number, repository: `${owner}/${repo}` };
    } catch {
        return undefined;
    }
};

const buildSlackCardBlock = ({
    blockId,
    title,
    subtitle,
    body,
    subtext,
    heroImageUrl,
    actions,
}: {
    blockId: string;
    title: string;
    subtitle?: string;
    body?: string;
    subtext?: string;
    heroImageUrl?: string;
    actions?: Array<{
        type: 'button';
        url?: string;
        style?: 'primary' | 'danger';
        action_id: string;
        text: {
            type: 'plain_text';
            text: string;
            emoji?: boolean;
        };
    }>;
}): Block =>
    ({
        type: 'card',
        block_id: blockId,
        title: {
            type: 'mrkdwn',
            text: truncateCardText(title, 150),
            verbatim: false,
        },
        ...(subtitle
            ? {
                  subtitle: {
                      type: 'mrkdwn',
                      text: truncateCardText(subtitle, 150),
                      verbatim: false,
                  },
              }
            : {}),
        ...(body
            ? {
                  body: {
                      type: 'mrkdwn',
                      text: truncateCardText(body, 200),
                      verbatim: false,
                  },
              }
            : {}),
        ...(subtext
            ? {
                  subtext: {
                      type: 'mrkdwn',
                      text: truncateCardText(subtext, 200),
                      verbatim: false,
                  },
              }
            : {}),
        ...(heroImageUrl
            ? {
                  hero_image: {
                      type: 'image',
                      image_url: heroImageUrl,
                      alt_text: title,
                  },
              }
            : {}),
        ...(actions?.length ? { actions: actions.slice(0, 3) } : {}),
    }) as unknown as Block;

const getArtifactTitle = (artifact: AiArtifact) =>
    artifact.title ||
    (artifact.artifactType === 'dashboard'
        ? 'Lightdash dashboard'
        : 'Lightdash chart');

export async function getModernArtifactCardBlocks(
    slackPrompt: SlackPrompt,
    siteUrl: string,
    maxQueryLimit: number,
    createShareUrl: (path: string, params: string) => Promise<string>,
    getExplore: (exploreName: string) => Promise<Explore>,
    agentUuid?: string,
    artifacts?: AiArtifact[],
    toolResults?: AiAgentToolResult[],
): Promise<(Block | KnownBlock)[]> {
    if (!artifacts || artifacts.length === 0) {
        return [];
    }

    const chartImageUrls = (toolResults ?? [])
        .filter(
            (result) =>
                result.toolType === 'built-in' &&
                ['runQuery', 'generateVisualization'].includes(
                    result.toolName,
                ) &&
                result.metadata?.status === 'success',
        )
        .map(
            (result) =>
                (result.metadata as { chartImageUrl?: string | null })
                    .chartImageUrl,
        )
        .filter((url): url is string => Boolean(url));
    const chartArtifacts = artifacts
        .slice(0, 3)
        .filter((artifact) => Boolean(artifact.chartConfig));

    const blocks = await Promise.all(
        artifacts.slice(0, 3).map(async (artifact, index) => {
            if (artifact.chartConfig) {
                const vizConfig = parseVizConfig(
                    artifact.chartConfig,
                    maxQueryLimit,
                );
                if (!vizConfig) {
                    return undefined;
                }

                const explore = await getExplore(
                    vizConfig.metricQuery.exploreName,
                );
                const additionalMetricsWithSql = populateCustomMetricsSQL(
                    vizConfig.metricQuery.additionalMetrics,
                    explore,
                );
                const additionalMetricFieldIds = additionalMetricsWithSql.map(
                    (m) => `${m.table}_${m.name}`,
                );
                const tableCalculationNames =
                    vizConfig.metricQuery.tableCalculations.map(
                        (tc) => tc.name,
                    );
                const columnOrder = [
                    ...vizConfig.metricQuery.dimensions,
                    ...vizConfig.metricQuery.metrics,
                    ...additionalMetricFieldIds,
                    ...tableCalculationNames,
                ];

                const path = `/projects/${slackPrompt.projectUuid}/tables/${vizConfig.metricQuery.exploreName}`;
                const params = `?create_saved_chart_version=${encodeURIComponent(
                    JSON.stringify({
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
                    }),
                )}`;

                const exploreUrl = await createShareUrl(path, params).catch(
                    () => `${siteUrl}${path}${params}`,
                );

                const metricCount =
                    vizConfig.metricQuery.metrics.length +
                    additionalMetricsWithSql.length;
                const dimensionCount = vizConfig.metricQuery.dimensions.length;
                const chartImageUrl =
                    chartImageUrls[
                        chartArtifacts.findIndex(
                            (chartArtifact) =>
                                chartArtifact.artifactUuid ===
                                artifact.artifactUuid,
                        )
                    ];

                return buildSlackCardBlock({
                    blockId: `ai_agent_chart_card_${artifact.artifactUuid}`,
                    title: getArtifactTitle(artifact),
                    subtitle: `${vizConfig.metricQuery.exploreName} chart`,
                    heroImageUrl: chartImageUrl,
                    body:
                        artifact.description ||
                        `${metricCount} metric${
                            metricCount === 1 ? '' : 's'
                        } by ${dimensionCount} dimension${
                            dimensionCount === 1 ? '' : 's'
                        }.`,
                    subtext: 'Open in Lightdash to inspect, save, or refine.',
                    actions: [
                        ...(chartImageUrl
                            ? [
                                  {
                                      type: 'button' as const,
                                      url: chartImageUrl,
                                      action_id: `actions.open_chart_image_button_click.${index}`,
                                      text: {
                                          type: 'plain_text' as const,
                                          text: 'Open image',
                                      },
                                  },
                              ]
                            : []),
                        {
                            type: 'button',
                            url: exploreUrl,
                            style: 'primary',
                            action_id: `actions.explore_card_button_click.${index}`,
                            text: {
                                type: 'plain_text',
                                text: 'Explore in Lightdash',
                            },
                        },
                    ],
                });
            }

            if (artifact.dashboardConfig && agentUuid) {
                return buildSlackCardBlock({
                    blockId: `ai_agent_dashboard_card_${artifact.artifactUuid}`,
                    title: getArtifactTitle(artifact),
                    subtitle: 'Lightdash dashboard',
                    body:
                        artifact.description ||
                        'Generated dashboard artifact from this conversation.',
                    subtext: 'Open in Lightdash to inspect and continue.',
                    actions: [
                        {
                            type: 'button',
                            url: `${siteUrl}/projects/${slackPrompt.projectUuid}/ai-agents/${agentUuid}/threads/${slackPrompt.threadUuid}`,
                            style: 'primary',
                            action_id: `actions.view_dashboard_card_button_click.${index}`,
                            text: {
                                type: 'plain_text',
                                text: 'View dashboard',
                            },
                        },
                    ],
                });
            }

            return undefined;
        }),
    );

    return blocks.filter((block): block is Block => Boolean(block));
}

// Tool names whose successful results count as "an answer the user can score".
// Discovery tools (findExplores, findFields, listWarehouseTables,
// describeWarehouseTable) are deliberately excluded — they don't deliver a
// final answer, only context for the agent.
const ANSWER_PRODUCING_TOOLS = new Set([
    'generateVisualization',
    'runQuery',
    'runContentQuery',
    'runSql',
    'runSavedChart',
    'generateDashboard',
    'editDbtProject',
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

    const proposeChangeResults = toolResults.filter(isToolProposeChangeResult);

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

export function getEditDbtProjectBlocks(
    toolResults?: AiAgentToolResult[],
): (Block | KnownBlock)[] {
    if (!toolResults || toolResults.length === 0) {
        return [];
    }

    const prUrls = toolResults
        .filter(isToolEditDbtProjectResult)
        .map((result) =>
            result.metadata.status === 'success' ? result.metadata.prUrl : null,
        )
        .filter((prUrl): prUrl is string => Boolean(prUrl));

    if (prUrls.length === 0) {
        return [];
    }

    return [
        {
            type: 'divider',
        },
        {
            type: 'actions',
            elements: prUrls.map((prUrl, index) => ({
                type: 'button',
                url: prUrl,
                style: 'primary',
                action_id: `actions.view_pull_request_button_click.${index}`,
                text: {
                    type: 'plain_text',
                    text: 'View pull request',
                },
            })),
        },
    ];
}

export function getModernPullRequestCardBlocks(
    toolResults?: AiAgentToolResult[],
): (Block | KnownBlock)[] {
    if (!toolResults || toolResults.length === 0) {
        return [];
    }

    const cards: (Block | KnownBlock)[] = [];

    toolResults.forEach((result, index) => {
        if (
            isToolEditDbtProjectResult(result) &&
            result.metadata.status === 'success' &&
            result.metadata.prUrl
        ) {
            const pr = parseGithubPrUrl(result.metadata.prUrl);
            const action =
                result.metadata.prAction === 'updated' ? 'Updated' : 'Opened';
            const diffParts = [
                typeof result.metadata.additions === 'number'
                    ? `+${result.metadata.additions}`
                    : undefined,
                typeof result.metadata.deletions === 'number'
                    ? `-${result.metadata.deletions}`
                    : undefined,
            ].filter(Boolean);
            const commit = result.metadata.commitSha?.slice(0, 7);
            const body = [
                diffParts.length ? diffParts.join(' ') : undefined,
                commit ? `commit \`${commit}\`` : undefined,
            ]
                .filter(Boolean)
                .join(' · ');
            const actions = [
                {
                    type: 'button' as const,
                    url: result.metadata.prUrl,
                    action_id: `actions.view_pull_request_card_button_click.${index}`,
                    text: {
                        type: 'plain_text' as const,
                        text: 'PR',
                    },
                },
                ...(result.metadata.previewUrl
                    ? [
                          {
                              type: 'button' as const,
                              url: result.metadata.previewUrl,
                              style: 'primary' as const,
                              action_id: `actions.view_preview_card_button_click.${index}`,
                              text: {
                                  type: 'plain_text' as const,
                                  text: 'Preview',
                              },
                          },
                      ]
                    : []),
            ];

            cards.push(
                buildSlackCardBlock({
                    blockId: `ai_agent_pr_card_${result.uuid}`,
                    title: `${action} pull request${
                        pr?.number ? ` #${pr.number}` : ''
                    }`,
                    subtitle: pr?.repository,
                    body: body || 'Semantic-layer changes are ready to review.',
                    subtext: 'Review the diff before merging.',
                    actions,
                }),
            );
            return;
        }

        if (
            isToolSetupPreviewDeployResult(result) &&
            result.metadata.status === 'success' &&
            result.metadata.prUrl
        ) {
            const pr = parseGithubPrUrl(result.metadata.prUrl);
            cards.push(
                buildSlackCardBlock({
                    blockId: `ai_agent_preview_pr_card_${result.uuid}`,
                    title: `Opened preview deploy PR${
                        pr?.number ? ` #${pr.number}` : ''
                    }`,
                    subtitle: pr?.repository,
                    body: 'Adds the Lightdash preview-project GitHub Actions workflow.',
                    subtext: 'Add the required GitHub secrets before merging.',
                    actions: [
                        {
                            type: 'button',
                            url: result.metadata.prUrl,
                            style: 'primary',
                            action_id: `actions.view_preview_deploy_pr_card_button_click.${index}`,
                            text: {
                                type: 'plain_text',
                                text: 'PR',
                            },
                        },
                    ],
                }),
            );
        }
    });

    return cards;
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

// At or below this many projects we render quick-tap buttons; above it we fall
// back to a dropdown to avoid a wall of buttons.
const PROJECT_SELECTION_BUTTON_THRESHOLD = 3;

export function getProjectSelectionBlocks(
    projects: { projectUuid: string; name: string }[],
    channelId: string,
): (Block | KnownBlock)[] {
    const truncateText = (text: string, maxLength: number): string => {
        if (text.length <= maxLength) return text;
        return `${text.substring(0, maxLength - 3)}...`;
    };

    const promptBlock: Block | KnownBlock = {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: ':open_file_folder: *Which project would you like to use?*\n\nThis organization has multiple projects, so pick the one I should work in.',
        },
    };

    // Slack caps static_select option values at 150 chars.
    const buildSelectionValue = (project: {
        projectUuid: string;
        name: string;
    }): string =>
        JSON.stringify({
            p: project.projectUuid,
            c: channelId,
            n: truncateText(project.name, 50),
        });

    // Few projects: one button each for a single tap.
    if (projects.length <= PROJECT_SELECTION_BUTTON_THRESHOLD) {
        return [
            promptBlock,
            {
                type: 'actions',
                block_id: 'project_selection',
                elements: projects.map((project, index) => ({
                    type: 'button',
                    // Unique per button; handler matches the select_project prefix.
                    action_id: `select_project:${index}`,
                    // Slack caps button text at 75 characters.
                    text: {
                        type: 'plain_text',
                        text: truncateText(project.name, 75),
                    },
                    value: buildSelectionValue(project),
                })),
            },
        ];
    }

    // Many projects: a dropdown keeps the message compact.
    return [
        promptBlock,
        {
            type: 'actions',
            block_id: 'project_selection',
            elements: [
                {
                    type: 'static_select',
                    action_id: 'select_project',
                    placeholder: {
                        type: 'plain_text',
                        text: 'Choose a project...',
                    },
                    // Slack caps option text at 75 characters.
                    options: projects.map((project) => ({
                        text: {
                            type: 'plain_text',
                            text: truncateText(project.name, 75),
                        },
                        value: buildSelectionValue(project),
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
