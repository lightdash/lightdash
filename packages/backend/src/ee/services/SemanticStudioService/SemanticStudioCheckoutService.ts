import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getErrorMessage,
    isExploreError,
    isPullRequestOpen,
    isSemanticStudioThread,
    isUserManagedExplore,
    JobStatusType,
    NotFoundError,
    ParameterError,
    ProjectType,
    type AiAgentSummary,
    type AiThreadCreatedFrom,
    type CompileSemanticStudioBranchPayload,
    type Explore,
    type ExploreError,
    type ExploreType,
    type SaveSemanticStudioSourceRequest,
    type SemanticStudioBranchCompileFollowUp,
    type SemanticStudioBranchCompileFollowUpBody,
    type SemanticStudioCheckout,
    type SemanticStudioSourceFile,
    type SemanticStudioSources,
    type SemanticStudioSourceSave,
    type SemanticStudioWorkspace,
    type SessionUser,
    type WritebackMergeResult,
} from '@lightdash/common';
import { NATIVE_MODEL_DIRECTORIES } from '@lightdash/common/lightdash/loader';
import { setTimeout as delay } from 'node:timers/promises';
import {
    type LightdashAnalytics,
    type SemanticStudioActivity,
} from '../../../analytics/LightdashAnalytics';
import { type JobModel } from '../../../models/JobModel/JobModel';
import { BaseService } from '../../../services/BaseService';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { startStepTimings } from '../../../utils/stepTimings';
import { type AiAgentModel } from '../../models/AiAgentModel';
import { type SemanticStudioWorkspaceModel } from '../../models/SemanticStudioWorkspaceModel';
import {
    type AgentTurnSetup,
    type AgentWritebackSetup,
} from '../ai/types/agentTurnSetup';
import { type AiWritebackService } from '../AiWritebackService/AiWritebackService';
import { WritebackThreadPrClosedError } from '../AiWritebackService/errors';
import { sourceRevision } from '../AiWritebackService/utils';
import { type WritebackPreviewService } from '../AiWritebackService/WritebackPreviewService';
import {
    quoteCompileOutput,
    type BranchCompileCheck,
} from './branchCompileCheck';
import { type StudioFileStorage } from './checkedExplores';
import { type DbtScriptChange } from './dbtManifestPatch';
import {
    findDbtDraftExplores,
    saveDbtTryOut,
    type DbtTryOut,
} from './dbtTryOut';
import { type IncrementalDbtCompileService } from './IncrementalDbtCompileService';
import { type SemanticStudioService } from './SemanticStudioService';
import {
    trackStudioActivity,
    worksAsDbtPullRequests,
    type ModelProject,
} from './studioProject';
import { getStudioProjectMode, getStudioTurnSetup } from './studioTurn';

export type SemanticStudioCheckoutServiceArguments = {
    analytics: Pick<LightdashAnalytics, 'track'>;
    studio: Pick<
        SemanticStudioService,
        | 'getStatus'
        | 'assertCanUseStudio'
        | 'mergePullRequest'
        | 'findDraftExplores'
    >;
    projectModel: {
        get: (projectUuid: string) => Promise<ModelProject>;
        getAllExploreSummaries: (
            projectUuid: string,
        ) => Promise<{ name: string; type?: ExploreType }[]>;
        findExploresFromCache: (
            projectUuid: string,
            key: 'name',
        ) => Promise<Record<string, Explore | ExploreError>>;
    };
    workspaceModel: Pick<
        SemanticStudioWorkspaceModel,
        | 'findStudioThread'
        | 'findInProject'
        | 'find'
        | 'findActive'
        | 'start'
        | 'create'
        | 'attachPullRequest'
        | 'attachThreadPullRequest'
        | 'requestBranchCompile'
        | 'finishBranchCompile'
        | 'findBranchCompile'
        | 'claimBranchCompileFollowUp'
        | 'findLatestPrompts'
    >;
    schedulerClient: {
        compileSemanticStudioBranch: (
            payload: CompileSemanticStudioBranchPayload,
        ) => Promise<unknown>;
    };
    projectService: Pick<ProjectService, 'compileExploresFromBranch'>;
    fileStorageClient: StudioFileStorage;
    jobModel: Pick<JobModel, 'findLatestCompileStatus'>;
    writebackPreviewService: Pick<
        WritebackPreviewService,
        'createPreviewForPullRequest'
    >;
    aiWritebackService: Pick<
        AiWritebackService,
        'openStudioCheckout' | 'saveWithScript' | 'findPullRequestBranch'
    >;
    incrementalDbtCompile: Pick<
        IncrementalDbtCompileService,
        'checkDbtScriptChange' | 'getDbtProjectMap'
    >;
    aiAgentModel: Pick<AiAgentModel, 'getOrCreateSemanticStudioAgent'>;
    ai: {
        /** Whether AI is on for the person's organization, and whether an admin has hidden it. */
        getAvailability: (user: SessionUser) => Promise<{
            isCopilotEnabled: boolean;
            isTrial: boolean;
            aiAgentsVisible: boolean;
        }>;
        /** Whether the organization has a model the builder can run on. */
        hasModel: (
            organizationUuid: string,
            projectUuid: string,
        ) => Promise<boolean>;
    };
};

