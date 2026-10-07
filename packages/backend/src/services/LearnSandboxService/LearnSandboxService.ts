import { subject } from '@casl/ability';
import {
    ConflictError,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    ProjectType,
    RequestMethod,
    TooManyRequestsError,
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
import { lstat, readdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fromSession } from '../../auth/account/account';
import { LightdashConfig } from '../../config/parseConfig';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { LearnWorkspaceModel } from '../../models/LearnWorkspaceModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import type { PersonalAccessTokenService } from '../PersonalAccessTokenService';
import type { UserService } from '../UserService';
import { buildArgv, previewName, toSpawnArgv } from './allowlist';
import { OutputBuffer } from './outputBuffer';
import {
    buildPartialParseBaseline,
    partialParseBaselineKey,
    partialParseBaselinePath,
    seedPartialParse,
} from './partialParse';
import {
    buildSandboxEnvironment,
    detectSandboxDbtVersion,
    detectSandboxRuntime,
    LEARN_SANDBOX_COMMAND_TIMEOUT_MS,
    resolveSandboxRuntime,
    type LearnSandboxActiveCommandLimits,
    type LearnSandboxRuntime,
} from './runtime';
import {
    DOWNLOADED_CONTENT_FOLDERS,
    isDownloadedContentPath,
    isEditablePath,
    loadLearnBundle,
    materialiseWorkspace,
    validateYaml,
    writeCliConfig,
    type LearnBundle,
} from './workspace';

const MAX_FILE_BYTES = 64 * 1024;
const MAX_PATH_LENGTH = 255;
const MAX_OVERLAY_FILES = 200;
const STALE_WORKSPACE_MS = 60 * 60 * 1000;
const STALE_RUNNING_GRACE_MS = 5 * 60 * 1000;
// A baseline that failed to build is not retried on every command: each
// attempt is a full dbt parse on the scheduler.
const PARTIAL_PARSE_RETRY_MS = 10 * 60 * 1000;
const POSTGRES_UNIQUE_VIOLATION = '23505';
// Set by provisionTrainingProject on both the shared TRAINING project and
// every learner's PREVIEW copy of it.
const TRAINING_PROVISIONING_SOURCE = 'training';
export const ACTIVE_COMMAND_CONFLICT_MESSAGE =
    'A command is already running in this workspace';

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION;

/**
 * execa's types claim `exitCode` and `message`/`shortMessage` fields that
 * aren't always present at runtime: with `reject: false`, a process that
 * fails to spawn (e.g. ENOENT) resolves with `exitCode: undefined` and no
 * `message`, despite the declared (non-optional) `number` type.
 */
type ExecaLikeResult = {
    exitCode?: number;
    timedOut: boolean;
    failed: boolean;
    shortMessage?: string;
    message?: string;
};

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
    /**
     * Where partial-parse baselines live, outside the swept workspaceRoot.
     * null turns partial parsing off: every command runs a full parse.
     */
    partialParseRoot?: string | null;
    commandTimeoutMs?: number;
    activeCommandLimits?: LearnSandboxActiveCommandLimits;
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

    private readonly partialParseRoot: string | null;

    private readonly partialParseBuilds = new Map<string, Promise<void>>();

    private readonly partialParseRetryAt = new Map<string, number>();

    private readonly commandTimeoutMs: number;

    private readonly activeCommandLimits: LearnSandboxActiveCommandLimits;

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
        this.partialParseRoot =
            args.partialParseRoot === undefined
                ? path.join(path.dirname(this.workspaceRoot), 'partial-parse')
                : args.partialParseRoot;
        this.commandTimeoutMs =
            args.commandTimeoutMs ?? LEARN_SANDBOX_COMMAND_TIMEOUT_MS;
        this.activeCommandLimits =
            args.activeCommandLimits ??
            resolveSandboxRuntime().activeCommandLimits;
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
        // The ability check above only proves the caller can deploy to
        // *some* project (e.g. `manage:DeployProject@self` on any preview
        // they created). The sandbox must be scoped further, to only the
        // caller's own training copy: a real project, another learner's
        // copy, or a preview created for something other than Learn would
        // otherwise let the sandbox run arbitrary dbt/lightdash commands
        // against it.
        if (
            project.type !== ProjectType.PREVIEW ||
            project.provisioningSource !== TRAINING_PROVISIONING_SOURCE ||
            project.createdByUserUuid !== user.userUuid
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
            (file) => ({
                path: file.path,
                editable: isEditablePath(file.path),
            }),
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
            return {
                ...overlayFile,
                editable: isEditablePath(overlayFile.path),
            };
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

    /**
     * What the workspace already held under `lightdash/`, as it sits in a
     * command's project directory before the command runs. A download is
     * credited only with what it writes after this: the files kept from
     * earlier downloads are copied into every command's directory too.
     */
    private static async heldDownloadedContent(
        projectDir: string,
        overlay: { path: string; content: string }[],
    ): Promise<Map<string, { content: string; mtimeMs: number }>> {
        const held = await Promise.all(
            overlay
                .filter((file) => isDownloadedContentPath(file.path))
                .map(async (file) => {
                    const info = await lstat(
                        path.join(projectDir, ...file.path.split('/')),
                    );
                    return [
                        file.path,
                        { content: file.content, mtimeMs: info.mtimeMs },
                    ] as const;
                }),
        );
        return new Map(held);
    }

    /**
     * Keeps what a `lightdash download` wrote, so the learner can open,
     * edit and upload it: the command's directory is removed when it ends.
     * Only regular files at the CLI's own content paths are read, in real
     * directories (a symlink on the way would point the reads elsewhere),
     * within the same limits as a save; anything else is left to be removed.
     * A file the workspace held that the download did not rewrite is left
     * alone, so a save made while the download ran is not undone.
     */
    private async keepDownloadedFiles(
        projectUuid: string,
        projectDir: string,
        held: Map<string, { content: string; mtimeMs: number }>,
        buffer: OutputBuffer,
    ): Promise<void> {
        const isRealDirectory = async (dir: string) =>
            (await lstat(dir).catch(() => undefined))?.isDirectory() === true;
        const found = (await isRealDirectory(
            path.join(projectDir, 'lightdash'),
        ))
            ? (
                  await Promise.all(
                      DOWNLOADED_CONTENT_FOLDERS.map(async (folder) => {
                          const dir = path.join(
                              projectDir,
                              ...folder.split('/'),
                          );
                          if (!(await isRealDirectory(dir))) return [];
                          const entries = await readdir(dir, {
                              withFileTypes: true,
                          }).catch(() => []);
                          return entries
                              .filter((entry) => entry.isFile())
                              .map((entry) => `${folder}/${entry.name}`);
                      }),
                  )
              )
                  .flat()
                  .filter(isDownloadedContentPath)
                  .sort()
            : [];
        // The overlay's paths, read once: a file already there is updated in
        // place, a new one takes a free slot, and once the slots are gone
        // the rest is skipped without being read.
        const saved = new Set(
            await this.learnWorkspaceModel.listFilePaths(projectUuid),
        );
        let free = Math.max(0, MAX_OVERLAY_FILES - saved.size);
        let kept = 0;
        const skipped: string[] = [];
        // eslint-disable-next-line no-restricted-syntax
        for (const relative of found) {
            const isNew = !saved.has(relative);
            const file =
                isNew && free === 0
                    ? { skipped: 'the workspace is full' }
                    : // eslint-disable-next-line no-await-in-loop
                      await LearnSandboxService.readDownloadedFile(
                          relative,
                          path.join(projectDir, ...relative.split('/')),
                          held.get(relative),
                      );
            if ('skipped' in file) {
                skipped.push(`${relative} (${file.skipped})`);
            } else if ('content' in file) {
                if (file.content !== held.get(relative)?.content) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.learnWorkspaceModel.upsertFile(
                        projectUuid,
                        relative,
                        file.content,
                    );
                }
                if (isNew) {
                    saved.add(relative);
                    free -= 1;
                }
                kept += 1;
            }
        }
        if (kept === 0 && skipped.length === 0) {
            buffer.push(
                'stderr',
                'The download wrote no files under lightdash/, so none were kept in your workspace.\n',
            );
            return;
        }
        const SHOWN = 3;
        buffer.push(
            'stderr',
            `Kept ${kept} downloaded file${kept === 1 ? '' : 's'} in your workspace.${
                skipped.length > 0
                    ? ` Skipped ${skipped.length}: ${skipped
                          .slice(0, SHOWN)
                          .join(', ')}${
                          skipped.length > SHOWN
                              ? `, and ${skipped.length - SHOWN} more`
                              : ''
                      }.`
                    : ''
            }\n`,
        );
    }

    /**
     * One file found after a download: its content when the download wrote
     * it and it can be kept (a regular file within the save limits that
     * parses as YAML, as a save requires), why it is skipped when it cannot,
     * or nothing when the workspace held it and the download left it as it
     * was.
     */
    private static async readDownloadedFile(
        relative: string,
        absolute: string,
        held: { content: string; mtimeMs: number } | undefined,
    ): Promise<
        { content: string } | { skipped: string } | { untouched: true }
    > {
        if (relative.length > MAX_PATH_LENGTH) {
            return { skipped: 'its path is too long' };
        }
        const info = await lstat(absolute).catch(() => undefined);
        if (!info || !info.isFile()) return { skipped: 'not a regular file' };
        if (
            held &&
            info.mtimeMs === held.mtimeMs &&
            info.size === Buffer.byteLength(held.content, 'utf8')
        ) {
            return { untouched: true };
        }
        if (info.size > MAX_FILE_BYTES) {
            return { skipped: `over ${MAX_FILE_BYTES / 1024} KiB` };
        }
        const content = await readFile(absolute, 'utf8').catch(() => undefined);
        if (content === undefined) return { skipped: 'could not be read' };
        return validateYaml(content) === null
            ? { content }
            : { skipped: 'not valid YAML' };
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
        if (filePath.length > MAX_PATH_LENGTH) {
            throw new ParameterError(
                `Path is too long: ${filePath} exceeds ${MAX_PATH_LENGTH} characters`,
            );
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
        // Only a brand new overlay path counts against the cap: overwriting
        // an existing one never grows the workspace.
        const existing = await this.learnWorkspaceModel.getFile(
            projectUuid,
            filePath,
        );
        if (!existing) {
            const fileCount =
                await this.learnWorkspaceModel.countFiles(projectUuid);
            if (fileCount >= MAX_OVERLAY_FILES) {
                throw new ParameterError('Workspace file limit reached');
            }
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
        const staleCutoff =
            Date.now() - (this.commandTimeoutMs + STALE_RUNNING_GRACE_MS);
        const active =
            await this.learnWorkspaceModel.findActiveCommand(projectUuid);
        if (active) {
            const isStaleRunning =
                active.status === 'running' &&
                active.started_at !== null &&
                new Date(active.started_at).getTime() < staleCutoff;
            if (!isStaleRunning) {
                throw new ConflictError(
                    `${ACTIVE_COMMAND_CONFLICT_MESSAGE} (command ${active.command_uuid})`,
                );
            }
            // The active row has been 'running' for longer than a worker
            // could plausibly still be executing it (a crashed/killed
            // scheduler run): reuse the same stale-recovery path `sweep()`
            // uses, so its PAT is revoked and the row is failed before this
            // request creates a new one, instead of leaving the workspace
            // permanently locked.
            const staleRows = await this.learnWorkspaceModel.failStaleRunning(
                new Date(staleCutoff),
            );
            await Promise.all(
                staleRows.map((row) => this.sweepCommandToken(row)),
            );
        }
        // The scheduler queues are shared by every tenant on the instance;
        // a learner with several copies, or one busy org, must not be able
        // to hold all of them.
        const limits = this.activeCommandLimits;
        const counts = await this.learnWorkspaceModel.countActiveCommands({
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
            staleCutoff: new Date(staleCutoff),
        });
        if (counts.forUser >= limits.perUser) {
            throw new TooManyRequestsError(
                'You already have a command running in another training copy. Wait for it to finish and try again',
            );
        }
        if (counts.forOrganization >= limits.perOrganization) {
            throw new TooManyRequestsError(
                'Your organization has reached its limit of running Learn commands. Try again in a moment',
            );
        }
        const result = buildArgv(
            request,
            path.join(this.workspaceRoot, projectUuid, 'project'),
        );
        if (!result.ok) {
            throw new ParameterError(result.message);
        }
        let commandUuid: string;
        try {
            ({ commandUuid } = await this.learnWorkspaceModel.createCommand({
                projectUuid,
                userUuid: user.userUuid,
                argv: result.argv,
            }));
        } catch (error) {
            // Belt-and-braces: the pre-check above is racy, so the database's
            // partial unique index is the real guard against two concurrent
            // commands for the same project.
            if (isUniqueViolation(error)) {
                throw new ConflictError(ACTIVE_COMMAND_CONFLICT_MESSAGE);
            }
            throw error;
        }
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
            startedAt: command.started_at
                ? new Date(command.started_at).toISOString()
                : null,
            finishedAt: command.finished_at
                ? new Date(command.finished_at).toISOString()
                : null,
        };
    }

    async runCommand(payload: LearnSandboxCommandPayload): Promise<void> {
        const command = await this.learnWorkspaceModel.getCommand(
            payload.commandUuid,
        );
        if (!command) {
            return;
        }
        // Atomic claim: only the first delivery of a queued command flips it
        // to 'running'. A retried/duplicate scheduler delivery, or a command
        // that was already claimed, cancelled, or finished, is a no-op here
        // and never mints a PAT or touches the workspace.
        const claimed = await this.learnWorkspaceModel.claimCommand(
            payload.commandUuid,
        );
        if (!claimed) {
            return;
        }
        const runtime = resolveSandboxRuntime();
        const workspaceDir = path.join(
            this.workspaceRoot,
            `${payload.projectUuid}-${payload.commandUuid}`,
        );
        let account: Account | null = null;
        let patUuid: string | null = null;
        let token = '';
        let status: LearnCommandStatus = 'error';
        let exitCode: number | null = null;
        let keepFailed = false;
        let missingBaseline: { key: string; bundle: LearnBundle } | undefined;
        const buffer = new OutputBuffer({
            secrets: [],
            onFlush: (chunks) =>
                this.learnWorkspaceModel.appendOutput(
                    payload.commandUuid,
                    chunks,
                ),
        });
        try {
            // The payload only identifies which row to fetch (and is used
            // for logging below); the row itself — not the payload — is the
            // source of truth for whose workspace/PAT this run touches, so
            // a stale or forged payload can't point the run at a different
            // project or mint a token for a different user.
            account = fromSession(
                await this.userService.getSessionByUserUuidAndOrg(
                    command.user_uuid,
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
            const bundle = await loadLearnBundle();
            const overlay = await this.learnWorkspaceModel.listFiles(
                command.project_uuid,
            );
            await materialiseWorkspace({
                bundle,
                overlay,
                workspaceDir,
                profiles: { databasePath: runtime.databasePath },
            });
            const projectDir = path.join(workspaceDir, 'project');
            const isDownload =
                command.argv[0] === 'lightdash' &&
                command.argv[1] === 'download';
            const heldDownloads = isDownload
                ? await LearnSandboxService.heldDownloadedContent(
                      projectDir,
                      overlay,
                  )
                : new Map<string, { content: string; mtimeMs: number }>();
            const serverUrl = runtime.apiUrl ?? this.lightdashConfig.siteUrl;
            await writeCliConfig({
                workspaceDir,
                apiKey: token,
                serverUrl,
                projectUuid: command.project_uuid,
            });
            const baseEnv = buildSandboxEnvironment({
                processEnvironment: process.env,
                pathPrefix: runtime.pathPrefix,
                apiUrl: runtime.apiUrl,
                siteUrl: this.lightdashConfig.siteUrl,
                projectUuid: command.project_uuid,
                workspaceDir,
                projectDir,
                databasePath: runtime.databasePath,
            });
            // Told the version up front, the CLI skips the four `dbt --version`
            // starts it would otherwise make per deploy (CS-330).
            const dbtVersion = await detectSandboxDbtVersion(baseEnv);
            // Seeded with a parse of the pristine bundle, dbt re-parses only
            // the files the learner changed (CS-334).
            const baselineKey = partialParseBaselineKey({
                bundle,
                databasePath: runtime.databasePath,
                dbtVersion,
                sandboxPath: baseEnv.PATH ?? '',
            });
            const partialParse =
                this.partialParseRoot !== null &&
                (await seedPartialParse(
                    partialParseBaselinePath(
                        this.partialParseRoot,
                        baselineKey,
                    ),
                    workspaceDir,
                ));
            if (!partialParse && this.partialParseRoot !== null) {
                missingBaseline = { key: baselineKey, bundle };
            }
            const env = {
                ...baseEnv,
                DBT_PARTIAL_PARSE: partialParse ? 'true' : 'false',
                ...(dbtVersion === undefined
                    ? {}
                    : { LIGHTDASH_DBT_VERSION: dbtVersion }),
            };
            const isPreview = command.argv[1] === 'start-preview';
            if (isPreview) {
                // The real CLI's line when a preview of that name exists:
                // here the learner's copy is that preview.
                buffer.push(
                    'stderr',
                    `\nUpdating preview project: ${previewName(command.argv)}\n\n`,
                );
            }
            const [bin, ...args] = toSpawnArgv(command.argv);
            // No `forceKillAfterTimeout` here on purpose: it isn't part of
            // execa v5's top-level Options type, and reading execa's own
            // lib/kill.js shows it wouldn't be honoured by the `timeout`
            // option's internal kill path in this version anyway (that path
            // calls `spawned.kill(signal)` with no options object). The
            // explicit whole-process-group SIGKILL below on `timedOut`
            // already covers what a delayed single-process force-kill would
            // have provided.
            const child = this.execa(bin, args, {
                cwd: projectDir,
                env,
                extendEnv: false,
                shell: false,
                timeout: this.commandTimeoutMs,
                killSignal: 'SIGTERM',
                detached: true,
                reject: false,
                all: false,
                buffer: false,
            });
            child.stdout?.on('data', (d: Buffer) =>
                buffer.push('stdout', d.toString('utf8')),
            );
            child.stderr?.on('data', (d: Buffer) =>
                buffer.push('stderr', d.toString('utf8')),
            );
            const result = (await child) as unknown as ExecaLikeResult;
            if (result.timedOut) {
                status = 'timeout';
                // The `timeout` option only signals the immediate child; a
                // script that backgrounds work (`sleep 5 &`) can leave
                // orphans behind. `detached: true` makes this child the
                // leader of its own process group, so signalling the
                // negative pid reaches the whole tree.
                if (child.pid) {
                    try {
                        process.kill(-child.pid, 'SIGKILL');
                    } catch {
                        // Group already gone; nothing to clean up.
                    }
                }
                buffer.push(
                    'stderr',
                    `Command stopped after ${this.commandTimeoutMs / 1000}s\n`,
                );
            } else if (result.failed && result.exitCode === undefined) {
                // The process never started (e.g. the binary doesn't exist
                // in the sandbox PATH): there is no exit code to report, so
                // the terminal would otherwise show nothing at all.
                status = 'error';
                buffer.push(
                    'stderr',
                    `${
                        result.shortMessage ??
                        result.message ??
                        'Command failed to start'
                    }\n`,
                );
            } else if (result.exitCode === 0) {
                status = 'done';
                if (isDownload) {
                    try {
                        await this.keepDownloadedFiles(
                            command.project_uuid,
                            projectDir,
                            heldDownloads,
                            buffer,
                        );
                    } catch (e) {
                        // The CLI succeeded but its files did not reach the
                        // workspace: the learner is told so in plain words
                        // and can run it again, rather than reading a
                        // database error or looking for files that never
                        // appear.
                        status = 'error';
                        keepFailed = true;
                        this.logger.error(
                            `Learn sandbox: command ${payload.commandUuid} could not keep its downloaded files: ${getErrorMessage(e)}`,
                        );
                        buffer.push(
                            'stderr',
                            'The download finished, but its files could not be saved to your workspace. Run the command again.\n',
                        );
                    }
                }
                if (isPreview) {
                    buffer.push(
                        'stderr',
                        `Project updated on ${this.lightdashConfig.siteUrl.replace(/\/$/, '')}/projects/${command.project_uuid}/tables\n`,
                    );
                }
            } else {
                status = 'error';
            }
            exitCode = keepFailed ? null : (result.exitCode ?? null);
        } catch (e) {
            status = 'error';
            exitCode = null;
            buffer.push('stderr', `${getErrorMessage(e)}\n`);
            throw e;
        } finally {
            await buffer.close();
            if (buffer.error) {
                const priorError = buffer.error;
                this.logger.warn(
                    `Learn sandbox: command ${payload.commandUuid} lost output when the buffer failed to flush: ${getErrorMessage(priorError)}`,
                );
                const fallbackText = 'Some output could not be stored\n';
                buffer.push('stderr', fallbackText);
                const fallbackSeq = buffer.lastSeq;
                await buffer.flush();
                // `buffer.error` never clears on a successful flush — it
                // only ever gets overwritten by a new failure — so an
                // unchanged reference here means this flush went through.
                if (buffer.error !== priorError) {
                    await this.learnWorkspaceModel
                        .appendOutput(payload.commandUuid, [
                            {
                                seq: fallbackSeq,
                                stream: 'stderr',
                                text: fallbackText,
                            },
                        ])
                        .catch((directError) => {
                            this.logger.warn(
                                `Learn sandbox: command ${payload.commandUuid} could not persist the fallback output line either: ${getErrorMessage(directError)}`,
                            );
                        });
                }
            }
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
            // Built after the command has finished, so the learner who
            // found no baseline does not wait for it (or share the CPU with
            // it); the next command on this worker picks it up.
            if (missingBaseline) {
                this.ensurePartialParseBaseline(missingBaseline, runtime);
            }
        }
    }

    private ensurePartialParseBaseline(
        { key, bundle }: { key: string; bundle: LearnBundle },
        runtime: LearnSandboxRuntime,
    ): void {
        const root = this.partialParseRoot;
        if (root === null || this.partialParseBuilds.has(key)) {
            return;
        }
        const retryAt = this.partialParseRetryAt.get(key);
        if (retryAt !== undefined && Date.now() < retryAt) {
            return;
        }
        const build = buildPartialParseBaseline({
            root,
            key,
            bundle,
            databasePath: runtime.databasePath,
            pathPrefix: runtime.pathPrefix,
            processEnvironment: process.env,
            execa: this.execa,
        })
            .catch(() => false)
            .then((built) => {
                if (built) {
                    this.partialParseRetryAt.delete(key);
                    this.logger.info(
                        `Learn sandbox: built partial-parse baseline ${key}`,
                    );
                } else {
                    this.partialParseRetryAt.set(
                        key,
                        Date.now() + PARTIAL_PARSE_RETRY_MS,
                    );
                    this.logger.warn(
                        `Learn sandbox: could not build partial-parse baseline ${key}; commands keep running full parses`,
                    );
                }
            })
            .finally(() => {
                this.partialParseBuilds.delete(key);
            });
        this.partialParseBuilds.set(key, build);
    }

    async sweep(): Promise<{
        tokensDeleted: number;
        workspacesRemoved: number;
    }> {
        const staleCutoff = new Date(
            Date.now() - this.commandTimeoutMs - STALE_RUNNING_GRACE_MS,
        );
        const [finishedRows, staleRows] = await Promise.all([
            this.learnWorkspaceModel.listCommandsWithTokens(),
            this.learnWorkspaceModel.failStaleRunning(staleCutoff),
        ]);
        let tokensDeleted = 0;
        // eslint-disable-next-line no-restricted-syntax
        for (const row of [...finishedRows, ...staleRows]) {
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
     * Revokes the PAT for a single finished (or newly-failed-stale) command.
     * Best effort: the token reference is only cleared when the revoke
     * actually succeeded, or when the project/user it belonged to is gone
     * (NotFoundError) and there is nothing left to revoke against — any
     * other error leaves `pat_uuid` set so the next sweep retries it.
     */
    private async sweepCommandToken(row: {
        command_uuid: string;
        pat_uuid: string | null;
        project_uuid: string;
        user_uuid: string;
    }): Promise<boolean> {
        if (!row.pat_uuid) {
            return false;
        }
        let revoked = false;
        let shouldClearToken = false;
        try {
            const project = await this.projectModel.getSummary(
                row.project_uuid,
            );
            const session = await this.userService.getSessionByUserUuidAndOrg(
                row.user_uuid,
                project.organizationUuid,
            );
            const account = fromSession(session);
            await this.personalAccessTokenService.deletePersonalAccessToken(
                account,
                row.pat_uuid,
            );
            revoked = true;
            shouldClearToken = true;
        } catch (error) {
            if (error instanceof NotFoundError) {
                shouldClearToken = true;
            } else {
                this.logger.warn(
                    `Learn sandbox sweep: could not revoke token for ${row.command_uuid}: ${getErrorMessage(error)}`,
                );
            }
        }
        if (shouldClearToken) {
            await this.learnWorkspaceModel.clearToken(row.command_uuid);
        }
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
        return runtime.lightdash && runtime.dbt && runtime.node;
    }
}
