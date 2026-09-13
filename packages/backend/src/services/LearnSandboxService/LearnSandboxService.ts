import { subject } from '@casl/ability';
import {
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    RequestMethod,
    type Account,
    type LearnCommandOutput,
    type LearnCommandStatus,
    type LearnSandboxCommandPayload,
    type LearnSandboxCommandRequest,
    type LearnWorkspaceFile,
    type LearnWorkspaceFileSummary,
    type SessionUser,
} from '@lightdash/common';
import execaDefault from 'execa';
import { readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fromSession } from '../../auth/account/account';
import { LightdashConfig } from '../../config/parseConfig';
import { getDbtProcessEnvironment } from '../../dbt/dbtProcessEnvironment';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { LearnWorkspaceModel } from '../../models/LearnWorkspaceModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import type { PersonalAccessTokenService } from '../PersonalAccessTokenService';
import type { UserService } from '../UserService';
import { buildArgv } from './allowlist';
import { OutputBuffer } from './outputBuffer';
import {
    detectSandboxRuntime,
    LEARN_SANDBOX_COMMAND_TIMEOUT_MS,
    resolveSandboxRuntime,
} from './runtime';
import {
    isEditablePath,
    loadLearnBundle,
    materialiseWorkspace,
    validateYaml,
} from './workspace';

const MAX_FILE_BYTES = 64 * 1024;
const STALE_WORKSPACE_MS = 60 * 60 * 1000;

/**
 * Structural type for the one scheduler client method this service depends
 * on. Task 5 adds `learnSandboxCommand` to the real `SchedulerClient`; until
 * then `ServiceRepository` passes the client through an `as unknown as`
 * cast (see the TODO there).
 */
export type LearnSandboxSchedulerClient = {
    learnSandboxCommand: (payload: {
        commandUuid: string;
        projectUuid: string;
        organizationUuid: string;
        userUuid: string;
    }) => Promise<string>;
};

type LearnSandboxServiceArguments = {
    lightdashConfig: Pick<LightdashConfig, 'siteUrl' | 'auth'>;
    learnWorkspaceModel: LearnWorkspaceModel;
    projectModel: Pick<ProjectModel, 'getSummary'>;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    personalAccessTokenService: Pick<
        PersonalAccessTokenService,
        'createPersonalAccessToken' | 'deletePersonalAccessToken'
    >;
    userService: Pick<UserService, 'getSessionByUserUuidAndOrg'>;
    schedulerClient: LearnSandboxSchedulerClient;
    execa?: typeof execaDefault;
    workspaceRoot?: string;
    commandTimeoutMs?: number;
};

export class LearnSandboxService extends BaseService {
    private readonly lightdashConfig: Pick<LightdashConfig, 'siteUrl' | 'auth'>;

    private readonly learnWorkspaceModel: LearnWorkspaceModel;

    private readonly projectModel: Pick<ProjectModel, 'getSummary'>;

    private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>;

    private readonly personalAccessTokenService: Pick<
        PersonalAccessTokenService,
        'createPersonalAccessToken' | 'deletePersonalAccessToken'
    >;

    private readonly userService: Pick<
        UserService,
        'getSessionByUserUuidAndOrg'
    >;

    private readonly schedulerClient: LearnSandboxSchedulerClient;

    private readonly execa: typeof execaDefault;

    private readonly workspaceRoot: string;

    private readonly commandTimeoutMs: number;

    constructor(args: LearnSandboxServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.learnWorkspaceModel = args.learnWorkspaceModel;
        this.projectModel = args.projectModel;
        this.featureFlagModel = args.featureFlagModel;
        this.personalAccessTokenService = args.personalAccessTokenService;
        this.userService = args.userService;
        this.schedulerClient = args.schedulerClient;
        this.execa = args.execa ?? execaDefault;
        this.workspaceRoot =
            args.workspaceRoot ??
            path.join(os.tmpdir(), 'lightdash-learn', 'ws');
        this.commandTimeoutMs =
            args.commandTimeoutMs ?? LEARN_SANDBOX_COMMAND_TIMEOUT_MS;
    }