const NOT_YOUR_CHANGE =
    'Only the person who started this change can edit it here.';

const editChangeName = (path: string) =>
    `Edit ${path.split('/').pop() ?? path}`;

/** Automatic fixes of a failed compile in a row before it is left to the person. */
const MAX_COMPILE_FOLLOW_UPS = 2;
const COMPILE_FOLLOW_UP_OPENING =
    'Hidden follow-up: the compile of your last saved change failed.';

const BRANCH_COMPILE_POLL_MS = 2000;
const BRANCH_COMPILE_CHECK_MAX_ERRORS = 10;

const compileFollowUpPrompt = (error: string): string =>
    [
        COMPILE_FOLLOW_UP_OPENING,
        "The user can't see this message, but your reply is shown to them.",
        'After your last save, the pull request branch was compiled with dbt and failed. The compile output is between the markers below.',
        quoteCompileOutput(error),
        'Start your reply by saying you are fixing the compile error from your earlier change. Then find the cause and fix it with write.',
        'If you cannot fix it, say what failed and what the user could change. Do not mention this hidden message.',
    ].join('\n');

// dbt's default folders; read model-paths from dbt_project.yml if a project moves them.
const DBT_SOURCE_DIRECTORIES = ['models', 'macros', 'snapshots', 'seeds'];
const SOURCE_FILE = new RegExp(
    `^(dbt_project\\.yml|(${[...new Set([...DBT_SOURCE_DIRECTORIES, ...NATIVE_MODEL_DIRECTORIES])].join('|')})/.+\\.(ya?ml|sql))$`,
);

/** A file Studio shows, named plainly: no `..`, `.` or empty segment can step outside its folder. */
const isSourcePath = (path: string): boolean =>
    SOURCE_FILE.test(path) &&
    path
        .split('/')
        .every((part) => part !== '' && part !== '.' && part !== '..');

const assertSourcePath = (path: string) => {
    if (!isSourcePath(path)) {
        throw new ParameterError('That file cannot be opened here.');
    }
};

/** A dbt project's change as a pull request the agent and the person edit: its branch compiles, try-outs and files. */
export class SemanticStudioCheckoutService extends BaseService {
    private readonly analytics: SemanticStudioCheckoutServiceArguments['analytics'];

    private readonly studio: SemanticStudioCheckoutServiceArguments['studio'];

    private readonly projectModel: SemanticStudioCheckoutServiceArguments['projectModel'];

    private readonly workspaceModel: SemanticStudioCheckoutServiceArguments['workspaceModel'];

    private readonly schedulerClient: SemanticStudioCheckoutServiceArguments['schedulerClient'];

    private readonly projectService: SemanticStudioCheckoutServiceArguments['projectService'];

    private readonly fileStorageClient: SemanticStudioCheckoutServiceArguments['fileStorageClient'];

    private readonly jobModel: SemanticStudioCheckoutServiceArguments['jobModel'];

    private readonly writebackPreviewService: SemanticStudioCheckoutServiceArguments['writebackPreviewService'];

    private readonly aiWritebackService: SemanticStudioCheckoutServiceArguments['aiWritebackService'];

    private readonly incrementalDbtCompile: SemanticStudioCheckoutServiceArguments['incrementalDbtCompile'];

    private readonly aiAgentModel: SemanticStudioCheckoutServiceArguments['aiAgentModel'];

    private readonly ai: SemanticStudioCheckoutServiceArguments['ai'];

    constructor(args: SemanticStudioCheckoutServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.studio = args.studio;
        this.projectModel = args.projectModel;
        this.workspaceModel = args.workspaceModel;
        this.schedulerClient = args.schedulerClient;
        this.projectService = args.projectService;
        this.fileStorageClient = args.fileStorageClient;
        this.jobModel = args.jobModel;
        this.writebackPreviewService = args.writebackPreviewService;
        this.aiWritebackService = args.aiWritebackService;
        this.incrementalDbtCompile = args.incrementalDbtCompile;
        this.aiAgentModel = args.aiAgentModel;
        this.ai = args.ai;
    }

