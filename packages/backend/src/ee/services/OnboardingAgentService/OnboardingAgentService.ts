import {
    getConnectionDefaults,
    getErrorMessage,
    MissingConfigError,
    RequestMethod,
    type AgentOnboardingHandoff,
    type AgentOnboardingJobPayload,
    type AgentOnboardingStage,
    type AgentOnboardingUsage,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import { type PersonalAccessTokenService } from '../../../services/PersonalAccessTokenService';
import { type PromptService } from '../../../services/PromptService/PromptService';
import { type UserService } from '../../../services/UserService';
import { type DbAgentOnboardingRun } from '../../database/entities/agentOnboarding';
import { type AgentOnboardingRunModel } from '../../models/AgentOnboardingRunModel';
import { type SandboxRegistryModel } from '../../models/SandboxRegistryModel';
import {
    interpretAgentEvent,
    resolveSandboxTemplateRef,
    splitStreamBuffer,
    summarizeToolInput,
} from '../AiWritebackService/utils';
import {
    createSandboxManager,
    S3SnapshotStore,
    type PersistentWorkspace,
    type SandboxHandle,
    type SandboxManager,
    type SandboxSpec,
} from '../SandboxRuntime';
import {
    ALLOWED_TOOLS,
    CANCELLATION_POLL_INTERVAL_MS,
    CLAUDE_MODEL,
    CLAUDE_SKILLS_DIR,
    CLI_WRAPPER_PATH,
    CLI_WRAPPER_SCRIPT,
    PAT_EXPIRY_GRACE_MS,
    PROMPT_PATH,
    RUN_TIMEOUT_MS,
    SANDBOX_TIMEOUT_MS,
    WORKDIR,
} from './constants';
import { classifyOnboardingStage, sanitizeOnboardingMessage } from './utils';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    agentOnboardingRunModel: AgentOnboardingRunModel;
    sandboxRegistryModel: SandboxRegistryModel;
    projectModel: ProjectModel;
    personalAccessTokenService: PersonalAccessTokenService;
    promptService: PromptService;
    userService: UserService;
    sandboxManager?: SandboxManager;
};

const ONBOARDING_WORKSPACE: PersistentWorkspace = {
    include: [WORKDIR],
    exclude: [],
};

