import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getConnectionDefaults,
    getErrorMessage,
    isUserWithOrg,
    MissingConfigError,
    NotFoundError,
    RequestMethod,
    UnexpectedServerError,
    type AgentOnboardingFileContent,
    type AgentOnboardingHandoff,
    type AgentOnboardingJobPayload,
    type AgentOnboardingRun,
    type AgentOnboardingStage,
    type AgentOnboardingUsage,
    type SessionUser,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account';
import { type LightdashConfig } from '../../../config/parseConfig';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';
import { type PersonalAccessTokenService } from '../../../services/PersonalAccessTokenService';
import { type PromptService } from '../../../services/PromptService/PromptService';
import { type UserService } from '../../../services/UserService';
import { VERSION } from '../../../version';
import {
    type DbAgentOnboardingFile,
    type DbAgentOnboardingRun,
} from '../../database/entities/agentOnboarding';
import { type AgentOnboardingRunModel } from '../../models/AgentOnboardingRunModel';
import { type SandboxRegistryModel } from '../../models/SandboxRegistryModel';
import { type CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import {
    interpretAgentEvent,
    resolveSandboxTemplateRef,
    summarizeToolInput,
} from '../AiWritebackService/utils';
import {
    createSandboxManager,
    S3SnapshotStore,
    SandboxCommandError,
    SandboxConnectionError,
    SandboxNotRunningError,
    SandboxTimeoutError,
    type PersistentWorkspace,
    type SandboxHandle,
    type SandboxManager,
    type SandboxSpec,
} from '../SandboxRuntime';
import { pollDetachedAgentRun } from './agentStreamPoller';
import {
    AGENT_RUNNER_PATH,
    AGENT_RUNNER_SCRIPT,
    AGENT_STDERR_PATH,
    CANCELLATION_POLL_INTERVAL_MS,
    CLAUDE_BASH_GUARD_PATH,
    CLAUDE_BASH_GUARD_SCRIPT,
    CLAUDE_SETTINGS,
    CLAUDE_SETTINGS_PATH,
    CLI_WRAPPER_PATH,
    CLI_WRAPPER_SCRIPT,
    FILE_SYNC_INTERVAL_MS,
    PAT_EXPIRY_GRACE_MS,
    PROMPT_PATH,
    RUN_TIMEOUT_MS,
    SANDBOX_TIMEOUT_MS,
    WORKDIR,
} from './constants';
import { OnboardingAgentFileStore } from './OnboardingAgentFileStore';
import {
    buildManagedOnboardingPrompt,
    classifyOnboardingStage,
    containsOnboardingSecret,
    hasCompleteOnboardingOutput,
    isOnboardingOutputFile,
    parseWorkspaceFileListing,
    sanitizeOnboardingMessage,
    validateOnboardingOutputFileLimits,
} from './utils';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    agentOnboardingRunModel: AgentOnboardingRunModel;
    sandboxRegistryModel: SandboxRegistryModel;
    projectModel: ProjectModel;
    personalAccessTokenService: PersonalAccessTokenService;
    promptService: PromptService;
    userService: UserService;
    schedulerClient: CommercialSchedulerClient;
    sandboxManager?: SandboxManager;
    fileStore?: OnboardingAgentFileStore;
};

const ONBOARDING_WORKSPACE: PersistentWorkspace = {
    include: [WORKDIR],
    exclude: [],
};

const toRun = (run: DbAgentOnboardingRun): AgentOnboardingRun => ({
    agentOnboardingRunUuid: run.agent_onboarding_run_uuid,
    projectUuid: run.project_uuid,
    status: run.status,
    stage: run.stage,
    events: run.events,
    handoff: run.handoff,
    usage: run.usage,
    files: run.files.map(({ path, sizeBytes, updatedAt }) => ({
        path,
        sizeBytes,
        updatedAt,
    })),
    errorMessage: run.error_message,
    createdAt: run.created_at.toISOString(),
    updatedAt: run.updated_at.toISOString(),
    startedAt: run.started_at?.toISOString() ?? null,
    completedAt: run.completed_at?.toISOString() ?? null,
});