    private async assertSandboxAccess(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.EnableLearn,
        });
        if (!enabled) {
            throw new NotFoundError(
                'Learn is not enabled for this organization',
            );
        }
        const project = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('DeployProject', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                    upstreamProjectUuid: project.upstreamProjectUuid,
                    type: project.type,
                    createdByUserUuid: project.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have access to this workspace',
            );
        }
    }

    async listFiles(
        user: SessionUser,
        projectUuid: string,
    ): Promise<LearnWorkspaceFileSummary[]> {
        await this.assertSandboxAccess(user, projectUuid);
        const [bundle, overlay] = await Promise.all([
            loadLearnBundle(),
            this.learnWorkspaceModel.listFiles(projectUuid),
        ]);
        const overlayPaths = new Set(overlay.map((file) => file.path));
        const bundleSummaries: LearnWorkspaceFileSummary[] = bundle.files
            .filter((file) => !overlayPaths.has(file.path))
            .map((file) => ({
                path: file.path,
                editable: isEditablePath(file.path),
            }));
        const overlaySummaries: LearnWorkspaceFileSummary[] = overlay.map(
            (file) => ({ path: file.path, editable: true }),
        );
        return [...bundleSummaries, ...overlaySummaries];
    }

    async getFile(
        user: SessionUser,
        projectUuid: string,
        filePath: string,
    ): Promise<LearnWorkspaceFile> {
        await this.assertSandboxAccess(user, projectUuid);
        const overlayFile = await this.learnWorkspaceModel.getFile(
            projectUuid,
            filePath,
        );
        if (overlayFile) {
            return { ...overlayFile, editable: true };
        }
        const bundle = await loadLearnBundle();
        const bundleFile = bundle.files.find((file) => file.path === filePath);
        if (!bundleFile) {
            throw new NotFoundError(`File not found: ${filePath}`);
        }
        return {
            path: bundleFile.path,
            content: bundleFile.content,
            editable: isEditablePath(filePath),
        };
    }

    async saveFile(
        user: SessionUser,
        projectUuid: string,
        filePath: string,
        content: string,
    ): Promise<void> {
        await this.assertSandboxAccess(user, projectUuid);
        if (!isEditablePath(filePath)) {
            throw new ParameterError(`Cannot edit ${filePath}`);
        }
        if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
            throw new ParameterError(
                `File is too large: ${filePath} exceeds ${MAX_FILE_BYTES} bytes`,
            );
        }
        const yamlError = validateYaml(content);
        if (yamlError) {
            throw new ParameterError(
                `Invalid YAML in ${filePath}: ${yamlError}`,
            );
        }
        await this.learnWorkspaceModel.upsertFile(
            projectUuid,
            filePath,
            content,
        );
    }

    async enqueueCommand(
        user: SessionUser,
        projectUuid: string,
        request: LearnSandboxCommandRequest,
    ): Promise<{ commandUuid: string }> {
        await this.assertSandboxAccess(user, projectUuid);
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const active =
            await this.learnWorkspaceModel.findActiveCommand(projectUuid);
        if (active) {
            throw new ConflictError(
                'A command is already running in this workspace',
            );
        }
        const result = buildArgv(
            request,
            path.join(this.workspaceRoot, projectUuid, 'project'),
        );
        if (!result.ok) {
            throw new ParameterError(result.message);
        }
        const { commandUuid } = await this.learnWorkspaceModel.createCommand({
            projectUuid,
            userUuid: user.userUuid,
            argv: result.argv,
        });
        await this.schedulerClient.learnSandboxCommand({
            commandUuid,
            projectUuid,
            organizationUuid: user.organizationUuid,
            userUuid: user.userUuid,
        });
        return { commandUuid };
    }

    async getOutput(
        user: SessionUser,
        projectUuid: string,
        commandUuid: string,
        afterSeq: number,
    ): Promise<LearnCommandOutput> {
        await this.assertSandboxAccess(user, projectUuid);
        const command = await this.learnWorkspaceModel.getCommand(commandUuid);
        if (!command || command.project_uuid !== projectUuid) {
            throw new NotFoundError('Command not found');
        }
        const chunks = await this.learnWorkspaceModel.readOutput(
            commandUuid,
            afterSeq,
        );
        return {
            commandUuid: command.command_uuid,
            status: command.status,
            exitCode: command.exit_code,
            argv: command.argv,
            chunks,
        };
    }

    async runCommand(payload: LearnSandboxCommandPayload): Promise<void> {
        const command = await this.learnWorkspaceModel.getCommand(
            payload.commandUuid,
        );
        if (!command || command.status !== 'queued') {
            // Duplicate delivery or the command was cancelled before it started.
            return;
        }
        const runtime = resolveSandboxRuntime();
        const workspaceDir = path.join(this.workspaceRoot, payload.projectUuid);
        let account: Account | null = null;
        let patUuid: string | null = null;
        let token = '';
        let status: LearnCommandStatus = 'error';
        let exitCode: number | null = null;
        const buffer = new OutputBuffer({
            secrets: [],
            onFlush: (chunks) =>
                this.learnWorkspaceModel.appendOutput(
                    payload.commandUuid,
                    chunks,
                ),
        });
        try {
            await this.learnWorkspaceModel.updateCommand(payload.commandUuid, {
                status: 'running',
                started_at: new Date(),
            });
            account = fromSession(
                await this.userService.getSessionByUserUuidAndOrg(
                    payload.userUuid,
                    payload.organizationUuid,
                ),
            );
            const pat =
                await this.personalAccessTokenService.createPersonalAccessToken(
                    account,
                    {
                        description: `Learn sandbox command ${payload.commandUuid}`,
                        expiresAt: new Date(
                            Date.now() + this.commandTimeoutMs + 60_000,
                        ),
                        autoGenerated: true,
                    },
                    RequestMethod.BACKEND,
                );
            patUuid = pat.uuid;
            token = pat.token;
            buffer.setSecrets([token]);
            await this.learnWorkspaceModel.updateCommand(payload.commandUuid, {
                pat_uuid: patUuid,
            });
            await rm(workspaceDir, { recursive: true, force: true });
            await materialiseWorkspace({
                bundle: await loadLearnBundle(),
                overlay: await this.learnWorkspaceModel.listFiles(
                    payload.projectUuid,
                ),
                workspaceDir,
                profiles: { databasePath: runtime.databasePath },
            });
            const projectDir = path.join(workspaceDir, 'project');
            const base = getDbtProcessEnvironment({
                processEnvironment: process.env,
                environmentVariableAllowlist: [],
                projectEnvironment: {},
                targetPath: path.join(workspaceDir, 'target'),
                gitConfigGlobalPath: undefined,
            });
            const env = {
                ...base,
                PATH: [...runtime.pathPrefix, base.PATH ?? '']
                    .filter(Boolean)
                    .join(':'),
                LIGHTDASH_URL: runtime.apiUrl ?? this.lightdashConfig.siteUrl,
                LIGHTDASH_PROJECT: payload.projectUuid,
                LIGHTDASH_API_KEY: token,
                DBT_PROFILES_DIR: workspaceDir,
                DBT_PROJECT_DIR: projectDir,
                HOME: workspaceDir,
                DBT_SEND_ANONYMOUS_USAGE_STATS: 'false',
                CI: 'true',
            };
            const [bin, ...args] = command.argv;
            const child = this.execa(bin, args, {
                cwd: projectDir,
                env,
                extendEnv: false,
                shell: false,
                timeout: this.commandTimeoutMs,
                reject: false,
                all: false,
            });
            child.stdout?.on('data', (d: Buffer) =>
                buffer.push('stdout', d.toString('utf8')),
            );
            child.stderr?.on('data', (d: Buffer) =>
                buffer.push('stderr', d.toString('utf8')),
            );
            const result = await child;
            if (result.timedOut) {
                status = 'timeout';
            } else if (result.exitCode === 0) {
                status = 'done';
            } else {
                status = 'error';
            }
            exitCode = result.exitCode ?? null;
            if (result.timedOut) {
                buffer.push(
                    'stderr',
                    `Command stopped after ${this.commandTimeoutMs / 1000}s\n`,
                );
            }
        } catch (e) {
            status = 'error';
            exitCode = null;
            buffer.push('stderr', `${getErrorMessage(e)}\n`);
            throw e;
        } finally {
            await buffer.close();
            await rm(workspaceDir, { recursive: true, force: true }).catch(
                () => undefined,
            );
            let tokenRevoked = false;
            if (account && patUuid) {
                await this.personalAccessTokenService
                    .deletePersonalAccessToken(account, patUuid)
                    .then(() => {
                        tokenRevoked = true;
                    })
                    .catch((error) => {
                        this.logger.warn(
                            `Learn sandbox: could not revoke token for ${payload.commandUuid}: ${getErrorMessage(error)}`,
                        );
                    });
            }
            await this.learnWorkspaceModel.updateCommand(payload.commandUuid, {
                status,
                exit_code: exitCode,
                finished_at: new Date(),
                ...(tokenRevoked ? { pat_uuid: null } : {}),
            });
        }
    }

    async sweep(): Promise<{
        tokensDeleted: number;
        workspacesRemoved: number;
    }> {
        const rows = await this.learnWorkspaceModel.listCommandsWithTokens();
        let tokensDeleted = 0;
        // eslint-disable-next-line no-restricted-syntax
        for (const row of rows) {
            // eslint-disable-next-line no-await-in-loop
            const revoked = await this.sweepCommandToken(row);
            if (revoked) {
                tokensDeleted += 1;
            }
        }
        const workspacesRemoved = await this.sweepStaleWorkspaces();
        return { tokensDeleted, workspacesRemoved };
    }

    /**
     * Revokes the PAT for a single finished command (best effort: a
     * not-found or already-revoked token is not an error) and always clears
     * the token reference so a future sweep does not retry it forever.
     */
    private async sweepCommandToken(
        row: Awaited<
            ReturnType<LearnWorkspaceModel['listCommandsWithTokens']>
        >[number],
    ): Promise<boolean> {
        if (!row.pat_uuid) {
            return false;
        }
        let revoked = false;
        try {
            const command = await this.learnWorkspaceModel.getCommand(
                row.command_uuid,
            );
            if (command) {
                const project = await this.projectModel.getSummary(
                    command.project_uuid,
                );
                const session =
                    await this.userService.getSessionByUserUuidAndOrg(
                        command.user_uuid,
                        project.organizationUuid,
                    );
                const account = fromSession(session);
                await this.personalAccessTokenService.deletePersonalAccessToken(
                    account,
                    row.pat_uuid,
                );
                revoked = true;
            }
        } catch (error) {
            this.logger.warn(
                `Learn sandbox sweep: could not revoke token for ${row.command_uuid}: ${getErrorMessage(error)}`,
            );
        }
        await this.learnWorkspaceModel.clearToken(row.command_uuid);
        return revoked;
    }

    private async sweepStaleWorkspaces(): Promise<number> {
        let entries: string[];
        try {
            entries = await readdir(this.workspaceRoot);
        } catch {
            return 0;
        }
        const cutoff = Date.now() - STALE_WORKSPACE_MS;
        let removed = 0;
        // eslint-disable-next-line no-restricted-syntax
        for (const entry of entries) {
            const dir = path.join(this.workspaceRoot, entry);
            try {
                // eslint-disable-next-line no-await-in-loop
                const info = await stat(dir);
                if (info.mtimeMs < cutoff) {
                    // eslint-disable-next-line no-await-in-loop
                    await rm(dir, { recursive: true, force: true });
                    removed += 1;
                }
            } catch {
                // The directory may have been removed concurrently; ignore.
            }
        }
        return removed;
    }

    async isRuntimeAvailable(): Promise<boolean> {
        if (!this.lightdashConfig.auth.pat.enabled) {
            return false;
        }
        const runtime = await detectSandboxRuntime();
        return runtime.lightdash && runtime.dbt;
    }
}