    private track(
        user: SessionUser,
        projectUuid: string,
        activity: SemanticStudioActivity,
    ): void {
        trackStudioActivity(
            {
                analytics: this.analytics,
                projectModel: this.projectModel,
                logger: this.logger,
            },
            user,
            projectUuid,
            activity,
        );
    }

    /** Whether this person works on this project as a dbt project's pull requests. */
    private async isDbtCheckout(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        return worksAsDbtPullRequests(
            await this.studio.getStatus(user, projectUuid),
        );
    }

    /** Refuses anyone who cannot use Studio here, and with `notDbt` a project that is not a dbt project in a repository. */
    private async assertDbtCheckout(
        user: SessionUser,
        projectUuid: string,
        notDbt: string,
    ): Promise<void> {
        const status = await this.studio.assertCanUseStudio(user, projectUuid);
        if (!worksAsDbtPullRequests(status)) {
            throw new ParameterError(notDbt);
        }
    }

    /**
     * Has a worker compile the branch of the person's open change on this pull
     * request, as a refresh would; nothing for a change that is not theirs or a
     * project that is not dbt in a repository.
     */
    async queueBranchCompile(
        user: SessionUser,
        projectUuid: string,
        prUrl: string,
        requestedBy: 'agent' | 'person',
    ): Promise<void> {
        if (!(await this.isDbtCheckout(user, projectUuid))) return;
        const workspace = (
            await this.workspaceModel.findInProject(projectUuid, user.userUuid)
        ).find(
            (candidate) =>
                candidate.isMine &&
                !candidate.finishedAt &&
                candidate.pullRequest?.url === prUrl,
        );
        if (!workspace) return;
        await this.requestBranchCompile(
            user,
            projectUuid,
            workspace.workspaceUuid,
            requestedBy,
        );
    }

    private async requestBranchCompile(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
        requestedBy: 'agent' | 'person',
    ): Promise<void> {
        const compileRequestUuid =
            await this.workspaceModel.requestBranchCompile(
                workspaceUuid,
                requestedBy === 'agent',
            );
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        await this.schedulerClient.compileSemanticStudioBranch({
            organizationUuid,
            projectUuid,
            userUuid: user.userUuid,
            workspaceUuid,
            compileRequestUuid,
        });
    }

    /** The compile of a checked-out dbt draft's branch; one that has a pull request and was never compiled starts now, so nobody has to ask. */
    private async findOrStartBranchCompile(
        user: SessionUser,
        { workspaceUuid, projectUuid, pullRequest }: SemanticStudioWorkspace,
    ) {
        const compile =
            await this.workspaceModel.findBranchCompile(workspaceUuid);
        if (compile || !isPullRequestOpen(pullRequest)) {
            return compile;
        }
        try {
            await this.requestBranchCompile(
                user,
                projectUuid,
                workspaceUuid,
                'person',
            );
        } catch (error) {
            this.logger.warn(
                `SemanticStudio: could not start the compile of workspace ${workspaceUuid}: ${getErrorMessage(error)}`,
            );
            return null;
        }
        return this.workspaceModel.findBranchCompile(workspaceUuid);
    }

