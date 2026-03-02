import {
    SlackService,
    SlackServiceArguments,
} from '../../../services/SlackService/SlackService';
import { AiAgentService } from '../AiAgentService/AiAgentService';

type CommercialSlackServiceArguments = SlackServiceArguments & {
    aiAgentService: AiAgentService;
};

/**
 * Commercial Slack Service that extends the base SlackService with AI Agent capabilities.
 *
 * ## How AI Agent Slack Integration Works
 *
 * This service uses a **single Slack bot architecture** with intelligent agent routing:
 *
 * ### Single Bot Design
 * - There is only ONE Slack bot installed per organization (the Lightdash app)
 * - Users always mention the main Lightdash bot (e.g., @lightdash) to interact with AI agents
 * - Individual agent names (like "Sales Agent" or "Marketing Agent") are NOT separate Slack bots
 * - Agent names appear as display names in responses via the `username` parameter, but are not mentionable
 *
 * ### Interaction Modes
 *
 * #### Regular Channel Mode (Single Agent)
 * - User mentions @lightdash with their question
 * - The system routes to the single agent configured for that organization
 *
 * #### Multi-Agent Channel Mode
 * Enabled via `aiMultiAgentChannelId` setting:
 *
 * **For new threads:**
 * - User mentions @lightdash OR posts a plain message
 * - AI automatically selects the most appropriate agent using LLM-based routing
 * - Selection is based on:
 *   - Agent descriptions and custom instructions
 *   - Data access (explores/tables the agent can query)
 *   - Verified questions (past successful queries)
 *   - Content of the user's question
 *
 * **For existing threads:**
 * - User mentions @lightdash to continue with the agent assigned to that thread
 * - Thread maintains consistency with the originally selected agent
 *
 * ### Why Custom Agent Names Can't Be Mentioned
 *
 * Agent names like "Sales Agent" or "Marketing Agent" are NOT separate Slack users:
 * 1. They don't have separate OAuth installations or bot tokens
 * 2. They're display names that appear in the bot's responses via the `username` field
 * 3. Slack only allows mentioning actual bot users with OAuth credentials
 * 4. Creating separate bots for each agent would require multiple Slack app installations
 *
 * ### Event Handlers
 *
 * - `app_mention`: Triggered when @lightdash is mentioned
 *   - Handles agent selection and routing
 *   - Creates or continues conversation threads
 *
 * - `message`: Triggered for plain messages (no @mention) in multi-agent channels
 *   - Only active in channels configured as `aiMultiAgentChannelId`
 *   - Allows seamless interaction without explicit mentions for new threads
 *
 * ### Agent Selection Logic
 *
 * The system uses LLM-based routing (see `selectBestAgentWithContext`) to choose the appropriate agent:
 * - Returns confidence level (high/medium/low)
 * - If confidence is low, prompts user to manually select from available agents
 * - Considers agent context, verified questions, and data access permissions
 */
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

        // Handle @lightdash mentions - this is the primary way users interact with AI agents
        // Users mention the Lightdash bot, NOT individual agent names
        slackApp.event('app_mention', (m) =>
            this.aiAgentService.handleAppMention(m),
        );

        // Handle plain messages (without @mention) in multi-agent channels
        // Only active in the channel specified by aiMultiAgentChannelId setting
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
