import Anthropic from '@anthropic-ai/sdk';
import Logger from '../../logging/logger';
import {
    CUSTOM_TOOL_DEFINITIONS,
    MANAGED_AGENT_SYSTEM_PROMPT,
} from '../services/ManagedAgentService/managedAgentTools';

type ManagedAgentClientConfig = {
    anthropicApiKey: string;
    siteUrl: string;
    serviceAccountPat: string;
};

type CustomToolHandler = (
    toolName: string,
    input: Record<string, unknown>,
) => Promise<string>;

export class ManagedAgentClient {
    private readonly config: ManagedAgentClientConfig;

    private client: Anthropic;

    private agentId: string | null = null;

    private environmentId: string | null = null;

    constructor(config: ManagedAgentClientConfig) {
        this.config = config;
        this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    }

    private async ensureAgentAndEnvironment(): Promise<{
        agentId: string;
        environmentId: string;
    }> {
        if (this.agentId && this.environmentId) {
            return { agentId: this.agentId, environmentId: this.environmentId };
        }

        Logger.info('Creating managed agent and environment...');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const agent = await (this.client.beta as any).agents.create({
            name: 'Lightdash Project Health Agent',
            model: 'claude-sonnet-4-6',
            system: MANAGED_AGENT_SYSTEM_PROMPT,
            mcp_servers: [
                {
                    type: 'url',
                    url: `${this.config.siteUrl}/api/v1/mcp`,
                    authorization_token: this.config.serviceAccountPat,
                },
            ],
            tools: [
                {
                    type: 'agent_toolset_20260401',
                    default_config: { enabled: false },
                    configs: [
                        { name: 'web_search', enabled: false },
                        { name: 'web_fetch', enabled: false },
                    ],
                },
                ...CUSTOM_TOOL_DEFINITIONS,
            ],
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const environment = await (this.client.beta as any).environments.create(
            {
                name: 'lightdash-agent-env',
                config: {
                    type: 'cloud',
                    networking: { type: 'unrestricted' },
                },
            },
        );

        this.agentId = agent.id;
        this.environmentId = environment.id;

        Logger.info(
            `Managed agent created: agentId=${agent.id}, environmentId=${environment.id}`,
        );

        return { agentId: agent.id, environmentId: environment.id };
    }

    async runSession(
        projectName: string,
        onCustomToolUse: CustomToolHandler,
    ): Promise<string> {
        const { agentId, environmentId } =
            await this.ensureAgentAndEnvironment();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const betaAny = this.client.beta as any;

        const session = await betaAny.sessions.create({
            agent: agentId,
            environment_id: environmentId,
            title: `Health check: ${projectName} — ${new Date().toISOString()}`,
        });

        Logger.info(`[ManagedAgent] Session created: ${session.id}`);

        const stream = await betaAny.sessions.events.stream(session.id);

        await betaAny.sessions.events.send(session.id, {
            events: [
                {
                    type: 'user.message',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze project "${projectName}". Follow your checklist.`,
                        },
                    ],
                },
            ],
        });

        for await (const event of stream) {
            if (event.type === 'agent.message') {
                for (const block of event.content) {
                    if ('text' in block) {
                        Logger.debug(`[ManagedAgent] ${block.text}`);
                    }
                }
            } else if (event.type === 'agent.custom_tool_use') {
                Logger.info(`[ManagedAgent] Tool call: ${event.name}`);
                try {
                    const result = await onCustomToolUse(
                        event.name,
                        event.input as Record<string, unknown>,
                    );
                    await betaAny.sessions.events.send(session.id, {
                        events: [
                            {
                                type: 'user.custom_tool_result',
                                tool_use_id: event.id,
                                content: result,
                            },
                        ],
                    });
                } catch (error) {
                    const errorMessage =
                        error instanceof Error
                            ? error.message
                            : 'Unknown error';
                    Logger.error(
                        `[ManagedAgent] Tool error: ${event.name}: ${errorMessage}`,
                    );
                    await betaAny.sessions.events.send(session.id, {
                        events: [
                            {
                                type: 'user.custom_tool_result',
                                tool_use_id: event.id,
                                content: JSON.stringify({
                                    error: errorMessage,
                                }),
                                is_error: true,
                            },
                        ],
                    });
                }
            } else if (event.type === 'session.status_idle') {
                Logger.info('[ManagedAgent] Session complete (idle)');
                break;
            }
        }

        return session.id;
    }
}