    /** The change this person has checked out, which the whole app shows them; null on what is published or without Studio. */
    async getCheckout(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticStudioCheckout | null> {
        const status = await this.studio.getStatus(user, projectUuid);
        if (!status.enabled) return null;
        const active = await this.workspaceModel.findActive({
            projectUuid,
            userUuid: user.userUuid,
        });
        if (!active) return null;
        const compile = worksAsDbtPullRequests(status)
            ? await this.findOrStartBranchCompile(user, active)
            : null;
        return {
            workspaceUuid: active.workspaceUuid,
            name: active.name,
            appliesAs: status.appliesAs,
            branchCompile: compile && {
                status: compile.status,
                branch: compile.branch,
                error: compile.error,
                hasExplores: compile.explores !== null,
                requestedAt: compile.requestedAt,
                compiledAt: compile.compiledAt,
                compileRequestUuid: compile.compileRequestUuid,
                requestedByAgent: compile.requestedByAgent,
            },
        };
    }

    /** Compiles the checked-out dbt change's branch again, such as after it moved outside the app. */
    async compileCheckout(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticStudioCheckout | null> {
        await this.assertDbtCheckout(
            user,
            projectUuid,
            'Only a change to a dbt project in a repository is compiled from its branch',
        );
        const active = await this.workspaceModel.findActive({
            projectUuid,
            userUuid: user.userUuid,
        });
        if (!active?.pullRequest) {
            throw new ParameterError(
                'This draft has no pull request to compile yet',
            );
        }
        await this.requestBranchCompile(
            user,
            projectUuid,
            active.workspaceUuid,
            'person',
        );
        return this.getCheckout(user, projectUuid);
    }

    /**
     * The hidden prompt that sends a failed compile of the agent's last save back to
     * the agent, once per compile; null when the person spoke since, a turn is still
     * running, or the agent already had its tries.
     */
    async claimBranchCompileFollowUp(
        user: SessionUser,
        projectUuid: string,
        {
            compileRequestUuid,
            threadUuid,
        }: SemanticStudioBranchCompileFollowUpBody,
    ): Promise<SemanticStudioBranchCompileFollowUp | null> {
        if (!(await this.isDbtCheckout(user, projectUuid))) return null;
        const active = await this.workspaceModel.findActive({
            projectUuid,
            userUuid: user.userUuid,
        });
        if (active?.threadUuid !== threadUuid || !active.agentUuid) {
            return null;
        }
        const compile = await this.workspaceModel.findBranchCompile(
            active.workspaceUuid,
        );
        if (
            !compile ||
            compile.compileRequestUuid !== compileRequestUuid ||
            compile.status !== 'failed' ||
            !compile.requestedByAgent ||
            compile.error === null
        ) {
            return null;
        }
        const prompts = await this.workspaceModel.findLatestPrompts(
            active.threadUuid,
            MAX_COMPILE_FOLLOW_UPS + 1,
        );
        const latest = prompts[0];
        const spokeSince = prompts.some(
            (prompt) =>
                !prompt.hidden && prompt.created_at > compile.requestedAt,
        );
        const firstOther = prompts.findIndex(
            (prompt) =>
                !prompt.hidden ||
                !prompt.prompt.startsWith(COMPILE_FOLLOW_UP_OPENING),
        );
        const followUpsInARow = firstOther === -1 ? prompts.length : firstOther;
        if (
            !latest ||
            latest.responded_at === null ||
            spokeSince ||
            followUpsInARow >= MAX_COMPILE_FOLLOW_UPS
        ) {
            return null;
        }
        const claimed = await this.workspaceModel.claimBranchCompileFollowUp(
            active.workspaceUuid,
            compileRequestUuid,
        );
        if (!claimed) return null;
        this.logger.info('Semantic Studio compile follow-up claimed', {
            event: 'semantic_studio.branch_compile.follow_up',
            projectUuid,
            workspaceUuid: active.workspaceUuid,
            compileRequestUuid,
            attempt: followUpsInARow + 1,
        });
        return {
            agentUuid: active.agentUuid,
            threadUuid: active.threadUuid,
            prompt: compileFollowUpPrompt(compile.error),
        };
    }

    /** A Studio thread keeps one pull request, shows it at once, and compiles its branch after every save. */
    getAgentWritebackSetup(
        user: SessionUser,
        projectUuid: string,
    ): AgentWritebackSetup {
        return {
            continuesThreadPullRequest: true,
            showsPullRequestBeforePreview: true,
            onSaved: (prUrl) =>
                this.queueBranchCompile(user, projectUuid, prUrl, 'agent'),
        };
    }

    /** The save setup of a Studio thread; null for any other thread, which Studio has no say in. */
    async findAgentWritebackSetup({
        user,
        projectUuid,
        threadCreatedFrom,
    }: {
        user: SessionUser;
        projectUuid: string;
        threadCreatedFrom: AiThreadCreatedFrom | undefined;
    }): Promise<AgentWritebackSetup | null> {
        return isSemanticStudioThread(threadCreatedFrom)
            ? this.getAgentWritebackSetup(user, projectUuid)
            : null;
    }

    /** What a Studio thread brings to each of its turns on this project. */
    async getAgentTurnSetup(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AgentTurnSetup> {
        return getStudioTurnSetup(
            await getStudioProjectMode(
                await this.studio.getStatus(user, projectUuid),
                () => this.incrementalDbtCompile.getDbtProjectMap(projectUuid),
            ),
        );
    }

    /** The built-in agent behind this project's Studio chat, created the first time someone who can use Studio asks for it. */
    async getBuilderAgent(
        user: SessionUser,
        projectUuid: string,
    ): Promise<AiAgentSummary> {
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('Organization not found');
        }
        await this.assertAiIsLive(user, organizationUuid, projectUuid);
        await this.studio.assertCanUseStudio(user, projectUuid);
        return this.aiAgentModel.getOrCreateSemanticStudioAgent({
            organizationUuid,
            projectUuid,
        });
    }

    /** AI is on for the organization, an admin has not hidden it, and there is a model to run on. */
    private async assertAiIsLive(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
    ): Promise<void> {
        const ai = await this.ai.getAvailability(user);
        if (!ai.isCopilotEnabled && !ai.isTrial) {
            throw new ForbiddenError('Copilot is not enabled');
        }
        if (!ai.aiAgentsVisible) {
            throw new ForbiddenError('AI is turned off for this organization');
        }
        if (!(await this.ai.hasModel(organizationUuid, projectUuid))) {
            throw new ForbiddenError(
                'No AI model is configured for this organization',
            );
        }
    }

    /**
     * Waits for the agent's latest save on this thread's pull request and for the
     * branch compile after it, so the agent can check its change in the same turn.
     */
    async waitForBranchCompile(
        user: SessionUser,
        projectUuid: string,
        {
            threadUuid,
            isSaving,
            timeoutMs,
        }: {
            threadUuid: string;
            isSaving: () => Promise<boolean>;
            timeoutMs: number;
        },
    ): Promise<BranchCompileCheck> {
        const startedAt = Date.now();
        const check = await this.pollBranchCompile(user, projectUuid, {
            threadUuid,
            isSaving,
            deadline: startedAt + timeoutMs,
        });
        this.logger.info('Semantic Studio branch compile checked', {
            event: 'semantic_studio.branch_compile.checked',
            projectUuid,
            status: check.status,
            waitedMs: Date.now() - startedAt,
        });
        return check;
    }

    private async pollBranchCompile(
        user: SessionUser,
        projectUuid: string,
        {
            threadUuid,
            isSaving,
            deadline,
        }: {
            threadUuid: string;
            isSaving: () => Promise<boolean>;
            deadline: number;
        },
    ): Promise<BranchCompileCheck> {
        if (!(await this.isDbtCheckout(user, projectUuid))) {
            return { status: 'unavailable' };
        }
        const active = await this.workspaceModel.findActive({
            projectUuid,
            userUuid: user.userUuid,
        });
        if (active?.threadUuid !== threadUuid)
            return { status: 'nothing_saved' };
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const saving = await isSaving();
            const compile = saving
                ? null
                : // eslint-disable-next-line no-await-in-loop
                  await this.workspaceModel.findBranchCompile(
                      active.workspaceUuid,
                  );
            if (!saving && !compile) return { status: 'nothing_saved' };
            if (compile?.status === 'failed') {
                // The agent sees this failure now, so it is not sent back again after the turn.
                // eslint-disable-next-line no-await-in-loop
                await this.workspaceModel.claimBranchCompileFollowUp(
                    active.workspaceUuid,
                    compile.compileRequestUuid,
                );
                return {
                    status: 'failed',
                    error: compile.error ?? 'The compile failed.',
                };
            }
            if (compile?.status === 'ready') {
                return {
                    status: 'ready',
                    exploreErrors: (compile.explores ?? [])
                        .filter(isExploreError)
                        .slice(0, BRANCH_COMPILE_CHECK_MAX_ERRORS)
                        .map((explore) => ({
                            name: explore.name,
                            errors: explore.errors.map(
                                ({ message }) => message,
                            ),
                        })),
                };
            }
            if (Date.now() >= deadline) {
                return { status: saving ? 'saving' : 'compiling' };
            }
            // eslint-disable-next-line no-await-in-loop
            await delay(BRANCH_COMPILE_POLL_MS);
        }
    }

    /** Publishes the checked-out dbt draft: merges its pull request once its branch compiled, and the project refreshes. */
    async publishCheckout(
        user: SessionUser,
        projectUuid: string,
        prUrl: string,
    ): Promise<WritebackMergeResult> {
        await this.assertDbtCheckout(
            user,
            projectUuid,
            'Only a draft of a dbt project in a repository is published from here',
        );
        const active = await this.workspaceModel.findActive({
            projectUuid,
            userUuid: user.userUuid,
        });
        if (!active || active.pullRequest?.url !== prUrl) {
            throw new ParameterError(
                'This pull request is not the draft you have checked out',
            );
        }
        const compile = await this.workspaceModel.findBranchCompile(
            active.workspaceUuid,
        );
        if (compile?.status !== 'ready') {
            throw new ParameterError(
                'This draft can be published once its latest edit compiles',
            );
        }
        const result = await this.studio.mergePullRequest(
            user,
            projectUuid,
            prUrl,
            { sha: undefined, incrementalCompile: true },
        );
        this.track(
            user,
            projectUuid,
            result.merged
                ? {
                      event: 'semantic_studio.draft_published',
                      properties: { outcome: 'merged', scope: 'draft' },
                  }
                : {
                      event: 'semantic_studio.publish_failed',
                      properties: { reason: 'merge_refused', scope: 'draft' },
                  },
        );
        return result;
    }

    /** The worker's compile of a change's branch; a failure is kept for the person to see, with the last good explores. */
    async compileBranch({
        organizationUuid,
        projectUuid,
        userUuid,
        workspaceUuid,
        compileRequestUuid,
    }: CompileSemanticStudioBranchPayload): Promise<void> {
        const timings = startStepTimings();
        let outcome: 'ready' | 'failed' | 'no_pull_request' | 'no_branch' =
            'failed';
        let counts = { exploreCount: 0, exploreErrorCount: 0 };
        let dbtTimings: Record<string, number | null> = {};
        const fail = (branch: string | null, error: string) =>
            this.workspaceModel.finishBranchCompile(
                workspaceUuid,
                compileRequestUuid,
                { status: 'failed', branch, error },
            );
        try {
            const workspace = await this.workspaceModel.find(
                workspaceUuid,
                userUuid,
            );
            const prUrl = workspace?.pullRequest?.url ?? null;
            if (!workspace || workspace.finishedAt || prUrl === null) {
                outcome = 'no_pull_request';
                await fail(
                    null,
                    'This draft has no open pull request to compile.',
                );
                return;
            }
            let branch: string;
            try {
                branch = await this.aiWritebackService.findPullRequestBranch(
                    organizationUuid,
                    projectUuid,
                    prUrl,
                );
            } catch (error) {
                this.logger.warn(
                    `SemanticStudio: could not read the branch of ${prUrl}: ${getErrorMessage(error)}`,
                );
                outcome = 'no_branch';
                await fail(
                    null,
                    "Could not read this draft's branch. Its pull request may be merged, closed or in another repository.",
                );
                return;
            }
            timings.mark('branchLookup');
            try {
                const compiled =
                    await this.projectService.compileExploresFromBranch(
                        { userUuid, organizationUuid },
                        projectUuid,
                        branch,
                    );
                timings.mark('compile');
                dbtTimings = compiled.timings;
                const exploreErrorCount =
                    compiled.explores.filter(isExploreError).length;
                counts = {
                    exploreCount: compiled.explores.length - exploreErrorCount,
                    exploreErrorCount,
                };
                await this.workspaceModel.finishBranchCompile(
                    workspaceUuid,
                    compileRequestUuid,
                    { status: 'ready', branch, explores: compiled.explores },
                );
                timings.mark('save');
                outcome = 'ready';
            } catch (error) {
                await fail(branch, getErrorMessage(error));
            }
        } finally {
            this.logger.info('Semantic Studio branch compile timed', {
                event: 'semantic_studio.branch_compile.timed',
                projectUuid,
                workspaceUuid,
                compileRequestUuid,
                outcome,
                ...counts,
                ...dbtTimings,
                ...timings.summary(),
            });
        }
    }

    /** Every explore as the person's unpublished change leaves it: their checked-out dbt change, else their draft. */
    async findDevelopmentExplores(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Map<string, Explore | ExploreError | null> | null> {
        const status = await this.studio.getStatus(user, projectUuid);
        if (status.appliesAs !== 'dbt_pull_request') {
            return this.studio.findDraftExplores(user, projectUuid);
        }
        return status.enabled
            ? findDbtDraftExplores(
                  {
                      storage: this.fileStorageClient,
                      workspaceModel: this.workspaceModel,
                  },
                  { projectUuid, userUuid: user.userUuid },
              )
            : null;
    }

    /**
     * Every explore as a dbt project's pull request leaves it, read from the preview
     * project built from that branch; null when this is not such a preview or the
     * person may not use it. A dbt project keeps no draft, so this is how its
     * unpublished changes are queried on the live project.
     */
    async findPreviewExplores(
        user: SessionUser,
        projectUuid: string,
        previewProjectUuid: string,
    ): Promise<Map<string, Explore | ExploreError | null> | null> {
        if (!(await this.isDbtCheckout(user, projectUuid))) return null;
        const preview = await this.projectModel.get(previewProjectUuid);
        if (
            preview.type !== ProjectType.PREVIEW ||
            preview.upstreamProjectUuid !== projectUuid ||
            this.createAuditedAbility(user).cannot(
                'view',
                subject('Project', {
                    organizationUuid: preview.organizationUuid,
                    projectUuid: preview.projectUuid,
                }),
            )
        ) {
            return null;
        }
        const [live, explores] = await Promise.all([
            this.projectModel.getAllExploreSummaries(projectUuid),
            this.projectModel.findExploresFromCache(previewProjectUuid, 'name'),
        ]);
        const draftExplores = () =>
            findDbtDraftExplores(
                {
                    storage: this.fileStorageClient,
                    workspaceModel: this.workspaceModel,
                },
                { projectUuid, userUuid: user.userUuid },
            );
        // Until its first compile a preview holds only the explores copied into it; the person's own compiled change stands in.
        if (Object.values(explores).every(isUserManagedExplore)) {
            return draftExplores();
        }
        // A reused preview holds the previous round until its compile ends, and for good if that compile fails.
        const compile =
            await this.jobModel.findLatestCompileStatus(previewProjectUuid);
        if (compile !== null && compile !== JobStatusType.DONE) {
            const tryOut = await draftExplores();
            if (tryOut) return tryOut;
        }
        return new Map<string, Explore | ExploreError | null>([
            // A model the branch removes is in the live project and not in its preview.
            ...live.flatMap((explore): [string, null][] =>
                isUserManagedExplore(explore) ? [] : [[explore.name, null]],
            ),
            ...Object.values(explores).map(
                (explore): [string, Explore | ExploreError] => [
                    explore.name,
                    explore,
                ],
            ),
        ]);
    }

    /** The project's YAML and SQL files, at a change's open pull request or the branch it deploys from. */
    async listSources(
        user: SessionUser,
        projectUuid: string,
        prUrl: string | null,
    ): Promise<SemanticStudioSources> {
        await this.studio.assertCanUseStudio(user, projectUuid);
        const { checkout, root } =
            await this.aiWritebackService.openStudioCheckout(
                user,
                projectUuid,
                prUrl,
            );
        const files = (await checkout.listFiles())
            .filter((path) => path.startsWith(root))
            .map((path) => path.slice(root.length))
            .filter(isSourcePath)
            .sort();
        return { branch: checkout.branch, prUrl: checkout.prUrl, files };
    }

    async readSource(
        user: SessionUser,
        projectUuid: string,
        prUrl: string | null,
        path: string,
    ): Promise<SemanticStudioSourceFile> {
        assertSourcePath(path);
        await this.studio.assertCanUseStudio(user, projectUuid);
        const { checkout, root } =
            await this.aiWritebackService.openStudioCheckout(
                user,
                projectUuid,
                prUrl,
            );
        const content = await checkout.readFile(`${root}${path}`);
        return {
            path,
            content,
            revision: content === null ? null : sourceRevision(content),
        };
    }

    /** Commits a hand edit to your own change's pull request, or opens one; YAML is compiled first, SQL is left to dbt. */
    async saveSource(
        user: SessionUser,
        projectUuid: string,
        {
            path,
            content,
            revision,
            prUrl,
            threadUuid,
        }: SaveSemanticStudioSourceRequest,
    ): Promise<SemanticStudioSourceSave> {
        assertSourcePath(path);
        await this.studio.assertCanUseStudio(user, projectUuid);
        if (
            threadUuid !== null &&
            !(await this.workspaceModel.findStudioThread(
                { projectUuid, userUuid: user.userUuid },
                threadUuid,
            ))
        ) {
            throw new ForbiddenError(NOT_YOUR_CHANGE);
        }
        if (prUrl !== null) {
            const workspaces = await this.workspaceModel.findInProject(
                projectUuid,
                user.userUuid,
            );
            const isYours = workspaces.some(
                (workspace) =>
                    workspace.isMine && workspace.pullRequest?.url === prUrl,
            );
            if (!isYours) {
                throw new ForbiddenError(NOT_YOUR_CHANGE);
            }
        }
        const script = `repo.write(${JSON.stringify(path)}, ${JSON.stringify(content)});`;
        const args = {
            agentPermissionsApply: true,
            user,
            projectUuid,
            prompt: `Edit ${path}`,
            prUrl,
            startNewPullRequest: false,
            aiThreadUuid: threadUuid ?? undefined,
            source: 'web' as const,
        };
        const compile = (change: DbtScriptChange) =>
            this.incrementalDbtCompile.checkDbtScriptChange(
                user,
                projectUuid,
                change,
                {
                    checkQueries: false,
                },
            );
        const save = (dryRun: boolean) =>
            this.aiWritebackService.saveWithScript(args, script, {
                dryRun,
                assertPublishAllowed: null,
                checkDbt: compile,
                expectedSource:
                    revision === undefined ? null : { path, revision },
            });
        // The writeback's own wording tells the agent what to call next, which is no use to a person.
        const forPerson = (error: unknown): never => {
            if (error instanceof WritebackThreadPrClosedError) {
                throw new ParameterError(
                    `This draft's pull request is ${error.reason}, so it can no longer be edited. Go back to Published and edit there to start a new draft.`,
                );
            }
            throw error;
        };
        const dryRun = await save(true).catch(forPerson);
        const trackFailed = () =>
            this.track(user, projectUuid, {
                event: 'semantic_studio.change_failed',
                properties: {
                    source: 'hand',
                    reason: 'check_failed',
                    modelCount: null,
                },
            });
        if (dryRun?.status === 'script_failed') {
            trackFailed();
            return { status: 'failed', error: dryRun.error };
        }
        const saved = await save(false).catch(forPerson);
        if (saved === null) {
            throw new ParameterError(
                'This draft cannot take hand edits. Ask for the change in the chat, or go back to Published and edit there to start a new draft.',
            );
        }
        if (saved.status === 'script_failed') {
            trackFailed();
            return { status: 'failed', error: saved.error };
        }
        if (saved.status !== 'saved') {
            throw new ParameterError('The edit was checked but not saved.');
        }
        const { prUrl: savedPrUrl, commitSha } = saved.result;
        if (!savedPrUrl || !commitSha) {
            throw new ParameterError('The edit was checked but not saved.');
        }
        // A save that opens a pull request is a change of its own, so it is listed and can be come back to.
        if (threadUuid && saved.result.prAction === 'opened') {
            const owner = { projectUuid, userUuid: user.userUuid };
            const thread = await this.workspaceModel.findStudioThread(
                owner,
                threadUuid,
            );
            if (thread) {
                await this.workspaceModel.start(owner, {
                    ...thread,
                    threadUuid,
                    name: editChangeName(path),
                });
            }
        }
        // With no conversation to hang it on, the new pull request still becomes a draft of its own.
        if (!threadUuid && saved.result.prAction === 'opened') {
            const owner = { projectUuid, userUuid: user.userUuid };
            const active = await this.workspaceModel.findActive(owner);
            // An empty draft made with New draft takes the save instead of being left behind.
            const workspaceUuid =
                active && !active.threadUuid && !active.pullRequest
                    ? active.workspaceUuid
                    : await this.workspaceModel.create(
                          owner,
                          (await this.projectModel.get(projectUuid))
                              .organizationUuid,
                          editChangeName(path),
                      );
            await this.workspaceModel.attachPullRequest(
                { ...owner, workspaceUuid },
                savedPrUrl,
            );
        }
        // A save writes no agent run, so the conversation learns its pull request here.
        if (threadUuid && saved.result.prUrl) {
            await this.workspaceModel.attachThreadPullRequest(
                { projectUuid, userUuid: user.userUuid },
                threadUuid,
                saved.result.prUrl,
            );
        }
        if (threadUuid && saved.explores !== null && saved.result.prUrl) {
            await saveDbtTryOut(
                this.fileStorageClient,
                { projectUuid, userUuid: user.userUuid },
                threadUuid,
                { prUrl: saved.result.prUrl, explores: saved.explores },
            ).catch((error: unknown) => {
                this.logger.warn(
                    `SemanticStudio: failed to keep the try-out of a hand edit: ${getErrorMessage(error)}`,
                );
            });
        }
        await this.queueBranchCompile(
            user,
            projectUuid,
            savedPrUrl,
            'person',
        ).catch((error: unknown) => {
            this.logger.warn(
                `SemanticStudio: failed to queue a compile after a hand edit: ${getErrorMessage(error)}`,
            );
        });
        // A preview built by an earlier round would otherwise keep showing the pull request without this edit.
        await this.writebackPreviewService
            .createPreviewForPullRequest({
                user,
                projectUuid,
                prUrl: savedPrUrl,
                reuseOnly: true,
            })
            .catch((error: unknown) => {
                this.logger.warn(
                    `SemanticStudio: failed to refresh the preview after a hand edit: ${getErrorMessage(error)}`,
                );
            });
        const opened = saved.result.prAction === 'opened';
        this.track(user, projectUuid, {
            event: 'semantic_studio.change_saved',
            properties: {
                source: 'hand',
                modelCount: null,
                failedModelCount: 0,
                startedDraft: opened,
            },
        });
        if (opened) {
            this.track(user, projectUuid, {
                event: 'semantic_studio.draft_started',
                properties: { trigger: 'file_edit' },
            });
        }
        return {
            status: 'saved',
            prUrl: savedPrUrl,
            prAction: saved.result.prAction === 'opened' ? 'opened' : 'updated',
            commitSha,
            checked: saved.checked,
            revision: sourceRevision(content),
        };
    }
}
