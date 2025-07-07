import {
    followUpToolsSchema,
    followUpToolsText,
    MetricQuery,
    parseVizConfig,
    SlackPrompt,
} from '@lightdash/common';
import { Block, KnownBlock } from '@slack/bolt';

export function getFollowUpToolBlocks(slackPrompt: SlackPrompt): KnownBlock[] {
    const { vizConfigOutput } = slackPrompt;
    const savedFollowUpTools =
        vizConfigOutput && 'followUpTools' in vizConfigOutput
            ? followUpToolsSchema.safeParse(vizConfigOutput.followUpTools).data
            : [];

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
): (Block | KnownBlock)[] {
    if (!slackPrompt.vizConfigOutput) {
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
): (Block | KnownBlock)[] {
    const { vizConfigOutput } = slackPrompt;
    if (!vizConfigOutput) {
        return [];
    }

    const vizConfig = parseVizConfig(vizConfigOutput, maxQueryLimit);
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
    slackPrompt: SlackPrompt,
    siteUrl: string,
): (Block | KnownBlock)[] {
    if (!slackPrompt.vizConfigOutput) {
        return [];
    }

    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `<${siteUrl}/projects/${slackPrompt.projectUuid}/ai/conversations/${slackPrompt.threadUuid}/${slackPrompt.promptUuid}|View message data in Lightdash ⚡️>`,
            },
        },
    ];
}