export class OnboardingAgentService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly agentOnboardingRunModel: AgentOnboardingRunModel;

    private readonly sandboxRegistryModel: SandboxRegistryModel;

    private readonly projectModel: ProjectModel;

    private readonly personalAccessTokenService: PersonalAccessTokenService;

    private readonly promptService: PromptService;

    private readonly userService: UserService;

    private sandboxManager: SandboxManager | undefined;

    constructor(dependencies: Dependencies) {
        super();
        this.lightdashConfig = dependencies.lightdashConfig;
        this.agentOnboardingRunModel = dependencies.agentOnboardingRunModel;
        this.sandboxRegistryModel = dependencies.sandboxRegistryModel;
        this.projectModel = dependencies.projectModel;
        this.personalAccessTokenService =
            dependencies.personalAccessTokenService;
        this.promptService = dependencies.promptService;
        this.userService = dependencies.userService;
        this.sandboxManager = dependencies.sandboxManager;
    }

    private getSandboxManager(): SandboxManager {
        if (!this.sandboxManager) {
            const { sandboxProvider } = this.lightdashConfig.appRuntime;
            this.sandboxManager = createSandboxManager({
                provider: sandboxProvider,
                e2bApiKey: this.lightdashConfig.appRuntime.e2bApiKey,
                dockerImage:
                    this.lightdashConfig.appRuntime
                        .sandboxAgentOnboardingDockerImage,
                lambdaMicroVm: null,
                azureSandboxes: null,
                snapshotStore:
                    sandboxProvider === 'docker'
                        ? new S3SnapshotStore({
                              lightdashConfig: this.lightdashConfig,
                          })
                        : null,
                registryModel: this.sandboxRegistryModel,
                logger: this.logger,
            });
        }
        return this.sandboxManager;
    }

    private getSandboxTemplateRef(): string {
        const { appRuntime } = this.lightdashConfig;
        switch (appRuntime.sandboxProvider) {
            case 'docker':
                return appRuntime.sandboxAgentOnboardingDockerImage;
            case 'e2b':
                return resolveSandboxTemplateRef({
                    name: appRuntime.e2bAgentOnboardingTemplateName,
                    tag: appRuntime.e2bAgentOnboardingTemplateTag,
                });
            default:
                throw new MissingConfigError(
                    `Agent onboarding does not support the ${appRuntime.sandboxProvider} sandbox provider`,
                );
        }
    }

    private getSandboxFacingSiteUrl(): string {
        if (this.lightdashConfig.appRuntime.sandboxProvider !== 'docker') {
            return this.lightdashConfig.siteUrl;
        }
        return this.lightdashConfig.siteUrl
            .replace('://localhost', '://host.docker.internal')
            .replace('://127.0.0.1', '://host.docker.internal');
    }

    private getAnthropicApiKey(): string {
        const key = this.lightdashConfig.aiWriteback.anthropicApiKey;
        if (!key) {
            throw new MissingConfigError(
                'Anthropic API key is not configured (AI_WRITEBACK_ANTHROPIC_API_KEY)',
            );
        }
        return key;
    }

    private buildSandboxSpec(): SandboxSpec {
        return {
            templateRef: this.getSandboxTemplateRef(),
            timeoutMs: SANDBOX_TIMEOUT_MS,
            egress: {
                allow: [
                    new URL(this.getSandboxFacingSiteUrl()).hostname,
                    'api.anthropic.com',
                ],
            },
        };
    }

    private async buildPrompt(args: {
        projectUuid: string;
        warehouseType: string;
        database: string | undefined;
        schema: string | undefined;
    }): Promise<string> {
        const basePrompt =
            await this.promptService.getPrompt('project-onboarding');
        const siteUrl = this.lightdashConfig.siteUrl.replace(/\/+$/, '');
        const preamble = [
            '# Lightdash cloud onboarding run',
            '',
            'You are running inside a managed sandbox on Lightdash Cloud, completing project setup on behalf of a user.',
            '',
            '## Context',
            `- Lightdash instance URL: ${siteUrl}`,
            `- Warehouse type: ${args.warehouseType}`,
            `- Prepared project UUID: ${args.projectUuid}`,
            ...(args.database
                ? [`- Configured database: ${args.database}`]
                : []),
            ...(args.schema ? [`- Configured schema: ${args.schema}`] : []),
            '',
            '## Managed environment',
            '- The Lightdash CLI and skills are preinstalled. Skip local setup.',
            `- Run every \`lightdash <args>\` command as \`${CLI_WRAPPER_PATH} <args>\`.`,
            '- Authentication is already configured. Do not run `lightdash login` or inspect environment variables.',
            `- Verify the selected project with \`${CLI_WRAPPER_PATH} config get-project\` and confirm it matches the prepared project UUID.`,
            `- Create all working files under ${WORKDIR} and build a pure Lightdash semantic layer from the warehouse catalog.`,
            '',
            '---',
            '',
        ].join('\n');
        return preamble + basePrompt;
    }

    private startCancellationPoll(
        agentOnboardingRunUuid: string,
        onCancel: () => void,
    ): () => void {
        const timer = setInterval(() => {
            void this.agentOnboardingRunModel
                .findByUuid(agentOnboardingRunUuid)
                .then((run) => {
                    if (run?.cancellation_requested_at) onCancel();
                })
                .catch((error) => {
                    this.logger.warn(
                        `OnboardingAgent: could not check cancellation: ${sanitizeOnboardingMessage(
                            getErrorMessage(error),
                        )}`,
                    );
                });
        }, CANCELLATION_POLL_INTERVAL_MS);
        timer.unref();
        return () => clearInterval(timer);
    }

    private async runAgentInSandbox(args: {
        run: DbAgentOnboardingRun;
        sandbox: SandboxHandle;
        patToken: string;
        anthropicApiKey: string;
    }): Promise<{
        assistantText: string;
        usage: AgentOnboardingUsage | null;
    }> {
        const { run, sandbox, patToken, anthropicApiKey } = args;
        const { warehouseConnection } =
            await this.projectModel.getWithSensitiveFields(run.project_uuid);
        if (!warehouseConnection) {
            throw new MissingConfigError(
                'The prepared project does not have a warehouse connection',
            );
        }
        const connectionDefaults = getConnectionDefaults(warehouseConnection);
        const prompt = await this.buildPrompt({
            projectUuid: run.project_uuid,
            warehouseType: warehouseConnection.type,
            database: connectionDefaults.database,
            schema: connectionDefaults.schema,
        });
        const sensitiveValues = [patToken, anthropicApiKey];

        await sandbox.commands.run(`mkdir -p ${WORKDIR}`);
        await sandbox.files.write(PROMPT_PATH, prompt);
        await sandbox.files.write(CLI_WRAPPER_PATH, CLI_WRAPPER_SCRIPT);
        await sandbox.commands.run(`chmod +x ${CLI_WRAPPER_PATH}`);

        let buffer = '';
        let assistantText = '';
        let usage: AgentOnboardingUsage | null = null;
        let lastStep = '';
        const pendingEvents: Promise<void>[] = [];

        const recordStep = (
            rawMessage: string,
            stage: AgentOnboardingStage | null,
        ) => {
            const message = sanitizeOnboardingMessage(
                rawMessage,
                sensitiveValues,
            );
            if (message === lastStep) return;
            lastStep = message;
            pendingEvents.push(
                this.agentOnboardingRunModel
                    .appendEvent(run.agent_onboarding_run_uuid, {
                        eventType: stage ? 'stage' : 'step',
                        message,
                        stage,
                    })
                    .then(() => undefined)
                    .catch((error) => {
                        this.logger.warn(
                            `OnboardingAgent: could not append event: ${sanitizeOnboardingMessage(
                                getErrorMessage(error),
                                sensitiveValues,
                            )}`,
                        );
                    }),
            );
        };

        const handleEvent = (event: unknown): void => {
            const interpreted = interpretAgentEvent(event);
            if (interpreted.type === 'result') {
                usage = {
                    costUsd: interpreted.costUsd,
                    inputTokens: interpreted.inputTokens,
                    outputTokens: interpreted.outputTokens,
                    numTurns: interpreted.numTurns,
                };
                return;
            }
            if (interpreted.type === 'ignored') return;
            for (const toolCall of interpreted.toolCalls) {
                const summary = summarizeToolInput(toolCall.input);
                const stage = classifyOnboardingStage(
                    toolCall.name,
                    toolCall.input,
                );
                this.logger.info(
                    `OnboardingAgent tool call: ${toolCall.name}${
                        stage ? ` (${stage})` : ''
                    }`,
                );
                const command =
                    toolCall.name === 'Bash' &&
                    toolCall.input &&
                    typeof toolCall.input === 'object' &&
                    'command' in toolCall.input &&
                    typeof toolCall.input.command === 'string'
                        ? toolCall.input.command
                        : null;
                recordStep(
                    command?.slice(0, 200) ?? `${toolCall.name}: ${summary}`,
                    stage,
                );
            }
            if (interpreted.text !== null) {
                assistantText = sanitizeOnboardingMessage(
                    interpreted.text,
                    sensitiveValues,
                );
            }
        };

        const flushBuffer = (): void => {
            const { lines, remainder } = splitStreamBuffer(buffer);
            buffer = remainder;
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        handleEvent(JSON.parse(line));
                    } catch {
                        this.logger.debug(
                            'OnboardingAgent: received an unparseable Claude event',
                        );
                    }
                }
            }
        };

        try {
            await sandbox.commands.run(
                `cat ${PROMPT_PATH} | claude -p ` +
                    `--model ${CLAUDE_MODEL} ` +
                    '--output-format stream-json --verbose ' +
                    `--add-dir ${CLAUDE_SKILLS_DIR} ` +
                    `--allowedTools "${ALLOWED_TOOLS}"`,
                {
                    cwd: WORKDIR,
                    timeoutMs: RUN_TIMEOUT_MS,
                    envs: {
                        ANTHROPIC_API_KEY: anthropicApiKey,
                        LIGHTDASH_URL: this.getSandboxFacingSiteUrl(),
                        LIGHTDASH_API_KEY: patToken,
                        LIGHTDASH_PROJECT: run.project_uuid,
                    },
                    onStdout: (chunk) => {
                        buffer += chunk;
                        flushBuffer();
                    },
                    onStderr: () => {
                        this.logger.debug(
                            'OnboardingAgent: Claude emitted diagnostic output',
                        );
                    },
                },
            );
        } finally {
            if (buffer.trim()) {
                try {
                    handleEvent(JSON.parse(buffer));
                } catch {
                    this.logger.debug(
                        'OnboardingAgent: received an unparseable trailing Claude event',
                    );
                }
            }
            await Promise.all(pendingEvents);
        }
        return { assistantText, usage };
    }

    private buildHandoff(
        rawAssistantText: string,
        sensitiveValues: string[],
    ): AgentOnboardingHandoff {
        const siteUrl = this.lightdashConfig.siteUrl.replace(/\/+$/, '');
        const assistantText = sanitizeOnboardingMessage(
            rawAssistantText.replaceAll(
                this.getSandboxFacingSiteUrl().replace(/\/+$/, ''),
                siteUrl,
            ),
            sensitiveValues,
        );
        const urlPattern = new RegExp(
            `${siteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s)\`"']*dashboards[^\\s)\`"']*`,
        );
        return {
            summary: assistantText.trim() || null,
            dashboardUrl: assistantText.match(urlPattern)?.[0] ?? null,
        };
    }

    async executeRun(payload: AgentOnboardingJobPayload): Promise<void> {
        const run = await this.agentOnboardingRunModel.claimQueuedRun(
            payload.agentOnboardingRunUuid,
        );
        if (!run) {
            this.logger.info(
                `OnboardingAgent: run ${payload.agentOnboardingRunUuid} was not claimable`,
            );
            return;
        }

        let account: ReturnType<typeof fromSession> | null = null;
        let pat: Awaited<
            ReturnType<PersonalAccessTokenService['createPersonalAccessToken']>
        > | null = null;
        let manager: SandboxManager | null = null;
        let sandbox: { sandboxUuid: string; handle: SandboxHandle } | undefined;
        let cancelled = false;
        let stopCancellationPoll = () => {};
        let destroyPromise: Promise<void> | null = null;

        const sensitiveValues = (): string[] =>
            [
                pat?.token,
                this.lightdashConfig.aiWriteback.anthropicApiKey,
            ].filter((value): value is string => Boolean(value));

        const destroySandbox = (): Promise<void> => {
            if (!manager || !sandbox) return Promise.resolve();
            if (!destroyPromise) {
                destroyPromise = manager
                    .destroy({
                        sandboxUuid: sandbox.sandboxUuid,
                        handle: sandbox.handle,
                    })
                    .catch((error) => {
                        this.logger.warn(
                            `OnboardingAgent: could not destroy sandbox: ${sanitizeOnboardingMessage(
                                getErrorMessage(error),
                                sensitiveValues(),
                            )}`,
                        );
                    });
            }
            return destroyPromise;
        };

        try {
            account = fromSession(
                await this.userService.getSessionByUserUuidAndOrg(
                    run.created_by_user_uuid,
                    run.organization_uuid,
                ),
            );
            pat =
                await this.personalAccessTokenService.createPersonalAccessToken(
                    account,
                    {
                        description: `Agent onboarding run ${run.agent_onboarding_run_uuid}`,
                        expiresAt: new Date(
                            Date.now() + RUN_TIMEOUT_MS + PAT_EXPIRY_GRACE_MS,
                        ),
                        autoGenerated: true,
                    },
                    RequestMethod.BACKEND,
                );
            await this.agentOnboardingRunModel.update(
                run.agent_onboarding_run_uuid,
                { pat_uuid: pat.uuid },
            );

            const sandboxSpec = this.buildSandboxSpec();
            manager = this.getSandboxManager();
            stopCancellationPoll = this.startCancellationPoll(
                run.agent_onboarding_run_uuid,
                () => {
                    cancelled = true;
                    void destroySandbox();
                },
            );

            await this.agentOnboardingRunModel.appendEvent(
                run.agent_onboarding_run_uuid,
                {
                    eventType: 'stage',
                    message: 'Preparing the onboarding agent',
                    stage: 'preparing_project',
                },
            );
            sandbox = await manager.acquire({
                spec: sandboxSpec,
                organizationUuid: run.organization_uuid,
                projectUuid: run.project_uuid,
                workspace: ONBOARDING_WORKSPACE,
            });
            await this.agentOnboardingRunModel.update(
                run.agent_onboarding_run_uuid,
                { sandbox_uuid: sandbox.sandboxUuid },
            );
            if (cancelled) {
                await destroySandbox();
                throw new Error('Onboarding run cancelled');
            }

            const anthropicApiKey = this.getAnthropicApiKey();
            const { assistantText, usage } = await this.runAgentInSandbox({
                run,
                sandbox: sandbox.handle,
                patToken: pat.token,
                anthropicApiKey,
            });
            const completed = await this.agentOnboardingRunModel.markCompleted(
                run.agent_onboarding_run_uuid,
                {
                    handoff: this.buildHandoff(
                        assistantText,
                        sensitiveValues(),
                    ),
                    usage,
                    stage: 'handoff',
                },
            );
            if (!completed) {
                const current = await this.agentOnboardingRunModel.findByUuid(
                    run.agent_onboarding_run_uuid,
                );
                if (current?.cancellation_requested_at) {
                    cancelled = true;
                    await this.agentOnboardingRunModel.markCancelled(
                        run.agent_onboarding_run_uuid,
                    );
                }
            }
        } catch (error) {
            const current = await this.agentOnboardingRunModel
                .findByUuid(run.agent_onboarding_run_uuid)
                .catch(() => undefined);
            if (cancelled || current?.cancellation_requested_at) {
                cancelled = true;
                await this.agentOnboardingRunModel.markCancelled(
                    run.agent_onboarding_run_uuid,
                );
            } else {
                const message = sanitizeOnboardingMessage(
                    getErrorMessage(error),
                    sensitiveValues(),
                );
                this.logger.error(`OnboardingAgent run failed: ${message}`);
                await this.agentOnboardingRunModel.markFailed(
                    run.agent_onboarding_run_uuid,
                    message,
                );
            }
        } finally {
            stopCancellationPoll();
            await destroySandbox();
            if (account && pat) {
                await this.personalAccessTokenService
                    .deletePersonalAccessToken(account, pat.uuid)
                    .catch((error) => {
                        this.logger.warn(
                            `OnboardingAgent: could not revoke PAT: ${sanitizeOnboardingMessage(
                                getErrorMessage(error),
                                sensitiveValues(),
                            )}`,
                        );
                    });
            }
        }
    }
}