export class OnboardingAgentService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly agentOnboardingRunModel: AgentOnboardingRunModel;

    private readonly sandboxRegistryModel: SandboxRegistryModel;

    private readonly projectModel: ProjectModel;

    private readonly personalAccessTokenService: PersonalAccessTokenService;

    private readonly promptService: PromptService;

    private readonly userService: UserService;

    private readonly schedulerClient: CommercialSchedulerClient;

    private readonly fileStore: OnboardingAgentFileStore;

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
        this.schedulerClient = dependencies.schedulerClient;
        this.fileStore =
            dependencies.fileStore ??
            new OnboardingAgentFileStore({
                lightdashConfig: dependencies.lightdashConfig,
            });
        this.sandboxManager = dependencies.sandboxManager;
    }

    private async assertCanViewProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            user.organizationUuid !== organizationUuid ||
            this.createAuditedAbility(user).cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async assertCanManageProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ organizationUuid: string }> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            user.organizationUuid !== organizationUuid ||
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { organizationUuid };
    }

    async createRun(args: {
        user: SessionUser;
        projectUuid: string;
    }): Promise<AgentOnboardingRun> {
        if (!isUserWithOrg(args.user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } = await this.assertCanManageProject(
            args.user,
            args.projectUuid,
        );
        if (
            this.createAuditedAbility(args.user).cannot(
                'create',
                subject('PersonalAccessToken', {
                    organizationUuid,
                    metadata: { userUuid: args.user.userUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const activeRun =
            await this.agentOnboardingRunModel.findActiveRunForProject(
                args.projectUuid,
            );
        if (activeRun) return toRun(activeRun);

        const run = await this.agentOnboardingRunModel.create({
            organizationUuid,
            projectUuid: args.projectUuid,
            createdByUserUuid: args.user.userUuid,
        });

        try {
            await this.schedulerClient.agentOnboardingRun({
                agentOnboardingRunUuid: run.agent_onboarding_run_uuid,
                organizationUuid: run.organization_uuid,
                projectUuid: run.project_uuid,
                userUuid: run.created_by_user_uuid,
            });
        } catch (error) {
            await this.agentOnboardingRunModel.markFailed(
                run.agent_onboarding_run_uuid,
                'Could not start the onboarding agent. Please try again.',
            );
            throw error;
        }
        return toRun(run);
    }

    async getActiveRun(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AgentOnboardingRun | null> {
        await this.assertCanViewProject(user, projectUuid);
        const run =
            await this.agentOnboardingRunModel.findActiveRunForProject(
                projectUuid,
            );
        return run ? toRun(run) : null;
    }

    private async findOrganizationScopedRun(
        user: SessionUser,
        agentOnboardingRunUuid: string,
    ): Promise<DbAgentOnboardingRun> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const run = await this.agentOnboardingRunModel.findByUuid(
            agentOnboardingRunUuid,
        );
        if (!run || run.organization_uuid !== user.organizationUuid) {
            throw new NotFoundError(
                `Onboarding run ${agentOnboardingRunUuid} not found`,
            );
        }
        return run;
    }

    private async findScopedRun(
        user: SessionUser,
        projectUuid: string,
        agentOnboardingRunUuid: string,
    ): Promise<DbAgentOnboardingRun> {
        const run = await this.findOrganizationScopedRun(
            user,
            agentOnboardingRunUuid,
        );
        if (run.project_uuid !== projectUuid) {
            throw new NotFoundError(
                `Onboarding run ${agentOnboardingRunUuid} not found`,
            );
        }
        await this.assertCanViewProject(user, projectUuid);
        return run;
    }

    async getRun(
        user: SessionUser,
        projectUuid: string,
        agentOnboardingRunUuid: string,
    ): Promise<AgentOnboardingRun> {
        return toRun(
            await this.findScopedRun(user, projectUuid, agentOnboardingRunUuid),
        );
    }

    async getFile(
        user: SessionUser,
        projectUuid: string,
        agentOnboardingRunUuid: string,
        path: string,
    ): Promise<AgentOnboardingFileContent> {
        if (!isOnboardingOutputFile(path)) {
            throw new NotFoundError(`Onboarding file ${path} not found`);
        }
        const run = await this.findScopedRun(
            user,
            projectUuid,
            agentOnboardingRunUuid,
        );
        if (
            this.createAuditedAbility(user).cannot(
                'view',
                subject('SourceCode', {
                    organizationUuid: run.organization_uuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to view this project source code',
            );
        }
        const file = run.files.find((candidate) => candidate.path === path);
        if (!file) {
            throw new NotFoundError(`Onboarding file ${path} not found`);
        }

        const contents = await this.fileStore.get(file.s3Key);
        const utf8 = contents.toString('utf8');
        const isUtf8 = Buffer.from(utf8, 'utf8').equals(contents);
        return {
            path: file.path,
            sizeBytes: file.sizeBytes,
            updatedAt: file.updatedAt,
            content: isUtf8 ? utf8 : contents.toString('base64'),
            encoding: isUtf8 ? 'utf8' : 'base64',
        };
    }

    async cancelRun(
        user: SessionUser,
        projectUuid: string,
        agentOnboardingRunUuid: string,
    ): Promise<AgentOnboardingRun> {
        const run = await this.findScopedRun(
            user,
            projectUuid,
            agentOnboardingRunUuid,
        );
        await this.assertCanManageProject(user, projectUuid);
        const updatedRun =
            await this.agentOnboardingRunModel.requestCancellation(
                run.agent_onboarding_run_uuid,
            );
        return toRun(updatedRun ?? run);
    }

    async markRunTimedOut(agentOnboardingRunUuid: string): Promise<void> {
        await this.agentOnboardingRunModel.markFailed(
            agentOnboardingRunUuid,
            'The onboarding agent took too long and was stopped.',
        );
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
                    'registry.npmjs.org',
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
        return buildManagedOnboardingPrompt({
            ...args,
            basePrompt,
            siteUrl,
        });
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

    private async syncWorkspaceFiles(args: {
        run: DbAgentOnboardingRun;
        sandbox: SandboxHandle;
        previousFiles: DbAgentOnboardingFile[];
        sensitiveValues: string[];
    }): Promise<DbAgentOnboardingFile[]> {
        const { run, sandbox, previousFiles, sensitiveValues } = args;
        const result = await sandbox.commands.run(
            `find ${WORKDIR} -type f -printf '%P\\t%s\\t%T@\\n' | sort`,
        );
        const previousByPath = new Map(
            previousFiles.map((file) => [file.path, file]),
        );
        const discovered = parseWorkspaceFileListing(result.stdout).filter(
            ({ path }) => isOnboardingOutputFile(path),
        );
        validateOnboardingOutputFileLimits(discovered);

        const contentsByPath = new Map<string, Buffer>();
        await Promise.all(
            discovered.map(async (file) => {
                const previous = previousByPath.get(file.path);
                if (
                    previous &&
                    previous.sizeBytes === file.sizeBytes &&
                    previous.updatedAt === file.updatedAt
                ) {
                    return;
                }

                const contents = await sandbox.files.readBytes(
                    `${WORKDIR}/${file.path}`,
                );
                if (containsOnboardingSecret(contents, sensitiveValues)) {
                    throw new UnexpectedServerError(
                        `Onboarding file ${file.path} contains sensitive content and was not persisted`,
                    );
                }
                contentsByPath.set(file.path, contents);
            }),
        );

        const filesWithActualSizes = discovered.map((file) => ({
            ...file,
            sizeBytes:
                contentsByPath.get(file.path)?.byteLength ?? file.sizeBytes,
        }));
        validateOnboardingOutputFileLimits(filesWithActualSizes);

        const files = await Promise.all(
            filesWithActualSizes.map(
                async (file): Promise<DbAgentOnboardingFile> => {
                    const previous = previousByPath.get(file.path);
                    if (
                        previous &&
                        previous.sizeBytes === file.sizeBytes &&
                        previous.updatedAt === file.updatedAt
                    ) {
                        return previous;
                    }

                    const s3Key = [
                        'agent-onboarding',
                        run.organization_uuid,
                        run.agent_onboarding_run_uuid,
                        'files',
                        ...file.path.split('/').map(encodeURIComponent),
                    ].join('/');
                    const contents = contentsByPath.get(file.path);
                    if (!contents) {
                        throw new UnexpectedServerError(
                            `Could not read onboarding file ${file.path}`,
                        );
                    }
                    await this.fileStore.put(s3Key, contents);
                    return { ...file, s3Key };
                },
            ),
        );

        const filesChanged =
            files.length !== previousFiles.length ||
            files.some((file) => {
                const previous = previousByPath.get(file.path);
                return (
                    !previous ||
                    previous.sizeBytes !== file.sizeBytes ||
                    previous.updatedAt !== file.updatedAt ||
                    previous.s3Key !== file.s3Key
                );
            });
        if (filesChanged) {
            await this.agentOnboardingRunModel.replaceFiles(
                run.agent_onboarding_run_uuid,
                files,
            );
        }
        return files;
    }

    private async runAgentInSandbox(args: {
        run: DbAgentOnboardingRun;
        sandbox: SandboxHandle;
        patToken: string;
        anthropicApiKey: string;
    }): Promise<{
        assistantText: string;
        files: DbAgentOnboardingFile[];
        usage: AgentOnboardingUsage | null;
    }> {
        const { run, sandbox, patToken, anthropicApiKey } = args;
        this.fileStore.assertConfigured();
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

        await sandbox.commands.run(
            `mkdir -p ${WORKDIR}/lightdash/models ${WORKDIR}/lightdash/charts ${WORKDIR}/lightdash/dashboards && chmod -R a+rwX ${WORKDIR}`,
        );
        if (/^\d+\.\d+\.\d+$/.test(VERSION)) {
            try {
                const result = await sandbox.commands.run(
                    `npm install -g @lightdash/cli@${VERSION}`,
                );
                if (result.exitCode !== 0) {
                    this.logger.warn(
                        `OnboardingAgent: could not pin CLI to ${VERSION}, using template CLI`,
                    );
                } else {
                    this.logger.info(
                        `OnboardingAgent: pinned CLI to ${VERSION}`,
                    );
                }
            } catch {
                this.logger.warn(
                    `OnboardingAgent: could not pin CLI to ${VERSION}, using template CLI`,
                );
            }
        }
        await sandbox.files.write(PROMPT_PATH, prompt);
        await sandbox.files.write(CLI_WRAPPER_PATH, CLI_WRAPPER_SCRIPT);
        await sandbox.files.write(
            CLAUDE_BASH_GUARD_PATH,
            CLAUDE_BASH_GUARD_SCRIPT,
        );
        await sandbox.files.write(CLAUDE_SETTINGS_PATH, CLAUDE_SETTINGS);
        await sandbox.files.write(AGENT_RUNNER_PATH, AGENT_RUNNER_SCRIPT);
        await sandbox.commands.run(
            `chmod +x ${CLI_WRAPPER_PATH} ${AGENT_RUNNER_PATH}`,
        );

        let assistantText = '';
        let usage: AgentOnboardingUsage | null = null;
        let lastStep = '';
        const pendingEvents: Promise<void>[] = [];
        let knownFiles = run.files;
        let syncPromise: Promise<void> | undefined;

        const syncFiles = (): Promise<void> => {
            if (syncPromise) return syncPromise;
            syncPromise = this.syncWorkspaceFiles({
                run,
                sandbox,
                previousFiles: knownFiles,
                sensitiveValues,
            })
                .then((files) => {
                    knownFiles = files;
                })
                .finally(() => {
                    syncPromise = undefined;
                });
            return syncPromise;
        };

        const fileSyncTimer = setInterval(() => {
            void syncFiles().catch((error) => {
                this.logger.warn(
                    `OnboardingAgent: could not sync files: ${sanitizeOnboardingMessage(
                        getErrorMessage(error),
                        sensitiveValues,
                    )}`,
                );
            });
        }, FILE_SYNC_INTERVAL_MS);
        fileSyncTimer.unref();

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

        const handleStreamLine = (line: string): void => {
            try {
                handleEvent(JSON.parse(line));
            } catch {
                this.logger.debug(
                    'OnboardingAgent: received an unparseable Claude event',
                );
            }
        };

        let runError: { value: unknown } | undefined;
        try {
            // setsid keeps the runner alive after the launch shell exits.
            await sandbox.commands.run(
                `setsid nohup ${AGENT_RUNNER_PATH} >/dev/null 2>&1 < /dev/null & echo launched`,
                {
                    cwd: WORKDIR,
                    envs: {
                        ANTHROPIC_API_KEY: anthropicApiKey,
                        LIGHTDASH_URL: this.getSandboxFacingSiteUrl(),
                        LIGHTDASH_API_KEY: patToken,
                        LIGHTDASH_PROJECT: run.project_uuid,
                    },
                },
            );
            const { exitCode } = await pollDetachedAgentRun({
                sandbox,
                onLine: handleStreamLine,
                logger: this.logger,
            });
            if (exitCode === 124) {
                throw new SandboxTimeoutError(
                    'The onboarding agent took too long and was stopped.',
                );
            }
            if (exitCode !== 0) {
                let stderrTail = '';
                try {
                    const result = await sandbox.commands.run(
                        `tail -c 2048 ${AGENT_STDERR_PATH} 2>/dev/null || true`,
                    );
                    stderrTail = result.stdout;
                } catch {
                    this.logger.debug(
                        'OnboardingAgent: could not read agent diagnostic output',
                    );
                }
                if (stderrTail) {
                    this.logger.warn(
                        `OnboardingAgent: Claude exited with diagnostic output: ${sanitizeOnboardingMessage(
                            stderrTail,
                            sensitiveValues,
                        )}`,
                    );
                }
                throw new SandboxCommandError(exitCode, stderrTail, '');
            }
        } catch (error) {
            runError = { value: error };
        }

        clearInterval(fileSyncTimer);
        let syncError: { value: unknown } | undefined;
        try {
            if (syncPromise) {
                await syncPromise.catch((error) => {
                    this.logger.warn(
                        `OnboardingAgent: periodic file sync failed before final sync: ${sanitizeOnboardingMessage(
                            getErrorMessage(error),
                            sensitiveValues,
                        )}`,
                    );
                });
            }
            await syncFiles();
        } catch (error) {
            syncError = { value: error };
            this.logger.warn(
                `OnboardingAgent: could not complete file sync: ${sanitizeOnboardingMessage(
                    getErrorMessage(error),
                    sensitiveValues,
                )}`,
            );
        }
        await Promise.all(pendingEvents);
        if (runError) throw runError.value;
        if (syncError) throw syncError.value;
        return { assistantText, files: knownFiles, usage };
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
            const ability = this.createAuditedAbility(account);
            if (
                ability.cannot(
                    'manage',
                    subject('Project', {
                        organizationUuid: run.organization_uuid,
                        projectUuid: run.project_uuid,
                    }),
                ) ||
                ability.cannot(
                    'create',
                    subject('PersonalAccessToken', {
                        organizationUuid: run.organization_uuid,
                        metadata: { userUuid: run.created_by_user_uuid },
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
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
            const { assistantText, files, usage } =
                await this.runAgentInSandbox({
                    run,
                    sandbox: sandbox.handle,
                    patToken: pat.token,
                    anthropicApiKey,
                });
            const handoff = this.buildHandoff(assistantText, sensitiveValues());
            if (!hasCompleteOnboardingOutput(files) || !handoff.dashboardUrl) {
                throw new UnexpectedServerError(
                    'The onboarding agent stopped before generating all required project files. Please try again.',
                );
            }
            const completed = await this.agentOnboardingRunModel.markCompleted(
                run.agent_onboarding_run_uuid,
                {
                    handoff,
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
                const sanitizedMessage = sanitizeOnboardingMessage(
                    getErrorMessage(error),
                    sensitiveValues(),
                );
                const sandboxConnectionFailure =
                    error instanceof SandboxConnectionError ||
                    error instanceof SandboxNotRunningError;
                const message = sandboxConnectionFailure
                    ? "Lightdash lost the connection to the onboarding agent's workspace. Any progress was saved. Please try running the onboarding agent again."
                    : sanitizedMessage;
                this.logger.error(
                    sandboxConnectionFailure
                        ? `OnboardingAgent run failed (sandbox connection): ${sanitizedMessage}`
                        : `OnboardingAgent run failed: ${sanitizedMessage}`,
                );
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
