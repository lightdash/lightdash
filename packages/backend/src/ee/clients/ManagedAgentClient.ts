import Anthropic, { toFile } from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import Logger from '../../logging/logger';
import {
    CUSTOM_TOOL_DEFINITIONS,
    MANAGED_AGENT_SYSTEM_PROMPT,
} from '../services/ManagedAgentService/managedAgentTools';

type ManagedAgentClientConfig = {
    anthropicApiKey: string;
    siteUrl: string;
    serviceAccountPat: string;
    sessionTimeoutMs: number;
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

    private vaultId: string | null = null;

    constructor(config: ManagedAgentClientConfig) {
        this.config = config;
        this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    }

    // eslint-disable-next-line class-methods-use-this
    private async uploadSkill(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        betaAny: any,
    ): Promise<string | null> {
        // Find the developing-in-lightdash skill directory
        const skillDir = path.resolve(
            __dirname,
            '../../../../../skills/developing-in-lightdash',
        );

        if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
            Logger.warn(
                `[ManagedAgent] Skill directory not found at ${skillDir}, skipping skill upload`,
            );
            return null;
        }

        Logger.info(
            '[ManagedAgent] Uploading developing-in-lightdash skill...',
        );

        // Collect all files recursively
        const collectFiles = (
            dir: string,
            prefix: string,
        ): Array<{ filePath: string; relativePath: string }> => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            const files: Array<{
                filePath: string;
                relativePath: string;
            }> = [];
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relPath = path.join(prefix, entry.name);
                if (entry.isDirectory()) {
                    files.push(...collectFiles(fullPath, relPath));
                } else {
                    files.push({ filePath: fullPath, relativePath: relPath });
                }
            }
            return files;
        };

        const allFiles = collectFiles(skillDir, 'developing-in-lightdash');

        const fileUploads = await Promise.all(
            allFiles.map(({ filePath, relativePath }) =>
                toFile(fs.createReadStream(filePath), relativePath),
            ),
        );

        try {
            // Try to find an existing skill first
            const existingSkills = await betaAny.skills.list(
                { source: 'custom' },
                { headers: { 'anthropic-beta': 'skills-2025-10-02' } },
            );
            const existing = existingSkills?.data?.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (s: any) => s.display_title === 'Developing in Lightdash',
            );
            if (existing) {
                Logger.info(
                    `[ManagedAgent] Reusing existing skill: ${existing.id}`,
                );
                return existing.id;
            }

            const skill = await betaAny.skills.create(
                {
                    display_title: 'Developing in Lightdash',
                    files: fileUploads,
                },
                {
                    headers: {
                        'anthropic-beta': 'skills-2025-10-02',
                    },
                },
            );

            Logger.info(`[ManagedAgent] Skill uploaded: ${skill.id}`);
            return skill.id;
        } catch (error) {
            Logger.warn(
                `[ManagedAgent] Failed to upload skill, continuing without it: ${error instanceof Error ? error.message : error}`,
            );
            return null;
        }
    }

    private async ensureAgentAndEnvironment(): Promise<{
        agentId: string;
        environmentId: string;
        vaultId: string;
    }> {
        if (this.agentId && this.environmentId && this.vaultId) {
            return {
                agentId: this.agentId,
                environmentId: this.environmentId,
                vaultId: this.vaultId,
            };
        }

        Logger.info('Setting up managed agent, environment, and vault...');

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const betaAny = this.client.beta as any;

        // Try to find an existing agent to reuse
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let agent: any = null;
        try {
            const existingAgents = await betaAny.agents.list({
                limit: 50,
            });
            const existing = existingAgents?.data?.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (a: any) =>
                    a.name === 'Lightdash Project Health Agent' &&
                    !a.archived_at,
            );
            if (existing) {
                agent = existing;
                Logger.info(
                    `[ManagedAgent] Reusing existing agent: ${existing.id}`,
                );
            }
        } catch (e) {
            // List failed, will create new
        }

        // Upload the developing-in-lightdash skill
        const skillId = await this.uploadSkill(betaAny);

        if (!agent) {
            agent = await betaAny.agents.create({
                name: 'Lightdash Project Health Agent',
                model: 'claude-sonnet-4-6',
                system: MANAGED_AGENT_SYSTEM_PROMPT,
                ...(skillId
                    ? {
                          skills: [
                              {
                                  type: 'custom',
                                  skill_id: skillId,
                                  version: 'latest',
                              },
                          ],
                      }
                    : {}),
                mcp_servers: [
                    {
                        type: 'url',
                        name: 'lightdash',
                        url: `${this.config.siteUrl}/api/v1/mcp`,
                    },
                ],
                tools: [
                    {
                        // Disable all built-in agent tools (file read/write, shell, etc.)
                        // The agent only needs MCP and custom tools for Lightdash operations
                        type: 'agent_toolset_20260401',
                        default_config: { enabled: false },
                    },
                    {
                        type: 'mcp_toolset',
                        mcp_server_name: 'lightdash',
                        default_config: {
                            permission_policy: { type: 'always_allow' },
                        },
                    },
                    ...CUSTOM_TOOL_DEFINITIONS,
                ],
            });
            Logger.info(`[ManagedAgent] Created new agent: ${agent.id}`);
        }

        // Use "limited" networking — restricts the agent's network access
        // to only the configured MCP servers (i.e., the Lightdash MCP endpoint).
        const environment = await betaAny.environments.create({
            name: 'lightdash-agent-env',
            config: {
                type: 'cloud',
                networking: { type: 'limited' },
            },
        });

        // Create a vault and add a static bearer credential for MCP auth
        const vault = await betaAny.vaults.create({
            display_name: 'Lightdash MCP Auth',
        });

        await betaAny.vaults.credentials.create(vault.id, {
            display_name: 'Lightdash PAT',
            auth: {
                type: 'static_bearer',
                mcp_server_url: `${this.config.siteUrl}/api/v1/mcp`,
                token: this.config.serviceAccountPat,
            },
        });

        this.agentId = agent.id;
        this.environmentId = environment.id;
        this.vaultId = vault.id;

        Logger.info(
            `Managed agent created: agentId=${agent.id}, environmentId=${environment.id}, vaultId=${vault.id}`,
        );

        return {
            agentId: agent.id,
            environmentId: environment.id,
            vaultId: vault.id,
        };
    }

    async runSession(
        projectName: string,
        onCustomToolUse: CustomToolHandler,
    ): Promise<string> {
        const { agentId, environmentId, vaultId } =
            await this.ensureAgentAndEnvironment();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const betaAny = this.client.beta as any;

        const session = await betaAny.sessions.create({
            agent: agentId,
            environment_id: environmentId,
            vault_ids: [vaultId],
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

        const { sessionTimeoutMs } = this.config;

        // Wrap the event loop in a timeout to prevent the scheduler from
        // blocking indefinitely if the agent stalls or loops.
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
                () =>
                    reject(
                        new Error(
                            `[ManagedAgent] Session timed out after ${sessionTimeoutMs}ms`,
                        ),
                    ),
                sessionTimeoutMs,
            );
        });

        const eventLoop = async () => {
            for await (const event of stream) {
                if (event.type === 'agent.message') {
                    for (const block of event.content) {
                        if ('text' in block) {
                            Logger.debug(`[ManagedAgent] ${block.text}`);
                        }
                    }
                } else if (event.type === 'agent.tool_use') {
                    Logger.info(`[ManagedAgent] Built-in tool: ${event.name}`);
                } else if (event.type === 'agent.mcp_tool_use') {
                    Logger.info(`[ManagedAgent] MCP tool: ${event.name}`);
                } else if (event.type === 'agent.custom_tool_use') {
                    Logger.info(
                        `[ManagedAgent] Tool call: ${event.name} (event_id: ${event.id})`,
                    );
                    try {
                        const result = await onCustomToolUse(
                            event.name,
                            event.input as Record<string, unknown>,
                        );
                        Logger.info(
                            `[ManagedAgent] Sending result for: ${event.name} (event_id: ${event.id})`,
                        );
                        await betaAny.sessions.events.send(session.id, {
                            events: [
                                {
                                    type: 'user.custom_tool_result',
                                    custom_tool_use_id: event.id,
                                    content: [{ type: 'text', text: result }],
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
                                    custom_tool_use_id: event.id,
                                    content: [
                                        {
                                            type: 'text',
                                            text: JSON.stringify({
                                                error: errorMessage,
                                            }),
                                        },
                                    ],
                                    is_error: true,
                                },
                            ],
                        });
                    }
                } else if (event.type === 'session.status_idle') {
                    const stopReason = event.stop_reason?.type;
                    const eventIds = event.stop_reason?.event_ids ?? [];
                    if (stopReason === 'end_turn') {
                        Logger.info(
                            '[ManagedAgent] Session complete (end_turn)',
                        );
                        break;
                    }
                    Logger.info(
                        `[ManagedAgent] Session idle: ${stopReason ?? 'unknown'}, event_ids: ${JSON.stringify(eventIds)}`,
                    );
                }
            }
        };

        await Promise.race([eventLoop(), timeoutPromise]);

        return session.id;
    }
}
