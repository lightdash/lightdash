import {
    AiAgentNotFoundError,
    AiDuplicateSlackPromptError,
    FollowUpTools,
    followUpToolsText,
} from '@lightdash/common';
import {
    AllMiddlewareArgs,
    App,
    Block,
    KnownBlock,
    SlackEventMiddlewareArgs,
} from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { type MessageElement } from '@slack/web-api/dist/response/ConversationsHistoryResponse';
import {
    SlackClient,
    SlackClientArguments,
} from '../../../clients/Slack/SlackClient';
import Logger from '../../../logging/logger';
import { UnfurlService } from '../../../services/UnfurlService/UnfurlService';
import { AiAgentModel } from '../../models/AiAgentModel';
import { CommercialSlackAuthenticationModel } from '../../models/CommercialSlackAuthenticationModel';
import { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { AiAgentService } from '../../services/AiAgentService';

type CommercialSlackClientArguments = Omit<
    SlackClientArguments,
    'slackAuthenticationModel'
> & {
    schedulerClient: CommercialSchedulerClient;
    aiAgentModel: AiAgentModel;
    slackAuthenticationModel: CommercialSlackAuthenticationModel;
};

type ThreadMessageContext = Array<
    Required<Pick<MessageElement, 'text' | 'user' | 'ts'>>
>;

export class CommercialSlackClient extends SlackClient {
    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly aiAgentModel: AiAgentModel;

    slackAuthenticationModel: CommercialSlackAuthenticationModel;

    constructor(args: CommercialSlackClientArguments) {
        super(args);
        this.slackAuthenticationModel = args.slackAuthenticationModel;
        this.schedulerClient = args.schedulerClient;
        this.aiAgentModel = args.aiAgentModel;
    }

    public getRequiredScopes() {
        return [...super.getRequiredScopes(), 'channels:history'];
    }

    protected addEventListeners(
        app: App,
        unfurlService: UnfurlService,
        aiAgentService: AiAgentService,
    ) {
        if (!aiAgentService) {
            throw new Error(
                'AiAgentService is required for CommercialSlackClient',
            );
        }

        super.addEventListeners(app, unfurlService, aiAgentService);

        if (this.lightdashConfig.ai.copilot.enabled) {
            // TODO: all of the handlers should be in a service
            app.event('app_mention', (m) =>
                this.handleAppMention(m, aiAgentService),
            );
            CommercialSlackClient.handlePromptUpvote(app, aiAgentService);
            CommercialSlackClient.handlePromptDownvote(app, aiAgentService);
            CommercialSlackClient.handleClickExploreButton(app);
            this.handleExecuteFollowUpTool(app, aiAgentService);
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
    static handleClickExploreButton(app: App) {
        app.action('actions.explore_button_click', async ({ ack, body }) => {
            await ack();
        });
    }

    static handlePromptUpvote(app: App, aiAgentService: AiAgentService) {
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
                        await aiAgentService.updateHumanScoreForSlackPrompt(
                            promptUuid,
                            1,
                        );
                    }
                    const { message } = body;
                    if (message) {
                        const { blocks } = message;

                        await respond({
                            replace_original: true,
                            blocks: CommercialSlackClient.replaceSlackBlockByBlockId(
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

    static handlePromptDownvote(app: App, aiAgentService: AiAgentService) {
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
                        await aiAgentService.updateHumanScoreForSlackPrompt(
                            promptUuid,
                            -1,
                        );
                        const { message } = body;
                        if (message) {
                            const { blocks } = message;

                            await respond({
                                replace_original: true,
                                blocks: CommercialSlackClient.replaceSlackBlockByBlockId(
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

    private handleExecuteFollowUpTool(
        app: App,
        aiAgentService: AiAgentService,
    ) {
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
                                await this.aiAgentModel.findSlackPrompt(
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
                                    await aiAgentService.createSlackPrompt({
                                        userUuid,
                                        projectUuid:
                                            prevSlackPrompt.projectUuid,
                                        slackUserId: context.botUserId,
                                        slackChannelId: channel.id,
                                        slackThreadTs:
                                            prevSlackPrompt.slackThreadTs,
                                        prompt: response.message.text,
                                        promptSlackTs: response.ts,
                                        agentUuid: prevSlackPrompt.agentUuid,
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
                                await this.aiAgentModel.updateSlackResponseTs({
                                    promptUuid: slackPromptUuid,
                                    responseSlackTs: response.ts,
                                });
                            }

                            await this.schedulerClient.slackAiPrompt({
                                slackPromptUuid,
                                userUuid,
                                projectUuid: prevSlackPrompt.projectUuid,
                                organizationUuid:
                                    prevSlackPrompt.organizationUuid,
                            });
                        }
                    }
                },
            );
        });
    }

    // WARNING: Needs - channels:history scope for all slack apps
    private async handleAppMention(
        {
            event,
            context,
            say,
            client,
        }: SlackEventMiddlewareArgs<'app_mention'> & AllMiddlewareArgs,
        aiAgentService: AiAgentService,
    ) {
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
        let name: string | undefined;
        let threadMessages: ThreadMessageContext | undefined;

        try {
            const agentConfig =
                await this.aiAgentModel.getAgentBySlackChannelId({
                    organizationUuid,
                    slackChannelId: event.channel,
                });

            name = agentConfig.name;

            if (event.thread_ts) {
                const slackSettings =
                    await this.slackAuthenticationModel.getInstallationFromOrganizationUuid(
                        organizationUuid,
                    );

                const aiThreadAccessConsent =
                    slackSettings?.aiThreadAccessConsent;

                // Consent is granted - fetch thread messages
                if (aiThreadAccessConsent === true && context.botId) {
                    threadMessages =
                        await CommercialSlackClient.fetchThreadMessages({
                            client,
                            channelId: event.channel,
                            threadTs: event.thread_ts,
                            excludeMessageTs: event.ts,
                            botId: context.botId,
                        });
                }
            }

            [slackPromptUuid, createdThread] =
                await aiAgentService.createSlackPrompt({
                    userUuid,
                    projectUuid: agentConfig.projectUuid,
                    slackUserId: event.user,
                    slackChannelId: event.channel,
                    slackThreadTs: event.thread_ts,
                    prompt: event.text,
                    promptSlackTs: event.ts,
                    agentUuid: agentConfig.uuid ?? null,
                    threadMessages,
                });
        } catch (e) {
            if (e instanceof AiDuplicateSlackPromptError) {
                Logger.debug('Failed to create slack prompt:', e);
                return;
            }

            if (e instanceof AiAgentNotFoundError) {
                Logger.debug('Failed to find ai agent:', e);
                return;
            }

            throw e;
        }

        const postedMessage = await say({
            username: name,
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
            await this.aiAgentModel.updateSlackResponseTs({
                promptUuid: slackPromptUuid,
                responseSlackTs: postedMessage.ts,
            });
        }

        await this.schedulerClient.slackAiPrompt({
            slackPromptUuid,
            userUuid,
            projectUuid: '', // TODO: add project uuid
            organizationUuid,
        });
    }

    private static processThreadMessages(
        messages: MessageElement[] | undefined,
        excludeMessageTs: string,
        botId: string,
    ): ThreadMessageContext | undefined {
        if (!messages || messages.length === 0) {
            return undefined;
        }

        const threadMessages = messages
            .filter((msg) => {
                // Exclude the current message
                if (msg.ts === excludeMessageTs) {
                    return false;
                }

                // Exclude bot messages and messages from the bot itself
                if (msg.subtype === 'bot_message' || msg.bot_id === botId) {
                    return false;
                }

                return true;
            })
            .map((msg) => ({
                text: msg.text || '[message]',
                user: msg.user || 'unknown',
                ts: msg.ts || '',
            }));

        return threadMessages;
    }

    /**
     * Fetches thread messages from Slack if consent is granted
     */
    private static async fetchThreadMessages({
        client,
        channelId,
        threadTs,
        excludeMessageTs,
        botId,
    }: {
        client: WebClient;
        channelId: string;
        threadTs: string;
        excludeMessageTs: string;
        botId: string;
    }): Promise<ThreadMessageContext | undefined> {
        if (!threadTs) {
            return undefined;
        }

        try {
            const threadHistory = await client.conversations.replies({
                channel: channelId,
                ts: threadTs,
                limit: 100, // TODO: What should be the limit?
            });

            return CommercialSlackClient.processThreadMessages(
                threadHistory.messages,
                excludeMessageTs,
                botId,
            );
        } catch (error) {
            Logger.error(
                'Failed to fetch thread history, using original message only:',
                error,
            );
        }

        return undefined;
    }
}
