import {
    AllMiddlewareArgs,
    App,
    Block,
    KnownBlock,
    SlackEventMiddlewareArgs,
} from '@slack/bolt';
import { SlackBot, SlackBotArguments } from '../../../clients/Slack/Slackbot';
import Logger from '../../../logging/logger';
import { AiModel } from '../../models/AiModel';
import { CommercialSlackAuthenticationModel } from '../../models/CommercialSlackAuthenticationModel';
import { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { AiService } from '../../services/AiService/AiService';
import {
    FollowUpTools,
    followUpToolsText,
} from '../../services/AiService/utils/aiCopilot/followUpTools';
import {
    AiDuplicateSlackPromptError,
    AiSlackMappingNotFoundError,
} from '../../services/AiService/utils/errors';

type CommercialSlackBotArguments = SlackBotArguments & {
    schedulerClient: CommercialSchedulerClient;
    aiService: AiService;
    aiModel: AiModel;
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
};

export class CommercialSlackBot extends SlackBot {
    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly aiService: AiService;

    private readonly aiModel: AiModel;

    slackAuthenticationModel: CommercialSlackAuthenticationModel;

    constructor(args: CommercialSlackBotArguments) {
        super(args);
        this.schedulerClient = args.schedulerClient;
        this.aiService = args.aiService;
        this.aiModel = args.aiModel;
        this.slackAuthenticationModel = args.slackAuthenticationModel;
    }

    protected addEventListeners(app: App) {
        super.addEventListeners(app);

        if (this.lightdashConfig.ai.copilot.enabled) {
            app.event('app_mention', (m) => this.handleAppMention(m));
            this.handlePromptUpvote(app);
            this.handlePromptDownvote(app);
            this.handleClickExploreButton(app);
            this.handleExecuteFollowUpTool(app);
        } else {
            Logger.info(
                'AI Copilot is disabled, skipping event listener registration',
            );
        }
    }

    private static replaceSlackBlockByBlockId(
        blocks: (Block | KnownBlock)[],
        blockId: string,
        newBlock: Block | KnownBlock,
    ) {
        return blocks.map((block) => {
            if ('block_id' in block && block.block_id === blockId) {
                return newBlock;
            }
            return block;
        });
    }

    // TODO: remove this once we have analytics tracking
    // eslint-disable-next-line class-methods-use-this
    private handleClickExploreButton(app: App) {
        app.action('actions.explore_button_click', async ({ ack, body }) => {
            await ack();
            // TODO: add analytics tracking
            // console.log(JSON.stringify(body, null, 2));
        });
    }

    private handlePromptUpvote(app: App) {
        app.action(
            'prompt_human_score.upvote',
            async ({ ack, body, respond }) => {
                await ack();
                const { user } = body;
                const newBlock = {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `<@${user.id}> upvoted this answer :thumbsup:`,
                        },
                    ],
                };
                if (body.type === 'block_actions') {
                    const action = body.actions[0];
                    if (action && action.type === 'button') {
                        const promptUuid = action.value;
                        if (!promptUuid) {
                            return;
                        }
                        await this.aiService.updateHumanScoreForPrompt(
                            promptUuid,
                            1,
                        );
                    }
                    const { message } = body;
                    if (message) {
                        const { blocks } = message;

                        await respond({
                            replace_original: true,
                            blocks: CommercialSlackBot.replaceSlackBlockByBlockId(
                                blocks,
                                'prompt_human_score',
                                newBlock,
                            ),
                        });
                    }
                }
            },
        );
    }

    private handlePromptDownvote(app: App) {
        app.action(
            'prompt_human_score.downvote',
            async ({ ack, body, respond }) => {
                await ack();
                const { user } = body;
                const newBlock = {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: `<@${user.id}> downvoted this answer :thumbsdown:`,
                        },
                    ],
                };
                if (body.type === 'block_actions') {
                    const action = body.actions[0];
                    if (action && action.type === 'button') {
                        const promptUuid = action.value;
                        if (!promptUuid) {
                            return;
                        }
                        await this.aiService.updateHumanScoreForPrompt(
                            promptUuid,
                            -1,
                        );
                        const { message } = body;
                        if (message) {
                            const { blocks } = message;

                            await respond({
                                replace_original: true,
                                blocks: CommercialSlackBot.replaceSlackBlockByBlockId(
                                    blocks,
                                    'prompt_human_score',
                                    newBlock,
                                ),
                            });
                        }
                    }
                }
            },
        );
    }

    private handleExecuteFollowUpTool(app: App) {
        Object.values(FollowUpTools).forEach((tool) => {
            app.action(
                `execute_follow_up_tool.${tool}`,
                async ({ ack, body, context, say }) => {
                    await ack();

                    const { type, user, channel } = body;

                    if (type === 'block_actions') {
                        const action = body.actions[0];

                        if (
                            action.action_id.includes(tool) &&
                            action.type === 'button'
                        ) {
                            const prevSlackPromptUuid = action.value;

                            if (!prevSlackPromptUuid || !say) {
                                return;
                            }
                            const prevSlackPrompt =
                                await this.aiModel.findSlackPrompt(
                                    prevSlackPromptUuid,
                                );
                            if (!prevSlackPrompt) return;

                            const response = await say({
                                thread_ts: prevSlackPrompt.slackThreadTs,
                                text: `${followUpToolsText[tool]}`,
                            });

                            const { teamId } = context;

                            if (
                                !teamId ||
                                !context.botUserId ||
                                !channel ||
                                !response.message?.text ||
                                !response.ts
                            ) {
                                return;
                            }
                            // TODO: Remove this when implementing slack user mapping
                            const userUuid =
                                await this.slackAuthenticationModel.getUserUuid(
                                    teamId,
                                );

                            let slackPromptUuid: string;

                            try {
                                [slackPromptUuid] =
                                    await this.aiService.createSlackPrompt({
                                        userUuid,
                                        projectUuid:
                                            prevSlackPrompt.projectUuid,
                                        slackUserId: context.botUserId,
                                        slackChannelId: channel.id,
                                        slackThreadTs:
                                            prevSlackPrompt.slackThreadTs,
                                        prompt: response.message.text,
                                        promptSlackTs: response.ts,
                                    });
                            } catch (e) {
                                if (e instanceof AiDuplicateSlackPromptError) {
                                    Logger.debug(
                                        'Failed to create slack prompt:',
                                        e,
                                    );
                                    return;
                                }

                                throw e;
                            }

                            if (response.ts) {
                                await this.aiModel.updateSlackResponseTs({
                                    promptUuid: slackPromptUuid,
                                    responseSlackTs: response.ts,
                                });
                            }

                            await this.schedulerClient.slackAiPrompt({
                                slackPromptUuid,
                            });
                        }
                    }
                },
            );
        });
    }

    private async handleAppMention({
        event,
        context,
        say,
    }: SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs) {
        Logger.info(`Got app_mention event ${event.text}`);

        const { teamId } = context;
        if (!teamId || !event.user) {
            return;
        }
        const userUuid = await this.slackAuthenticationModel.getUserUuid(
            teamId,
        );

        const organizationUuid =
            await this.slackAuthenticationModel.getOrganizationUuidFromTeamId(
                teamId,
            );

        let slackPromptUuid: string;
        let createdThread: boolean;

        try {
            const projectSettings =
                await this.slackAuthenticationModel.getProjectSettingsForSlackChannelId(
                    organizationUuid,
                    event.channel,
                );
            [slackPromptUuid, createdThread] =
                await this.aiService.createSlackPrompt({
                    userUuid,
                    projectUuid: projectSettings.projectUuid,
                    slackUserId: event.user,
                    slackChannelId: event.channel,
                    slackThreadTs: event.thread_ts,
                    prompt: event.text,
                    promptSlackTs: event.ts,
                });
        } catch (e) {
            if (e instanceof AiDuplicateSlackPromptError) {
                Logger.debug('Failed to create slack prompt:', e);
                return;
            }

            if (e instanceof AiSlackMappingNotFoundError) {
                Logger.debug('Failed to find slack mapping:', e);
                return;
            }

            throw e;
        }

        const postedMessage = await say({
            thread_ts: event.ts,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: createdThread
                            ? `Hi <@${event.user}>, working on your request now :rocket:`
                            : `Let me check that for you. One moment! :books:`,
                    },
                },
                {
                    type: 'divider',
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'plain_text',
                            text: `It can take up to 15s to get a response.`,
                        },
                        {
                            type: 'plain_text',
                            text: `Reference: ${slackPromptUuid}`,
                        },
                    ],
                },
            ],
        });

        if (postedMessage.ts) {
            await this.aiModel.updateSlackResponseTs({
                promptUuid: slackPromptUuid,
                responseSlackTs: postedMessage.ts,
            });
        }

        await this.schedulerClient.slackAiPrompt({
            slackPromptUuid,
        });
    }
}
