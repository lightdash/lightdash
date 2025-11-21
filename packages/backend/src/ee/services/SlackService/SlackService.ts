import {
    SlackService,
    SlackServiceArguments,
} from '../../../services/SlackService/SlackService';
import { AiAgentService } from '../AiAgentService';

type CommercialSlackServiceArguments = SlackServiceArguments & {
    aiAgentService: AiAgentService;
};

export class CommercialSlackService extends SlackService {
    private aiAgentService: AiAgentService;

    constructor(args: CommercialSlackServiceArguments) {
        super(args);
        this.aiAgentService = args.aiAgentService;
    }

    setupEventListeners() {
        super.setupEventListeners();

        const slackApp = this.slackClient.getApp();

        if (!slackApp) {
            throw new Error('Slack app not found');
        }

        slackApp.event('app_mention', (m) =>
            this.aiAgentService.handleAppMention(m),
        );
        slackApp.event('message', (m) =>
            this.aiAgentService.handleMultiAgentChannelMessage(m),
        );
        this.aiAgentService.handleAgentSelection(slackApp);
        this.aiAgentService.handlePromptUpvote(slackApp);
        this.aiAgentService.handlePromptDownvote(slackApp);
        this.aiAgentService.handleClickExploreButton(slackApp);
        this.aiAgentService.handleViewArtifact(slackApp);
        this.aiAgentService.handleClickOAuthButton(slackApp);
        this.aiAgentService.handleExecuteFollowUpTool(slackApp);
        this.aiAgentService.handleViewChangesetsButtonClick(slackApp);
    }
}
