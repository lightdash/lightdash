import { subject } from '@casl/ability';
import {
    DbtProjectType,
    describeModelFragmentRefusal,
    diffModelDocuments,
    doModelPathsOverlap,
    FeatureFlags,
    ForbiddenError,
    formatSemanticStudioRejection,
    getErrorMessage,
    getItemId,
    isChartValidationError,
    isDashboardValidationError,
    isExploreError,
    isPullRequestOpen,
    loadProjectContextFile,
    mergeProjectContextEntry,
    normalizeWorkspaceName,
    NotFoundError,
    ParameterError,
    ParseError,
    parseModelDocument,
    ProjectType,
    readModelPart,
    serializeProjectContextFile,
    toDraftEdit,
    UNTITLED_WORKSPACE_NAME,
    upsertProjectContextEntries,
    ValidationTarget,
    type Explore,
    type ExploreError,
    type ExploreType,
    type LightdashError,
    type LightdashModelWithSource,
    type ModelFragmentChange,
    type ProjectContextEntry,
    type ProjectContextWritebackEntry,
    type SaveSemanticLayerDraftModelRequest,
    type SemanticLayerBlocker,
    type SemanticLayerDraft,
    type SemanticLayerDraftApplyResult,
    type SemanticLayerDraftedModels,
    type SemanticLayerDrafter,
    type SemanticLayerDraftImpact,
    type SemanticLayerDraftItemResult,
    type SemanticLayerDraftModelInput,
    type SemanticLayerDraftModelSave,
    type SemanticLayerDraftMoveDirection,
    type SemanticLayerDraftProjectContext,
    type SemanticLayerDraftReconciliation,
    type SemanticLayerDraftState,
    type SemanticLayerDraftUsage,
    type SemanticLayerInReviewModel,
    type SemanticLayerModelCode,
    type SemanticLayerOthersDraftModel,
    type SemanticLayerProposalItemResult,
    type SemanticLayerStatus,
    type SemanticLayerStoredModels,
    type SemanticLayerTouchedField,
    type SemanticStudioRejection,
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspacePullRequestState,
    type SemanticStudioWorkspaces,
    type SemanticStudioWorkspaceStartBody,
    type SessionUser,
    type WritebackMergeResult,
} from '@lightdash/common';
import { groupBy } from 'es-toolkit/compat';
import { type Knex } from 'knex';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
    type LightdashAnalytics,
    type SemanticStudioActivity,
    type SemanticStudioChangeFailureReason,
} from '../../../analytics/LightdashAnalytics';
import { type DraftImpactBreaks } from '../../../database/entities/projectModelDraftImpacts';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type SavedChartModel } from '../../../models/SavedChartModel';
import { BaseService } from '../../../services/BaseService';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { type ValidationService } from '../../../services/ValidationService/ValidationService';
import { runWithConcurrency } from '../../../utils/runWithConcurrency';
import { type ProjectContextModel } from '../../models/ProjectContextModel';
import {
    ModelDocumentsChangedError,
    type ChangeSetSource,
    type DraftOwner,
    type OtherDrafter,
    type ProjectModelDocument,
    type ProjectModelDocumentModel,
    type StoredDraftChange,
    type WorkspaceDraftOwner,
} from '../../models/ProjectModelDocumentModel';
import { type SemanticStudioWorkspaceModel } from '../../models/SemanticStudioWorkspaceModel';
import { getWritebackConnectionSupport } from '../AiAgentService/writebackConnection';
import { type AiWritebackService } from '../AiWritebackService/AiWritebackService';
import { type StudioFileStorage } from './checkedExplores';
import { retireDbtTryOut } from './dbtTryOut';
import {
    DraftChecker,
    isModelExplore,
    usesAnyModel,
    type DraftCheckerProjectService,
} from './DraftChecker';
import { foldDraft, foldProposal, toModelPath, withWrites } from './draftFold';
import {
    findDraftedPaths,
    findRefusedPaths,
    reconcileModel,
} from './reconcileDraft';
import {
    describePullRequest,
    keepsModelsInGithub,
    resolveRepoConnection,
    type RepoModels,
    type RepoModelSource,
} from './repoModels';
import {
    applyModeOf,
    trackStudioActivity,
    type ModelProject,
} from './studioProject';

export type SemanticStudioServiceArguments = {
    analytics: Pick<LightdashAnalytics, 'track'>;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    projectModel: {
        get: (projectUuid: string) => Promise<ModelProject>;
        getAllExploreSummaries: (
            projectUuid: string,
        ) => Promise<{ name: string; type?: ExploreType }[]>;
        deleteCachedExplores: (
            projectUuid: string,
            names: string[],
        ) => Promise<void>;
    };
    projectModelDocumentModel: Pick<
        ProjectModelDocumentModel,
        | 'findDocuments'
        | 'createChangeSet'
        | 'findChangeSets'
        | 'findModelHistory'
        | 'findDraftChanges'
        | 'findWorkspaceDraftChanges'
        | 'findOtherDrafters'
        | 'swapDraftChanges'
        | 'withPublishLock'
        | 'findDraftState'
        | 'rebaseDraftChanges'
        | 'findDocumentsAt'
        | 'findPublishedSince'
        | 'findInReviewDraftChanges'
        | 'findSettledDraftChanges'
        | 'createCheckedOutDraftChange'
        | 'updateDraftChangeStatus'
        | 'findDraftImpactCheck'
        | 'startDraftImpactCheck'
        | 'finishDraftImpactCheck'
    >;
    schedulerClient: {
        checkSemanticLayerDraftImpact: (payload: {
            workspaceUuid: string | null;
            expectedHash: string;
            organizationUuid: string;
            projectUuid: string;
            userUuid: string;
        }) => Promise<unknown>;
    };
    validationService: Pick<ValidationService, 'generateValidation'>;
    projectService: Pick<ProjectService, 'setExplores'> &
        DraftCheckerProjectService;
    fileStorageClient: StudioFileStorage;
    repoModels: Pick<
        RepoModelSource,
        | 'isInstalled'
        | 'load'
        | 'openPullRequest'
        | 'updatePullRequest'
        | 'getPullRequestState'
    >;
    savedChartModel: Pick<SavedChartModel, 'analyzeFieldImpact'>;
    projectContextModel: Pick<
        ProjectContextModel,
        'getDocument' | 'upsertEntries'
    >;
    aiWritebackService: Pick<
        AiWritebackService,
        'mergePullRequest' | 'scheduleCompileAfterMerge'
    >;
    workspaceModel: Pick<
        SemanticStudioWorkspaceModel,
        | 'findStudioThread'
        | 'findInProject'
        | 'findUnfinishedWithPullRequest'
        | 'listChanges'
        | 'find'
        | 'findActive'
        | 'start'
        | 'create'
        | 'activate'
        | 'leave'
        | 'rename'
        | 'finish'
        | 'attachPullRequest'
        | 'recordPullRequestState'
        | 'deleteFinishedBranchCompiles'
    >;
};

/** A proposal once it was checked on top of the person's draft. */
export type SemanticLayerDraftProposal = {
    results: SemanticLayerProposalItemResult[];
    diffs: {
        model: string;
        contentBefore: string | null;
        contentAfter: string | null;
    }[];
    /** Null when nothing passed. */
    draftChangeUuid: string | null;
    /** The change this started because the person was on Live; null otherwise. */
    startedChange: { workspaceUuid: string; name: string } | null;
};

/** A person's draft, replayed on what is live. */
type LoadedDraft = {
    organizationUuid: string;
    /** The repository the models live in; null when they are kept on the server. */
    repo: RepoModels | null;
    stored: ProjectModelDocument[];
    live: Map<string, string>;
    changes: StoredDraftChange[];
    /** What the draft writes; null content removes the model. */
    writes: Map<string, string | null>;
    /** One list per change, one result per model it touches. */
    results: SemanticLayerDraftItemResult[][];
};

type DiscardTarget =
    | { kind: 'all' }
    | { kind: 'change'; changeUuid: string }
    | { kind: 'model'; model: string };

// A write rereads and rechecks when another one lands first.
const MAX_WRITE_ATTEMPTS = 3;

// A check whose worker died reads as failed after this long; sweep stale checks if that is not enough.
const IMPACT_CHECK_TIMEOUT_MS = 10 * 60 * 1000;

const NO_IMPACT: SemanticLayerDraftImpact = { status: 'done', breaks: [] };

const WORKSPACE_NAME_MAX_LENGTH = 120;

/** Identifies a draft on top of what is live, so a check of one is not read as a check of another. */
const hashDraft = (
    workspaceUuid: string | null,
    live: Map<string, string>,
    writes: Map<string, string | null>,
): string =>
    createHash('sha256')
        .update(JSON.stringify([workspaceUuid, [...live], [...writes]]))
        .digest('hex');

const EMPTY_DRAFT: SemanticLayerDraft = {
    changes: [],
    models: [],
    projectContext: null,
    errors: [],
    settled: [],
    inReview: [],
    othersDrafting: [],
};

// A draft that redefines more fields than this is only partly looked up; page the lookup if drafts grow that large.
const MAX_USAGE_FIELDS = 40;

const MAX_PULL_REQUEST_REFRESHES = 5;
const PULL_REQUEST_REFRESH_MS = 55_000;
const MERGE_RETRIES = 3;
const MERGE_RETRY_MS = 2_000;
const RECENT_WORKSPACE_MS = 14 * 24 * 60 * 60 * 1000;
// Someone else's draft with no activity for this long can be discarded by a project admin.
const STALE_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;

const isStaleDraft = ({ lastActiveAt }: Pick<OtherDrafter, 'lastActiveAt'>) =>
    Date.now() - lastActiveAt.getTime() >= STALE_DRAFT_MS;

type Blocker = { reason: SemanticLayerBlocker; error: LightdashError };

const CANNOT_USE_STUDIO = "You cannot change this project's models here";

/** Keeps a project's native models on the server and takes reviewed drafts of them live. */
export class SemanticStudioService extends BaseService {
    private readonly analytics: SemanticStudioServiceArguments['analytics'];

    private readonly featureFlagModel: SemanticStudioServiceArguments['featureFlagModel'];

    private readonly projectModel: SemanticStudioServiceArguments['projectModel'];

    private readonly projectModelDocumentModel: SemanticStudioServiceArguments['projectModelDocumentModel'];

    private readonly projectService: SemanticStudioServiceArguments['projectService'];

    private readonly validationService: SemanticStudioServiceArguments['validationService'];

    private readonly schedulerClient: SemanticStudioServiceArguments['schedulerClient'];

    private readonly repoModels: SemanticStudioServiceArguments['repoModels'];

    private readonly savedChartModel: SemanticStudioServiceArguments['savedChartModel'];

    private readonly fileStorageClient: SemanticStudioServiceArguments['fileStorageClient'];

    private readonly workspaceModel: SemanticStudioServiceArguments['workspaceModel'];

    private readonly aiWritebackService: SemanticStudioServiceArguments['aiWritebackService'];

    private readonly projectContextModel: SemanticStudioServiceArguments['projectContextModel'];

    private readonly checker: DraftChecker;

    /** Publishes under way, so a repeated request joins the one already running. */
    private readonly publishing = new Map<
        string,
        Promise<SemanticLayerDraftApplyResult>
    >();

    // Per process, so several API processes each ask once a minute; share it if provider limits bite.
    private readonly pullRequestRefreshedAt = new Map<string, number>();

    constructor(args: SemanticStudioServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.featureFlagModel = args.featureFlagModel;
        this.projectModel = args.projectModel;
        this.projectModelDocumentModel = args.projectModelDocumentModel;
        this.projectService = args.projectService;
        this.validationService = args.validationService;
        this.schedulerClient = args.schedulerClient;
        this.repoModels = args.repoModels;
        this.savedChartModel = args.savedChartModel;
        this.fileStorageClient = args.fileStorageClient;
        this.workspaceModel = args.workspaceModel;
        this.aiWritebackService = args.aiWritebackService;
        this.projectContextModel = args.projectContextModel;
        this.checker = new DraftChecker(args.projectService);
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

    /** Why this person cannot change this project's models here, or null when they can. */
    private async findAccessBlocker(
        user: SessionUser,
        project: ModelProject,
    ): Promise<Blocker | null> {
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('DeployProject', {
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                    upstreamProjectUuid: project.upstreamProjectUuid,
                    type: project.type,
                    createdByUserUuid: project.createdByUserUuid,
                    metadata: {
                        createdByUserUuid: project.createdByUserUuid,
                        type: project.type,
                    },
                }),
            )
        ) {
            return {
                reason: 'no_access',
                error: new ForbiddenError(
                    'User does not have permission to deploy to this project',
                ),
            };
        }
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: user.userUuid,
                organizationUuid: project.organizationUuid,
            },
            featureFlagId: FeatureFlags.SemanticStudioEditing,
        });
        return enabled
            ? null
            : {
                  reason: 'no_access',
                  error: new ForbiddenError('This feature is not enabled'),
              };
    }

    /** A write to the project's repository needs what any write to it needs. */
    private findSourceBlocker(
        user: SessionUser,
        project: ModelProject,
    ): Blocker | null {
        return this.createAuditedAbility(user).cannot(
            'manage',
            subject('SourceCode', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
                isProtectedBranch: false,
            }),
        )
            ? {
                  reason: 'no_repository_access',
                  error: new ForbiddenError(
                      "User does not have permission to change this project's repository",
                  ),
              }
            : null;
    }

    /** Why this person cannot keep a draft of this project's models, or null when they can. */
    private async findBlocker(
        user: SessionUser,
        project: ModelProject,
    ): Promise<Blocker | null> {
        const blocker = await this.findAccessBlocker(user, project);
        if (blocker) return blocker;
        if (project.dbtConnection.type === DbtProjectType.NONE) return null;
        if (
            keepsModelsInGithub(project.dbtConnection) &&
            !resolveRepoConnection(project.dbtConnection)
        ) {
            return {
                reason: 'unsupported_connection',
                error: new ParameterError(
                    'Models in a repository can only be changed here when the connection uses the GitHub App on github.com',
                ),
            };
        }
        if (!resolveRepoConnection(project.dbtConnection)) {
            return {
                reason: 'unsupported_connection',
                error: new ParameterError(
                    'A draft is kept for a project without a dbt connection, or one that keeps its models in GitHub',
                ),
            };
        }
        const sourceBlocker = this.findSourceBlocker(user, project);
        if (sourceBlocker) return sourceBlocker;
        return (await this.repoModels.isInstalled(project.organizationUuid))
            ? null
            : {
                  reason: 'github_app_missing',
                  error: new ParameterError(
                      'The GitHub App must be installed to change models that live in a repository',
                  ),
              };
    }

    /** Why this person cannot have the agent edit this dbt project's repository, or null when they can. */
    private async findDbtProjectBlocker(
        user: SessionUser,
        project: ModelProject,
    ): Promise<SemanticLayerBlocker | null> {
        const access = await this.findAccessBlocker(user, project);
        if (access) return access.reason;
        // A preview is a look at a pull request's branch, not a place to start another.
        if (project.type === ProjectType.PREVIEW) return 'preview_project';
        if (
            !getWritebackConnectionSupport(project.dbtConnection).editDbtProject
        )
            return 'unsupported_connection';
        return this.findSourceBlocker(user, project)?.reason ?? null;
    }

    /** A project with no repository whose models were deployed from outside has nothing here to change. */
    private async findOutsideModelsBlocker(
        project: ModelProject,
    ): Promise<SemanticLayerBlocker | null> {
        if (project.dbtConnection.type !== DbtProjectType.NONE) return null;
        const stored = await this.projectModelDocumentModel.findDocuments(
            project.projectUuid,
        );
        return (await this.hasModelsFromElsewhere(project.projectUuid, {
            stored,
            repo: null,
        }))
            ? 'models_from_outside'
            : null;
    }

    /** The status as the Studio page shows it: also off, with its reason, when the models were deployed from outside. */
    async getPageStatus(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerStatus> {
        const status = await this.getStatus(user, projectUuid);
        if (!status.enabled || status.appliesAs !== 'live') return status;
        const blocker = await this.findOutsideModelsBlocker(
            await this.projectModel.get(projectUuid),
        );
        return blocker ? { ...status, enabled: false, blocker } : status;
    }

    /** Whether this person can change this project's models here, and what applying a draft would do. */
    async getStatus(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerStatus> {
        const project = await this.projectModel.get(projectUuid);
        const appliesAs = applyModeOf(project.dbtConnection);
        if (appliesAs === 'dbt_pull_request') {
            const reason = await this.findDbtProjectBlocker(user, project);
            return {
                enabled: reason === null,
                blocker: reason,
                appliesAs: 'dbt_pull_request',
            };
        }
        const blocker = await this.findBlocker(user, project);
        return {
            enabled: blocker === null,
            blocker: blocker?.reason ?? null,
            appliesAs,
        };
    }

    /** The project's models as they are live: read from its repository when they live there, from the server otherwise. */
    private async loadStored(projectUuid: string): Promise<{
        organizationUuid: string;
        repo: RepoModels | null;
        stored: ProjectModelDocument[];
    }> {
        const { organizationUuid, dbtConnection } =
            await this.projectModel.get(projectUuid);
        const connection = resolveRepoConnection(dbtConnection);
        if (!connection) {
            return {
                organizationUuid,
                repo: null,
                stored: await this.projectModelDocumentModel.findDocuments(
                    projectUuid,
                ),
            };
        }
        const repo = await this.repoModels.load(organizationUuid, connection);
        return {
            organizationUuid,
            repo,
            // A repository has commits, not versions; a draft is checked against the commit it was read at.
            stored: repo.documents.map((document) => ({
                ...document,
                version: 0,
            })),
        };
    }

    private async assertCanEditModels(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const blocker = await this.findBlocker(
            user,
            await this.projectModel.get(projectUuid),
        );
        if (blocker) throw blocker.error;
    }

    private async canEditModels(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const project = await this.projectModel.get(projectUuid);
        return (await this.findBlocker(user, project)) === null;
    }

    /** Whether the project's models came from a deploy outside the server, with nothing kept here to change. */
    private async hasModelsFromElsewhere(
        projectUuid: string,
        { stored, repo }: Pick<LoadedDraft, 'stored' | 'repo'>,
    ): Promise<boolean> {
        // A repository is where its project's explores are meant to come from.
        if (repo || stored.length > 0) return false;
        const summaries =
            await this.projectModel.getAllExploreSummaries(projectUuid);
        return summaries.some(({ type }) => isModelExplore(type));
    }

    private async assertNoModelsFromElsewhere(
        projectUuid: string,
        draft: Pick<LoadedDraft, 'stored' | 'repo'>,
    ): Promise<void> {
        if (await this.hasModelsFromElsewhere(projectUuid, draft)) {
            throw new ParameterError(
                'This project already has models deployed from outside the server; they cannot be changed here yet',
            );
        }
    }

    /** Whose draft a person works on: the one of their active workspace. */
    private async findDraftOwner(
        projectUuid: string,
        userUuid: string,
    ): Promise<DraftOwner> {
        const active = await this.workspaceModel.findActive({
            projectUuid,
            userUuid,
        });
        return {
            projectUuid,
            userUuid,
            workspaceUuid: active?.workspaceUuid ?? null,
        };
    }

    /** This person's draft replayed on what is live; with `model`, only that model's part of it. */
    private async loadDraft(
        owner: DraftOwner,
        model: string | null,
    ): Promise<LoadedDraft> {
        const [loaded, drafted] = await Promise.all([
            this.loadStored(owner.projectUuid),
            this.projectModelDocumentModel.findDraftChanges(owner),
        ]);
        return SemanticStudioService.foldOnLive(loaded, drafted, model);
    }

    private static foldOnLive(
        {
            organizationUuid,
            repo,
            stored,
        }: Pick<LoadedDraft, 'organizationUuid' | 'repo' | 'stored'>,
        drafted: StoredDraftChange[],
        model: string | null,
    ): LoadedDraft {
        const changes =
            model === null
                ? drafted
                : drafted.flatMap((change) => {
                      const models = change.models.filter(
                          ({ name }) => name === model,
                      );
                      return models.length > 0 ? [{ ...change, models }] : [];
                  });
        const live = new Map(
            stored.map(({ name, content }) => [name, content]),
        );
        return {
            organizationUuid,
            repo,
            stored,
            live,
            changes,
            ...foldDraft(
                live,
                changes.map(({ models }) => models),
            ),
        };
    }

    /** A model's YAML and history; null when the project keeps no such model or this person cannot change it. */
    async getStoredModels(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerStoredModels> {
        if (!(await this.canEditModels(user, projectUuid))) {
            return { models: [] };
        }
        const { stored } = await this.loadStored(projectUuid);
        return { models: stored.map(({ name }) => name).sort() };
    }

    async getModel(
        user: SessionUser,
        projectUuid: string,
        name: string,
    ): Promise<SemanticLayerModelCode | null> {
        if (!(await this.canEditModels(user, projectUuid))) return null;
        const { stored, repo } = await this.loadStored(projectUuid);
        const document = stored.find((doc) => doc.name === name);
        if (!document) return null;
        // A repository keeps its own history.
        const history = repo
            ? []
            : await this.projectModelDocumentModel.findModelHistory(
                  projectUuid,
                  name,
              );
        const pathsOf = (change: (typeof history)[number]) =>
            diffModelDocuments(change.contentBefore, change.contentAfter).map(
                ({ path }) => path,
            );
        return {
            ...document,
            history: history.map((change, index) => {
                // Newest first, so the change before this one comes after it.
                const previous = history.at(index + 1);
                const overwritten =
                    previous &&
                    // Someone gone cannot be told apart from anyone else.
                    (previous.byUserUuid === null ||
                        previous.byUserUuid !== change.byUserUuid) &&
                    !previous.reverted
                        ? pathsOf(previous).filter(
                              (path) =>
                                  // Building on a model someone made is not writing over them.
                                  path !== '' &&
                                  pathsOf(change).some((written) =>
                                      doModelPathsOverlap(path, written),
                                  ),
                          )
                        : [];
                return {
                    ...change,
                    replaced:
                        previous && overwritten.length > 0
                            ? { by: previous.by, paths: overwritten }
                            : null,
                };
            }),
        };
    }

    /** Who else is drafting each model and which parts, read by replaying their drafts on what is live. */
    private static describeOtherDrafts(
        live: Map<string, string>,
        drafters: OtherDrafter[],
        /** Whether the viewer is a project admin, who may discard a stale draft. */
        isAdmin: boolean,
    ): Map<string, SemanticLayerDrafter[]> {
        const byModel = new Map<string, SemanticLayerDrafter[]>();
        drafters.forEach((drafter) => {
            const results = foldDraft(
                live,
                drafter.changes.map(({ models }) => models),
            ).results.flat();
            const isStale = isStaleDraft(drafter);
            [...new Set(results.map(({ model }) => model))].forEach((model) => {
                byModel.set(model, [
                    ...(byModel.get(model) ?? []),
                    {
                        userUuid: drafter.userUuid,
                        name: drafter.name,
                        paths: findDraftedPaths(model, results),
                        lastActiveAt: drafter.lastActiveAt,
                        isStale,
                        canDiscard: isAdmin && isStale,
                    },
                ]);
            });
        });
        return byModel;
    }

    private isProjectAdmin(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
    ): boolean {
        return this.createAuditedAbility(user).can(
            'manage',
            subject('Project', { organizationUuid, projectUuid }),
        );
    }

    /** Another person's open draft on this project; never the viewer's own. */
    private async findOtherDrafter(
        user: SessionUser,
        projectUuid: string,
        ownerUuid: string,
    ): Promise<OtherDrafter> {
        const drafter = (
            await this.projectModelDocumentModel.findOtherDrafters(
                projectUuid,
                user.userUuid,
            )
        ).find(({ userUuid }) => userUuid === ownerUuid);
        if (!drafter) throw new NotFoundError('No such draft');
        return drafter;
    }

    /** One model as someone else's draft leaves it, to look at; nothing about it can be changed from here. */
    async getOthersDraftModel(
        user: SessionUser,
        projectUuid: string,
        ownerUuid: string,
        model: string,
    ): Promise<SemanticLayerOthersDraftModel> {
        await this.assertCanEditModels(user, projectUuid);
        const drafter = await this.findOtherDrafter(
            user,
            projectUuid,
            ownerUuid,
        );
        const { stored } = await this.loadStored(projectUuid);
        const live = new Map(
            stored.map(({ name, content }) => [name, content]),
        );
        const { writes } = foldDraft(
            live,
            drafter.changes.map(({ models }) =>
                models.filter(({ name }) => name === model),
            ),
        );
        if (!writes.has(model)) {
            throw new NotFoundError('Their draft does not change this model');
        }
        return {
            model,
            contentBefore: live.get(model) ?? null,
            contentAfter: writes.get(model) ?? null,
        };
    }

    /** Lets a project admin take one model out of someone else's draft once it has gone a week without activity. */
    async discardOthersDraftModel(
        user: SessionUser,
        projectUuid: string,
        ownerUuid: string,
        model: string,
    ): Promise<void> {
        await this.assertCanEditModels(user, projectUuid);
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (!this.isProjectAdmin(user, organizationUuid, projectUuid)) {
            throw new ForbiddenError(
                "Only a project admin can discard someone else's draft",
            );
        }
        const drafter = await this.findOtherDrafter(
            user,
            projectUuid,
            ownerUuid,
        );
        if (!isStaleDraft(drafter)) {
            throw new ForbiddenError(
                'This draft was active in the last 7 days. Only its owner can discard it.',
            );
        }
        const holding = drafter.changes.filter(({ models }) =>
            models.some(({ name }) => name === model),
        );
        if (holding.length === 0) {
            throw new NotFoundError('Their draft does not change this model');
        }
        // Only the changes read above, so anything they add meanwhile stays.
        await Promise.all(
            Object.values(
                groupBy(holding, ({ workspaceUuid }) => workspaceUuid ?? ''),
            ).map((changes) =>
                this.projectModelDocumentModel.updateDraftChangeStatus({
                    projectUuid,
                    userUuid: ownerUuid,
                    workspaceUuid: changes[0].workspaceUuid,
                    drafts: {
                        changeUuids: changes.map(
                            ({ draftChangeUuid }) => draftChangeUuid,
                        ),
                        model,
                    },
                    status: 'discarded',
                    pullRequestUrl: null,
                    discardedByUserUuid: user.userUuid,
                }),
            ),
        );
        this.track(user, projectUuid, {
            event: 'semantic_studio.draft_discarded',
            properties: { scope: 'stale_model' },
        });
    }

    /** Records which kind of check left each model out; the detail can quote the warehouse, so it stays out. */
    private logRejections(
        projectUuid: string,
        rejected: Map<string, SemanticStudioRejection>,
    ) {
        rejected.forEach(({ kind }, model) => {
            this.logger.info(
                `Semantic Studio check left out ${model} in ${projectUuid}: ${kind}`,
            );
        });
    }

    /** Runs a write again when another one landed first. */
    private async retryOnConflict<T>(
        projectUuid: string,
        write: () => Promise<T>,
    ): Promise<T> {
        for (let attempt = 1; ; attempt += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                return await write();
            } catch (error) {
                if (
                    !(error instanceof ModelDocumentsChangedError) ||
                    attempt >= MAX_WRITE_ATTEMPTS
                ) {
                    throw error;
                }
                this.logger.info(
                    `Semantic layer changed during a write to ${projectUuid}; retrying (${attempt})`,
                );
            }
        }
    }

    /** Folds a change onto this person's draft and checks the result against the warehouse; nothing is stored. */
    private async checkOnDraft(
        user: SessionUser,
        projectUuid: string,
        draft: LoadedDraft,
        models: SemanticLayerDraftModelInput[],
    ) {
        const proposed = foldProposal(
            draft.live,
            draft.changes.map((change) => change.models),
            models,
        );
        const check = await this.checker.check(
            user,
            projectUuid,
            draft.live,
            proposed.writes,
        );
        const results = proposed.results.map(
            (result): SemanticLayerProposalItemResult => {
                if (result.status !== 'ready') return result;
                const rejection = check.rejected.get(result.model);
                return rejection === undefined
                    ? { ...result, notes: check.notes.get(result.model) ?? [] }
                    : {
                          model: result.model,
                          status: 'failed',
                          changes: [],
                          refusals: [],
                          error: formatSemanticStudioRejection(
                              result.model,
                              rejection,
                          ),
                          rejection,
                          notes: [],
                      };
            },
        );
        this.logRejections(projectUuid, check.rejected);
        return { results, writes: check.writes };
    }

    /** Adds a checked change to this person's draft, starting a draft named `changeName` when they are on Published. */
    private async storeDraftChange(
        user: SessionUser,
        owner: DraftOwner,
        draft: LoadedDraft,
        models: SemanticLayerDraftModelInput[],
        promptUuid: string | null,
        changeName: string | null,
        projectContextEntries: ProjectContextEntry[] | null = null,
    ) {
        const stored =
            await this.projectModelDocumentModel.createCheckedOutDraftChange(
                {
                    ...owner,
                    promptUuid,
                    changeName: normalizeWorkspaceName(
                        changeName ?? '',
                        WORKSPACE_NAME_MAX_LENGTH,
                    ),
                    models,
                    projectContextEntries,
                    // A repository has commits, not versions.
                    baseVersions: draft.repo
                        ? null
                        : Object.fromEntries(
                              models.map(({ name }) => [
                                  name,
                                  draft.stored.find((doc) => doc.name === name)
                                      ?.version ?? null,
                              ]),
                          ),
                },
                draft.organizationUuid,
            );
        await this.queueDraftImpactCheckAfterChange(user, {
            ...owner,
            workspaceUuid: stored.workspaceUuid,
        });
        if (stored.startedChange) {
            this.track(user, owner.projectUuid, {
                event: 'semantic_studio.draft_started',
                properties: { trigger: 'first_change' },
            });
        }
        return stored;
    }

    /** Checks a change on top of this person's draft and adds each model that passes whole to it; nothing goes live. */
    async proposeDraftChange(
        user: SessionUser,
        projectUuid: string,
        models: SemanticLayerDraftModelInput[],
        /** The question asking for it; null when none did. */
        prompt: { promptUuid: string; threadUuid: string } | null,
        /** Names the change this starts when the person is on Live. */
        changeName: string | null,
    ): Promise<SemanticLayerDraftProposal> {
        await this.assertCanEditModels(user, projectUuid);
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const draft = await this.loadDraft(owner, null);
        await this.assertNoModelsFromElsewhere(projectUuid, draft);
        const { results, writes } = await this.checkOnDraft(
            user,
            projectUuid,
            draft,
            models,
        );
        const passing = models.filter(
            (_model, index) => results[index].status === 'ready',
        );
        if (passing.length === 0) {
            this.track(user, projectUuid, {
                event: 'semantic_studio.change_failed',
                properties: {
                    source: 'chat',
                    reason: 'check_failed',
                    modelCount: models.length,
                },
            });
            return {
                results,
                diffs: [],
                draftChangeUuid: null,
                startedChange: null,
            };
        }
        const before = withWrites(draft.live, draft.writes);
        const { draftChangeUuid, startedChange } = await this.storeDraftChange(
            user,
            owner,
            draft,
            passing,
            prompt?.promptUuid ?? null,
            changeName,
        );
        this.track(user, projectUuid, {
            event: 'semantic_studio.change_saved',
            properties: {
                source: 'chat',
                modelCount: passing.length,
                failedModelCount: models.length - passing.length,
                startedDraft: startedChange !== null,
            },
        });
        return {
            results,
            diffs: [...new Set(passing.map(({ name }) => name))].map(
                (model) => ({
                    model,
                    contentBefore: before.get(model) ?? null,
                    contentAfter: writes.get(model) ?? null,
                }),
            ),
            draftChangeUuid,
            startedChange,
        };
    }

    /** The project context as this draft leaves it; null when the draft does not touch it. */
    private async describeProjectContext(
        projectUuid: string,
        changes: StoredDraftChange[],
    ): Promise<
        | (SemanticLayerDraftProjectContext & {
              entries: ProjectContextEntry[];
          })
        | null
    > {
        const drafted = changes.flatMap(
            ({ projectContextEntries }) => projectContextEntries ?? [],
        );
        if (drafted.length === 0) return null;
        const live = await this.projectContextModel.getDocument(projectUuid);
        const entries = upsertProjectContextEntries(live, drafted);
        return {
            entries,
            contentBefore:
                live.length === 0 ? null : serializeProjectContextFile(live),
            contentAfter: serializeProjectContextFile(entries),
        };
    }

    /** Adds or replaces one project context entry in this person's draft; publishing the draft makes agents read it. Only a project with no repository keeps its context here. */
    async draftProjectContextEntry(
        user: SessionUser,
        projectUuid: string,
        entry: ProjectContextWritebackEntry,
        /** The question asking for it; null when none did. */
        promptUuid: string | null,
        /** Names the change this starts when the person is on Live. */
        changeName: string | null,
    ): Promise<{
        entryId: string;
        op: 'create' | 'update';
        draftChangeUuid: string;
        startedChange: { workspaceUuid: string; name: string } | null;
    }> {
        await this.assertCanEditModels(user, projectUuid);
        const { dbtConnection } = await this.projectModel.get(projectUuid);
        if (applyModeOf(dbtConnection) !== 'live') {
            throw new ParameterError(
                "This project's context lives in lightdash.project_context.yml in its repository, so it is changed there",
            );
        }
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const draft = await this.loadDraft(owner, null);
        const current =
            (await this.describeProjectContext(projectUuid, draft.changes))
                ?.entries ??
            (await this.projectContextModel.getDocument(projectUuid));
        const { entries, entryId, op } = mergeProjectContextEntry(
            current,
            entry,
        );
        // Checked as the file it publishes as, so the draft never holds one agents cannot read.
        loadProjectContextFile(serializeProjectContextFile(entries));
        const written = entries.filter(({ id }) => id === entryId);
        const { draftChangeUuid, startedChange } = await this.storeDraftChange(
            user,
            owner,
            draft,
            [],
            promptUuid,
            changeName,
            written,
        );
        this.track(user, projectUuid, {
            event: 'semantic_studio.change_saved',
            properties: {
                source: 'chat',
                modelCount: 0,
                failedModelCount: 0,
                startedDraft: startedChange !== null,
            },
        });
        return { entryId, op, draftChangeUuid, startedChange };
    }

    /** Saves a hand edit of one model's whole YAML into this person's draft, through the checks an agent's change goes through. */
    async saveDraftModel(
        user: SessionUser,
        projectUuid: string,
        model: string,
        { base, content }: SaveSemanticLayerDraftModelRequest,
    ): Promise<SemanticLayerDraftModelSave> {
        await this.assertCanEditModels(user, projectUuid);
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const draft = await this.loadDraft(owner, null);
        await this.assertNoModelsFromElsewhere(projectUuid, draft);
        const fail = (
            reason: SemanticStudioChangeFailureReason,
            error: string,
        ): SemanticLayerDraftModelSave => {
            this.track(user, projectUuid, {
                event: 'semantic_studio.change_failed',
                properties: { source: 'hand', reason, modelCount: 1 },
            });
            return { status: 'failed', error };
        };
        const current = withWrites(draft.live, draft.writes).get(model);
        if (current === undefined || current !== base) {
            return fail(
                'stale',
                'This model changed since you started editing it. Copy your edit, then make it again on the latest version.',
            );
        }
        let edited: LightdashModelWithSource;
        try {
            edited = parseModelDocument(content, toModelPath(model));
        } catch (error) {
            return fail('invalid', getErrorMessage(error));
        }
        if (edited.name !== model) {
            return fail(
                'renamed',
                `The model's name stays ${model}. To rename it, ask the agent.`,
            );
        }
        const models = toDraftEdit(model, current, content);
        if (models.length === 0) {
            return fail(
                'no_change',
                'This edit changes nothing the model means.',
            );
        }
        const { results, writes } = await this.checkOnDraft(
            user,
            projectUuid,
            draft,
            models,
        );
        const refused = results.flatMap(({ refusals }) =>
            refusals.map(describeModelFragmentRefusal),
        );
        // A refusal says more than the error that leaves its model out.
        const problems =
            refused.length > 0
                ? refused
                : results.flatMap(({ error }) =>
                      error === null ? [] : [error],
                  );
        if (problems.length > 0) {
            return fail('check_failed', problems.join(' '));
        }
        const saved = writes.get(model);
        if (
            saved === undefined ||
            saved === null ||
            results.every(({ status }) => status !== 'ready')
        ) {
            // Every part folded to what the draft already holds.
            return fail(
                'no_change',
                'This edit changes nothing the model means.',
            );
        }
        // A part the edit names but the draft would not hold is never saved quietly; sql_from is only wrapped.
        const missed = diffModelDocuments(saved, content).filter(
            ({ path }) => path !== 'sql_from',
        );
        if (missed.length > 0) {
            return fail(
                'unsupported_part',
                `${missed.map(({ path }) => path).join(', ')} cannot be saved as written here. Ask the agent to make that change.`,
            );
        }
        const { draftChangeUuid, startedChange } = await this.storeDraftChange(
            user,
            owner,
            draft,
            models,
            null,
            // Named for the model as it was, since the edit may be to its label.
            `Edit ${parseModelDocument(current, toModelPath(model)).label ?? edited.label ?? model}`,
        );
        this.track(user, projectUuid, {
            event: 'semantic_studio.change_saved',
            properties: {
                source: 'hand',
                modelCount: 1,
                failedModelCount: 0,
                startedDraft: startedChange !== null,
            },
        });
        return {
            status: 'saved',
            draftChangeUuid,
            startedChange,
            content: saved,
        };
    }

    /**
     * Every explore as the person's draft leaves it, by name, with null for a model
     * the draft removes; null when they have nothing drafted or cannot change the
     * project. This is what lets them query their own changes on the live project.
     */
    async findDraftExplores(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Map<string, Explore | ExploreError | null> | null> {
        if (!(await this.canEditModels(user, projectUuid))) return null;
        // Asked first: with nothing drafted there is no reason to read the live models, which for a repository is a network call.
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const changes =
            await this.projectModelDocumentModel.findDraftChanges(owner);
        if (changes.length === 0) return null;
        const draft = await this.loadDraft(owner, null);
        if (draft.writes.size === 0) return null;
        const { explores } = await this.checker.compile(
            projectUuid,
            withWrites(draft.live, draft.writes),
        );
        // Everything compiled, not only what was drafted: an explore that joins a changed model changes too.
        return new Map<string, Explore | ExploreError | null>([
            ...[...draft.writes].flatMap(([name, content]): [string, null][] =>
                content === null ? [[name, null]] : [],
            ),
            ...explores.map((explore): [string, Explore | ExploreError] => [
                explore.name,
                explore,
            ]),
        ]);
    }

    /**
     * A value that changes whenever this person's draft would read differently:
     * live moved, their own changes moved, or someone else started or stopped
     * drafting. Cheap, so a page can ask often and read the draft only on a change.
     */
    async getDraftState(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerDraftState> {
        if (!(await this.canEditModels(user, projectUuid))) {
            return { fingerprint: '' };
        }
        const [state, { workspaceUuid }] = await Promise.all([
            this.projectModelDocumentModel.findDraftState(projectUuid),
            this.findDraftOwner(projectUuid, user.userUuid),
        ]);
        return {
            fingerprint: createHash('sha256')
                .update(JSON.stringify({ ...state, workspaceUuid }))
                .digest('hex')
                .slice(0, 16),
        };
    }

    /** The models a person has changes in development on, straight from what is stored: cheap enough for pages that only mark them. */
    async getDraftedModels(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerDraftedModels> {
        if (!(await this.canEditModels(user, projectUuid))) {
            return { models: [] };
        }
        const changes = await this.projectModelDocumentModel.findDraftChanges(
            await this.findDraftOwner(projectUuid, user.userUuid),
        );
        return {
            models: [
                ...new Set(
                    changes.flatMap(({ models }) =>
                        models.map(({ name }) => name),
                    ),
                ),
            ],
        };
    }

    /** What the person's draft does to what is live right now; empty for someone who cannot change the project. */
    async getDraft(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerDraft> {
        if (!(await this.canEditModels(user, projectUuid))) return EMPTY_DRAFT;
        return this.describeDraft(
            user,
            projectUuid,
            await this.loadDraft(
                await this.findDraftOwner(projectUuid, user.userUuid),
                null,
            ),
        );
    }

    /** One of this person's workspaces replayed on what is live, leaving out changes from before drafts had workspaces. */
    async getWorkspaceDraft(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<SemanticLayerDraft> {
        await this.getOwnWorkspace(user, projectUuid, workspaceUuid);
        if (!(await this.canEditModels(user, projectUuid))) return EMPTY_DRAFT;
        const [loaded, drafted] = await Promise.all([
            this.loadStored(projectUuid),
            this.projectModelDocumentModel.findWorkspaceDraftChanges({
                projectUuid,
                userUuid: user.userUuid,
                workspaceUuid,
            }),
        ]);
        return this.describeDraft(
            user,
            projectUuid,
            SemanticStudioService.foldOnLive(loaded, drafted, null),
        );
    }

    private async describeDraft(
        user: SessionUser,
        projectUuid: string,
        draft: LoadedDraft,
    ): Promise<SemanticLayerDraft> {
        const settled =
            await this.projectModelDocumentModel.findSettledDraftChanges(
                projectUuid,
                user.userUuid,
            );
        const inReview = SemanticStudioService.describeInReview(
            draft.live,
            await this.projectModelDocumentModel.findInReviewDraftChanges(
                projectUuid,
                user.userUuid,
            ),
        );
        const others = SemanticStudioService.describeOtherDrafts(
            draft.live,
            await this.projectModelDocumentModel.findOtherDrafters(
                projectUuid,
                user.userUuid,
            ),
            this.isProjectAdmin(user, draft.organizationUuid, projectUuid),
        );
        const othersDrafting = [...others].map(([model, drafters]) => ({
            model,
            drafters,
        }));
        if (draft.changes.length === 0) {
            return { ...EMPTY_DRAFT, settled, inReview, othersDrafting };
        }
        // When each model first joined the draft: what was published after that happened under it.
        const startedAt = new Map<string, Date>();
        draft.changes.forEach(({ createdAt }, index) =>
            draft.results[index].forEach(({ model }) => {
                if (!startedAt.has(model)) startedAt.set(model, createdAt);
            }),
        );
        const reconciliations = await this.reconcileDraft(projectUuid, draft);
        const [{ explores }, publishedSince, projectContext] =
            await Promise.all([
                this.checker.compile(
                    projectUuid,
                    withWrites(draft.live, draft.writes),
                ),
                this.projectModelDocumentModel.findPublishedSince(
                    projectUuid,
                    user.userUuid,
                    startedAt,
                ),
                this.describeProjectContext(projectUuid, draft.changes),
            ]);
        return {
            changes: draft.changes.map((change, index) => ({
                draftChangeUuid: change.draftChangeUuid,
                question: change.question,
                createdAt: change.createdAt,
                models: draft.results[index].map(
                    ({ model, changes, refusals, error }) => ({
                        model,
                        changes,
                        refusals,
                        error,
                    }),
                ),
                projectContextEntries: (change.projectContextEntries ?? []).map(
                    ({ id }) => id,
                ),
            })),
            projectContext: projectContext && {
                contentBefore: projectContext.contentBefore,
                contentAfter: projectContext.contentAfter,
            },
            models: [...draft.writes].map(([model, contentAfter]) => {
                const explore = explores.find(({ name }) => name === model);
                return {
                    model,
                    contentBefore: draft.live.get(model) ?? null,
                    contentAfter,
                    explore:
                        explore && !isExploreError(explore) ? explore : null,
                    reconciliation: reconciliations.get(model) ?? null,
                    alsoChanging: others.get(model) ?? [],
                    publishedSince: publishedSince.get(model) ?? null,
                };
            }),
            errors: explores.filter(isExploreError).map(({ name, errors }) => ({
                model: name,
                message: errors.map(({ message }) => message).join('; '),
            })),
            settled,
            inReview,
            othersDrafting,
        };
    }

    /** What each open pull request's changes do to the models they touch, replayed on what is live. */
    private static describeInReview(
        live: Map<string, string>,
        sent: {
            pullRequestUrl: string;
            models: SemanticLayerDraftModelInput[];
        }[],
    ): SemanticLayerInReviewModel[] {
        return Object.entries(groupBy(sent, 'pullRequestUrl')).flatMap(
            ([pullRequestUrl, changes]) => {
                const { writes, results } = foldDraft(
                    live,
                    changes.map(({ models }) => models),
                );
                const made = new Map<string, ModelFragmentChange[]>();
                results.flat().forEach(({ model, changes: parts }) => {
                    made.set(model, [...(made.get(model) ?? []), ...parts]);
                });
                return [...made]
                    .filter(([, parts]) => parts.length > 0)
                    .map(([model, parts]) => ({
                        model,
                        pullRequestUrl,
                        changes: parts,
                        contentBefore: live.get(model) ?? null,
                        contentAfter: writes.get(model) ?? null,
                    }));
            },
        );
    }

    /** Leaves one part of this person's drafted model as it is live, by adding the changes that put it back. */
    async takeLiveDraftPart(
        user: SessionUser,
        projectUuid: string,
        model: string,
        path: string,
    ): Promise<void> {
        await this.assertCanEditModels(user, projectUuid);
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const draft = await this.loadDraft(owner, model);
        const live = draft.live.get(model);
        // With the model gone live, or the whole of it in question, theirs is the model without this draft.
        if (live === undefined || path === '') {
            await this.discardDraft(user, projectUuid, {
                kind: 'model',
                model,
            });
            return;
        }
        const version =
            draft.stored.find(({ name }) => name === model)?.version ?? null;
        const mine = draft.writes.has(model)
            ? (draft.writes.get(model) ?? null)
            : live;
        // Nothing of the draft's differs there, or the draft removes the whole model.
        if (
            mine === null ||
            readModelPart(mine, path) === readModelPart(live, path)
        ) {
            return;
        }
        // Stored as "as live", not as a copy of what is live now, so it follows live if that changes again.
        const { workspaceUuid } =
            await this.projectModelDocumentModel.createCheckedOutDraftChange(
                {
                    ...owner,
                    promptUuid: null,
                    changeName: UNTITLED_WORKSPACE_NAME,
                    models: [
                        {
                            name: model,
                            yaml: null,
                            remove: [],
                            removeModel: false,
                            restore: [path],
                        },
                    ],
                    baseVersions: draft.repo ? null : { [model]: version },
                    projectContextEntries: null,
                },
                draft.organizationUuid,
            );
        await this.queueDraftImpactCheckAfterChange(user, {
            ...owner,
            workspaceUuid,
        });
    }

    /** How each drafted model stands against what was published since the draft was based on it; a model with no recorded base is left out. */
    private async reconcileDraft(
        projectUuid: string,
        draft: LoadedDraft,
    ): Promise<Map<string, SemanticLayerDraftReconciliation>> {
        if (draft.repo) return new Map();
        // The oldest version any of a model's changes was made on, whatever order they are in now: a model that was not there is older than any version.
        const bases = new Map<string, number | null>();
        draft.changes.forEach(({ baseVersions, models }) =>
            Object.entries(baseVersions ?? {}).forEach(([model, version]) => {
                // A base outlives the model's part of a change that was since applied or discarded on its own.
                if (!models.some(({ name }) => name === model)) return;
                const known = bases.get(model);
                if (
                    known === undefined ||
                    (known !== null && (version === null || version < known))
                ) {
                    bases.set(model, version);
                }
            }),
        );
        const liveVersions = new Map(
            draft.stored.map(({ name, version }) => [name, version]),
        );
        const results = draft.results.flat();
        // A model whose edits all hit parts live no longer has writes nothing, yet still conflicts.
        const drafted = [...bases].filter(
            ([model, version]) =>
                draft.writes.has(model) ||
                (version !== (liveVersions.get(model) ?? null) &&
                    findRefusedPaths(model, results).length > 0),
        );
        const baseContents =
            await this.projectModelDocumentModel.findDocumentsAt(
                projectUuid,
                new Map(
                    drafted.flatMap(([model, version]): [string, number][] =>
                        version === null || version === liveVersions.get(model)
                            ? []
                            : [[model, version]],
                    ),
                ),
            );
        const reconciled = new Map<string, SemanticLayerDraftReconciliation>();
        drafted.forEach(([model, version]) => {
            const liveVersion = liveVersions.get(model) ?? null;
            if (version === liveVersion) {
                reconciled.set(model, {
                    state: 'current',
                    liveVersion,
                    merged: [],
                    conflicts: [],
                });
                return;
            }
            // A base whose revision is gone cannot be set against anything.
            if (version !== null && !baseContents.has(model)) return;
            const base =
                version === null ? null : (baseContents.get(model) ?? null);
            const onBase = foldDraft(
                new Map(base === null ? [] : [[model, base]]),
                draft.changes.map(({ models }) =>
                    models.filter(({ name }) => name === model),
                ),
            ).writes;
            reconciled.set(model, {
                ...reconcileModel({
                    base,
                    live: draft.live.get(model) ?? null,
                    mine: draft.writes.has(model)
                        ? (draft.writes.get(model) ?? null)
                        : (draft.live.get(model) ?? null),
                    draftedPaths: findDraftedPaths(model, results),
                    refusedPaths: findRefusedPaths(model, results),
                    wanted: onBase.has(model)
                        ? (onBase.get(model) ?? null)
                        : base,
                }),
                liveVersion,
            });
        });
        return reconciled;
    }

    /** Keeps this person's draft of a model as it is over what was published to it since: the draft is based on live from here on. */
    async keepDraftModel(
        user: SessionUser,
        projectUuid: string,
        model: string,
        /** The live version the person was shown; keeping over a later one would approve a change they never saw. */
        seenLiveVersion: number | null,
    ): Promise<void> {
        await this.assertCanEditModels(user, projectUuid);
        const { repo } = await this.loadStored(projectUuid);
        if (repo) return;
        const kept = await this.projectModelDocumentModel.rebaseDraftChanges(
            await this.findDraftOwner(projectUuid, user.userUuid),
            model,
            seenLiveVersion,
        );
        if (!kept) {
            throw new ParameterError(
                'This model was published again since you looked. Check what changed, then choose.',
            );
        }
    }

    /**
     * The saved content that reads a field the draft defines differently or removes.
     * A changed definition breaks nothing, so the impact check never mentions it,
     * yet every chart on it shows a different number after publishing.
     */
    async getDraftUsage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerDraftUsage> {
        const nothing = { fields: [], checkedFields: 0 };
        if (!(await this.canEditModels(user, projectUuid))) return nothing;
        const draft = await this.loadDraft(
            await this.findDraftOwner(projectUuid, user.userUuid),
            null,
        );
        if (draft.writes.size === 0) return nothing;
        const [before, after] = await Promise.all([
            this.checker.compile(projectUuid, draft.live),
            this.checker.compile(
                projectUuid,
                withWrites(draft.live, draft.writes),
            ),
        ]);
        const fieldsOf = (
            explores: (Explore | ExploreError)[],
            model: string,
        ) => {
            const explore = explores.find(({ name }) => name === model);
            const table =
                explore && !isExploreError(explore)
                    ? explore.tables[explore.baseTable]
                    : undefined;
            return new Map(
                table
                    ? [
                          ...Object.values(table.dimensions),
                          ...Object.values(table.metrics),
                      ].map((field) => [getItemId(field), field])
                    : [],
            );
        };
        const touched = [...draft.writes.keys()].flatMap((model) => {
            const live = fieldsOf(before.explores, model);
            const drafted = fieldsOf(after.explores, model);
            return [...live].flatMap(([fieldId, field]) => {
                const next = drafted.get(fieldId);
                if (next && next.compiledSql === field.compiledSql) return [];
                return [
                    {
                        model,
                        fieldId,
                        label: field.label,
                        kind: next
                            ? ('changed' as const)
                            : ('removed' as const),
                    },
                ];
            });
        });
        return this.findFieldUsage(projectUuid, touched);
    }

    /** Saved content that reads fields a pull request redefines or removes; empty for someone who cannot change the project. */
    async getFieldUsage(
        user: SessionUser,
        projectUuid: string,
        fields: SemanticLayerTouchedField[],
    ): Promise<SemanticLayerDraftUsage> {
        if (!(await this.canEditModels(user, projectUuid))) {
            return { fields: [], checkedFields: 0 };
        }
        return this.findFieldUsage(projectUuid, fields);
    }

    private async findFieldUsage(
        projectUuid: string,
        touched: SemanticLayerTouchedField[],
    ): Promise<SemanticLayerDraftUsage> {
        const checked = touched.slice(0, MAX_USAGE_FIELDS);
        const reports = await runWithConcurrency(checked, 4, ({ fieldId }) =>
            this.savedChartModel.analyzeFieldImpact(projectUuid, fieldId),
        );
        return {
            checkedFields: checked.length,
            fields: checked.flatMap((field, index) => {
                const { charts, summary } = reports[index];
                return charts.length + summary.dashboards === 0
                    ? []
                    : [
                          {
                              ...field,
                              charts: charts.map(({ uuid, name }) => ({
                                  uuid,
                                  name,
                              })),
                              dashboards: summary.dashboards,
                              scheduledDeliveries: summary.scheduledDeliveries,
                          },
                      ];
            }),
        };
    }

    private canValidate(user: SessionUser, project: ModelProject): boolean {
        return this.createAuditedAbility(user).can(
            'manage',
            subject('Validation', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        );
    }

    /** What the last background check found for this person's draft as it is now, or for one model of it. */
    async getDraftImpact(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
    ): Promise<SemanticLayerDraftImpact> {
        const project = await this.projectModel.get(projectUuid);
        if (
            !this.canValidate(user, project) ||
            (await this.findBlocker(user, project))
        ) {
            return NO_IMPACT;
        }
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const [{ live, writes }, check] = await Promise.all([
            this.loadDraft(owner, null),
            this.projectModelDocumentModel.findDraftImpactCheck(owner),
        ]);
        if (writes.size === 0) return NO_IMPACT;
        if (
            !check ||
            check.draftHash !== hashDraft(owner.workspaceUuid, live, writes)
        ) {
            return { status: 'unchecked', breaks: [] };
        }
        if (check.status === 'done' && check.breaks) {
            return {
                status: 'done',
                breaks:
                    (model === null ? undefined : check.breaks.models[model]) ??
                    check.breaks.draft,
            };
        }
        const timedOut =
            Date.now() - check.startedAt.getTime() > IMPACT_CHECK_TIMEOUT_MS;
        return {
            status:
                check.status === 'checking' && !timedOut
                    ? 'checking'
                    : 'failed',
            breaks: [],
        };
    }

    /** Has a worker check this person's draft against saved content; does nothing for an empty draft. */
    private async queueDraftImpactCheck(
        user: SessionUser,
        project: ModelProject,
        owner: DraftOwner,
    ): Promise<void> {
        if (!this.canValidate(user, project)) return;
        const { live, writes } = await this.loadDraft(owner, null);
        if (writes.size === 0) return;
        const expectedHash = hashDraft(owner.workspaceUuid, live, writes);
        await this.projectModelDocumentModel.startDraftImpactCheck({
            projectUuid: owner.projectUuid,
            userUuid: owner.userUuid,
            draftHash: expectedHash,
        });
        await this.schedulerClient.checkSemanticLayerDraftImpact({
            projectUuid: owner.projectUuid,
            userUuid: owner.userUuid,
            organizationUuid: project.organizationUuid,
            workspaceUuid: owner.workspaceUuid,
            expectedHash,
        });
    }

    /** Queues the check after a change to the draft; a failure to queue leaves the draft unchecked, not the change undone. */
    private async queueDraftImpactCheckAfterChange(
        user: SessionUser,
        owner: DraftOwner,
    ): Promise<void> {
        try {
            await this.queueDraftImpactCheck(
                user,
                await this.projectModel.get(owner.projectUuid),
                owner,
            );
        } catch (error) {
            this.logger.error(
                `Could not queue a semantic layer draft check for ${owner.projectUuid}`,
                error,
            );
        }
    }

    /** Checks this person's draft against saved content again, on request. */
    async requestDraftImpactCheck(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.get(projectUuid);
        const blocker = await this.findBlocker(user, project);
        if (blocker) throw blocker.error;
        if (!this.canValidate(user, project)) {
            throw new ForbiddenError(
                'User does not have permission to validate this project',
            );
        }
        await this.queueDraftImpactCheck(
            user,
            project,
            await this.findDraftOwner(projectUuid, user.userUuid),
        );
    }

    /** Saved content that works on what is live and would stop working with these writes. */
    private async findBreaks(
        projectUuid: string,
        live: Map<string, string>,
        writes: Map<string, string | null>,
    ): Promise<SemanticLayerDraftImpact['breaks']> {
        // Saved content cannot depend on a model that is not live yet.
        if ([...writes.keys()].every((name) => !live.has(name))) return [];
        const [before, after] = await Promise.all([
            this.checker.compile(projectUuid, live),
            this.checker.compile(projectUuid, withWrites(live, writes)),
        ]);
        // Only charts on a drafted model, or on a model that joins one, can change.
        const touched = [
            ...new Set([
                ...writes.keys(),
                ...[...before.explores, ...after.explores].flatMap((explore) =>
                    !isExploreError(explore) && usesAnyModel(explore, writes)
                        ? [explore.name]
                        : [],
                ),
            ]),
        ];
        const validate = (explores: (Explore | ExploreError)[]) =>
            this.validationService.generateValidation(
                projectUuid,
                explores,
                new Set([ValidationTarget.CHARTS, ValidationTarget.DASHBOARDS]),
                false,
                touched,
            );
        const drafted = await validate(after.explores);
        if (drafted.length === 0) return [];
        // Only now is what is broken already worth working out.
        const brokenAlready = new Set(
            (await validate(before.explores)).map(
                ({ name, error }) => `${name}|${error}`,
            ),
        );
        return drafted.flatMap((broken) =>
            broken.name !== undefined &&
            !brokenAlready.has(`${broken.name}|${broken.error}`)
                ? [
                      {
                          name: broken.name,
                          error: broken.error,
                          chartUuid: isChartValidationError(broken)
                              ? (broken.chartUuid ?? null)
                              : null,
                          dashboardUuid: isDashboardValidationError(broken)
                              ? (broken.dashboardUuid ?? null)
                              : null,
                      },
                  ]
                : [],
        );
    }

    /** The background check: what applying a person's draft, and each model of it alone, would break. */
    async checkDraftImpact({
        workspaceUuid,
        expectedHash,
        projectUuid,
        userUuid,
    }: {
        workspaceUuid?: string | null;
        expectedHash?: string;
        projectUuid: string;
        userUuid: string;
    }): Promise<void> {
        const owner =
            workspaceUuid === undefined
                ? await this.findDraftOwner(projectUuid, userUuid)
                : { projectUuid, userUuid, workspaceUuid };
        const { live, writes } = await this.loadDraft(owner, null);
        if (writes.size === 0) return;
        const check = {
            projectUuid,
            userUuid,
            draftHash: hashDraft(owner.workspaceUuid, live, writes),
        };
        if (expectedHash !== undefined && expectedHash !== check.draftHash)
            return;
        try {
            const models: DraftImpactBreaks['models'] = {};
            // One model alone is the whole draft, so only a draft of several is checked per model.
            if (writes.size > 1) {
                for (const model of writes.keys()) {
                    // eslint-disable-next-line no-await-in-loop
                    const part = await this.loadDraft(owner, model);
                    // eslint-disable-next-line no-await-in-loop
                    models[model] = await this.findBreaks(
                        projectUuid,
                        part.live,
                        part.writes,
                    );
                }
            }
            await this.projectModelDocumentModel.finishDraftImpactCheck({
                ...check,
                outcome: {
                    status: 'done',
                    breaks: {
                        draft: await this.findBreaks(projectUuid, live, writes),
                        models,
                    },
                },
            });
        } catch (error) {
            await this.projectModelDocumentModel.finishDraftImpactCheck({
                ...check,
                outcome: { status: 'failed' },
            });
            throw error;
        }
    }

    /** Takes all of this person's draft away, or one change, or one model's part of every change. */
    async discardDraft(
        user: SessionUser,
        projectUuid: string,
        target: DiscardTarget,
    ): Promise<void> {
        await this.assertCanEditModels(user, projectUuid);
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const changeUuids =
            target.kind === 'change'
                ? [target.changeUuid]
                : (
                      await this.projectModelDocumentModel.findDraftChanges(
                          owner,
                      )
                  ).map(({ draftChangeUuid }) => draftChangeUuid);
        const discarded =
            await this.projectModelDocumentModel.updateDraftChangeStatus({
                ...owner,
                drafts: {
                    changeUuids,
                    model: target.kind === 'model' ? target.model : null,
                },
                status: 'discarded',
                pullRequestUrl: null,
                discardedByUserUuid: null,
            });
        if (discarded === 0 && target.kind !== 'all') {
            throw new NotFoundError('Nothing in the draft matches');
        }
        if (target.kind === 'all') await this.finishDraftWorkspace(owner);
        await this.queueDraftImpactCheckAfterChange(user, owner);
        this.track(user, projectUuid, {
            event: 'semantic_studio.draft_discarded',
            properties: {
                scope: target.kind === 'all' ? 'draft' : target.kind,
            },
        });
    }

    /** Moves one change one place earlier or later in this person's draft; each change builds on the ones before it, so the order decides what a later one sees. */
    async moveDraftChange(
        user: SessionUser,
        projectUuid: string,
        draftChangeUuid: string,
        direction: SemanticLayerDraftMoveDirection,
    ): Promise<void> {
        await this.assertCanEditModels(user, projectUuid);
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const order = (
            await this.projectModelDocumentModel.findDraftChanges(owner)
        ).map((change) => change.draftChangeUuid);
        const index = order.indexOf(draftChangeUuid);
        const neighbour = order[index + (direction === 'earlier' ? -1 : 1)];
        if (index === -1) {
            throw new NotFoundError('Nothing in the draft matches');
        }
        // Already first or last: there is nowhere further to go.
        if (neighbour === undefined) return;
        await this.projectModelDocumentModel.swapDraftChanges(owner, [
            draftChangeUuid,
            neighbour,
        ]);
        await this.queueDraftImpactCheckAfterChange(user, owner);
    }

    /** Takes this person's draft live as one change set, or one model of it; nothing goes live when any part fails its checks. */
    async applyDraft(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
        merge: boolean = false,
    ): Promise<SemanticLayerDraftApplyResult> {
        await this.assertCanEditModels(user, projectUuid);
        // Requests that arrive together on this server share one publish; one that lands elsewhere waits on the lock, then finds nothing left to publish.
        const owner = await this.findDraftOwner(projectUuid, user.userUuid);
        const key = `${projectUuid}:${user.userUuid}:${owner.workspaceUuid}:${model ?? ''}:${merge}`;
        const running = this.publishing.get(key);
        if (running) return running;
        const publish = (async () => {
            const result = await this.projectModelDocumentModel.withPublishLock(
                owner,
                () => this.applyDraftOnce(user, owner, model),
            );
            if (model === null && result.failures.length === 0) {
                await this.recordDraftApplied(owner, result);
            }
            // What is left of the draft now sits on different live models.
            await this.queueDraftImpactCheckAfterChange(user, owner);
            const published =
                merge && result.pullRequestUrl
                    ? {
                          ...result,
                          merge: await this.mergeDraftPullRequest(
                              user,
                              projectUuid,
                              result.pullRequestUrl,
                          ),
                      }
                    : result;
            this.trackPublish(user, projectUuid, model, published);
            return published;
        })().finally(() => this.publishing.delete(key));
        this.publishing.set(key, publish);
        return publish;
    }

    private trackPublish(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
        { failures, pullRequestUrl, merge }: SemanticLayerDraftApplyResult,
    ): void {
        const scope = model === null ? 'draft' : 'model';
        if (failures.length > 0 || merge?.merged === false) {
            this.track(user, projectUuid, {
                event: 'semantic_studio.publish_failed',
                properties: {
                    reason:
                        failures.length > 0 ? 'check_failed' : 'merge_refused',
                    scope,
                },
            });
            return;
        }
        let outcome: 'live' | 'pull_request' | 'merged' = 'live';
        if (merge?.merged) outcome = 'merged';
        else if (pullRequestUrl) outcome = 'pull_request';
        this.track(user, projectUuid, {
            event: 'semantic_studio.draft_published',
            properties: { outcome, scope },
        });
    }

    /** Merges the pull request a draft was just sent as; a refusal leaves it open for review and says why. */
    private async mergeDraftPullRequest(
        user: SessionUser,
        projectUuid: string,
        prUrl: string,
    ): Promise<NonNullable<SemanticLayerDraftApplyResult['merge']>> {
        const merge = async (triesLeft: number): Promise<boolean> => {
            try {
                return (
                    await this.mergePullRequest(user, projectUuid, prUrl, {
                        sha: undefined,
                        incrementalCompile: true,
                    })
                ).merged;
            } catch (error) {
                // Right after a commit the repository has not worked out yet whether the pull request can merge.
                if (
                    triesLeft === 0 ||
                    !/not mergeable/i.test(getErrorMessage(error))
                ) {
                    throw error;
                }
                await delay(MERGE_RETRY_MS);
                return merge(triesLeft - 1);
            }
        };
        try {
            if (!(await merge(MERGE_RETRIES))) {
                return {
                    merged: false,
                    reason: 'The repository did not merge it.',
                };
            }
            return { merged: true };
        } catch (error) {
            return { merged: false, reason: getErrorMessage(error) };
        }
    }

    private applyDraftOnce(
        user: SessionUser,
        owner: DraftOwner,
        model: string | null,
    ): Promise<SemanticLayerDraftApplyResult> {
        const { projectUuid } = owner;
        return this.retryOnConflict(projectUuid, async () => {
            const draft = await this.loadDraft(owner, model);
            if (model !== null && draft.changes.length === 0) {
                throw new NotFoundError('Model not found');
            }
            await this.assertNoModelsFromElsewhere(projectUuid, draft);
            const unmergeable = draft.results
                .flat()
                .flatMap(({ model: name, error }) =>
                    error === null ? [] : [{ model: name, error }],
                );
            if (unmergeable.length > 0) {
                return {
                    exploreCount: null,
                    failures: unmergeable,
                    pullRequestUrl: null,
                    merge: null,
                };
            }
            const check = await this.checker.check(
                user,
                projectUuid,
                draft.live,
                draft.writes,
            );
            if (check.rejected.size > 0) {
                this.logRejections(projectUuid, check.rejected);
                return {
                    exploreCount: null,
                    failures: [...check.rejected].map(([name, rejection]) => ({
                        model: name,
                        error: formatSemanticStudioRejection(name, rejection),
                    })),
                    pullRequestUrl: null,
                    merge: null,
                };
            }
            const drafts = {
                changeUuids: draft.changes.map(
                    ({ draftChangeUuid }) => draftChangeUuid,
                ),
                model,
            };
            const contextEntries =
                model === null
                    ? draft.changes.flatMap(
                          ({ projectContextEntries }) =>
                              projectContextEntries ?? [],
                      )
                    : [];
            if (contextEntries.length > 0 && draft.repo) {
                throw new ParameterError(
                    'This draft has project context, but this project now keeps it in lightdash.project_context.yml in its repository. Discard the project context change and publish again; nothing was published.',
                );
            }
            // Joins the transaction that settles the draft, so context goes live only with the rows it came from.
            const writeContext = async (trx: Knex.Transaction) => {
                if (contextEntries.length === 0) return;
                try {
                    await this.projectContextModel.upsertEntries(
                        projectUuid,
                        contextEntries,
                        trx,
                    );
                } catch (error) {
                    if (!(error instanceof ParseError)) throw error;
                    throw new ParameterError(
                        `The project context in this draft cannot be published: ${error.message}. Change the entry and publish again; nothing was published.`,
                    );
                }
            };
            // Nothing left to write: what the draft asked for is live already.
            if (!check.explores) {
                await this.projectModelDocumentModel.updateDraftChangeStatus({
                    ...owner,
                    drafts,
                    status: 'applied',
                    pullRequestUrl: null,
                    discardedByUserUuid: null,
                    withSettled: async (trx, settled) => {
                        if (
                            contextEntries.length > 0 &&
                            settled !== drafts.changeUuids.length
                        ) {
                            throw new ParameterError(
                                'The draft changed while it was being published, so nothing was published. Check it and publish again.',
                            );
                        }
                        await writeContext(trx);
                    },
                });
                return {
                    // Context went live with no explores, which finishes the workspace as a model publish does.
                    exploreCount: contextEntries.length > 0 ? 0 : null,
                    failures: [],
                    pullRequestUrl: null,
                    merge: null,
                };
            }
            if (draft.repo) {
                if (model !== null) {
                    throw new ParameterError(
                        'A draft of models kept in a repository is sent whole, as one pull request',
                    );
                }
                // The repository deploys the models once the pull request merges, so nothing goes live here.
                const sent = {
                    organizationUuid: draft.organizationUuid,
                    models: draft.repo,
                    writes: check.writes,
                    ...describePullRequest(draft.results.flat()),
                };
                const open = await this.findOpenDraftPullRequest(user, owner);
                const { url } =
                    (open &&
                        (await this.repoModels.updatePullRequest({
                            ...sent,
                            prUrl: open,
                        }))) ||
                    (await this.repoModels.openPullRequest(sent));
                // A workspace keeps its draft while the pull request is open, so it can still be read, tried and added to.
                if (owner.workspaceUuid !== null) {
                    return {
                        exploreCount: null,
                        failures: [],
                        pullRequestUrl: url,
                        merge: null,
                    };
                }
                let settled = 0;
                try {
                    settled =
                        await this.projectModelDocumentModel.updateDraftChangeStatus(
                            {
                                ...owner,
                                drafts,
                                status: 'applied',
                                pullRequestUrl: url,
                                discardedByUserUuid: null,
                            },
                        );
                } finally {
                    if (settled === 0) {
                        this.logger.error(
                            `Opened ${url} for project ${projectUuid} but could not mark the draft as sent`,
                        );
                    }
                }
                return {
                    exploreCount: null,
                    failures: [],
                    pullRequestUrl: url,
                    merge: null,
                };
            }
            const exploreCount = await this.commitDocuments(user, owner, {
                stored: draft.stored,
                writes: check.writes,
                explores: check.explores,
                source: {
                    kind: 'draft',
                    promptUuid:
                        draft.changes.findLast(
                            ({ promptUuid }) => promptUuid !== null,
                        )?.promptUuid ?? null,
                    drafts,
                },
                withSettled: writeContext,
            });
            return {
                exploreCount,
                failures: [],
                pullRequestUrl: null,
                merge: null,
            };
        });
    }

    /** Writes the documents and sets their explores live, removing the explores of deleted models by name since setExplores merges. */
    private async commitDocuments(
        user: SessionUser,
        owner: DraftOwner,
        {
            stored,
            writes,
            explores,
            source,
            withSettled,
        }: {
            stored: ProjectModelDocument[];
            /** Null content deletes the model. */
            writes: Map<string, string | null>;
            explores: (Explore | ExploreError)[];
            source: ChangeSetSource;
            /** Writes more in the transaction that settles the draft. */
            withSettled?: (trx: Knex.Transaction) => Promise<void>;
        },
    ): Promise<number> {
        const removed = [...writes].flatMap(([name, content]) =>
            content === null && !explores.some((e) => e.name === name)
                ? [name]
                : [],
        );
        const { deployed } =
            await this.projectModelDocumentModel.createChangeSet(
                {
                    ...owner,
                    source,
                    readVersions: new Map(
                        stored.map(({ name, version }) => [name, version]),
                    ),
                    documents: [...writes].map(([name, content]) => ({
                        name,
                        content,
                    })),
                    withSettled,
                },
                async () => {
                    const { exploreCount } =
                        explores.length > 0
                            ? await this.projectService.setExplores(
                                  user,
                                  owner.projectUuid,
                                  explores,
                              )
                            : { exploreCount: 0 };
                    // Neither write joins the commit's transaction; the removal goes last so a failed deploy removes nothing.
                    if (removed.length > 0) {
                        await this.projectModel.deleteCachedExplores(
                            owner.projectUuid,
                            removed,
                        );
                    }
                    return exploreCount;
                },
            );
        return deployed;
    }

    /** A model's YAML as this person's draft leaves it, for the agent working on that draft. */
    async readDraftedModel(
        user: SessionUser,
        projectUuid: string,
        name: string,
    ): Promise<{
        content: string | null;
        inDraft: boolean;
        modelNames: string[];
    }> {
        await this.assertCanEditModels(user, projectUuid);
        const { live, writes } = await this.loadDraft(
            await this.findDraftOwner(projectUuid, user.userUuid),
            null,
        );
        const drafted = withWrites(live, writes);
        return {
            content: drafted.get(name) ?? null,
            inDraft: writes.has(name),
            modelNames: [...drafted.keys()],
        };
    }

    /** Reverts change sets by restoring what each changed model held before, newest first, as one new change set. */
    async undo(
        user: SessionUser,
        projectUuid: string,
        changeSetUuids: string[],
    ): Promise<{ exploreCount: number }> {
        await this.assertCanEditModels(user, projectUuid);
        const reverts = [...new Set(changeSetUuids)];
        const changeSets = await this.projectModelDocumentModel.findChangeSets(
            projectUuid,
            reverts,
        );
        if (reverts.length === 0 || changeSets.length !== reverts.length) {
            throw new NotFoundError('Change not found');
        }
        if (changeSets.some((set) => set.revertedByChangeSetUuid !== null)) {
            throw new ParameterError('This change was already undone');
        }
        const { stored, repo } = await this.loadStored(projectUuid);
        if (repo) {
            throw new ParameterError(
                'A change to this project is undone in its repository',
            );
        }
        const live = new Map(
            stored.map(({ name, content }) => [name, content]),
        );
        const writes = new Map<string, string | null>();
        [...changeSets]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .flatMap(({ revisions }) => revisions)
            .forEach(({ name, contentBefore, contentAfter }) => {
                const current = writes.has(name)
                    ? (writes.get(name) ?? null)
                    : (live.get(name) ?? null);
                // Content, not version: undoing a later change bumps the version but restores what this one wrote.
                if (current !== contentAfter) {
                    throw new ParameterError(
                        `${name} changed after this, so undo the later change first`,
                    );
                }
                writes.set(name, contentBefore);
            });
        const { explores } = await this.checker.compile(
            projectUuid,
            withWrites(live, writes),
        );
        const broken = await this.checker.findNewlyBroken(
            projectUuid,
            live,
            explores,
        );
        if (broken.length > 0) {
            throw new ParameterError(
                `Undoing this would break ${broken.map(({ name }) => name).join(', ')}`,
            );
        }
        try {
            return {
                exploreCount: await this.commitDocuments(
                    user,
                    await this.findDraftOwner(projectUuid, user.userUuid),
                    {
                        stored,
                        writes,
                        explores,
                        source: { kind: 'undo', reverts },
                    },
                ),
            };
        } catch (error) {
            if (error instanceof ModelDocumentsChangedError) {
                throw new ParameterError(
                    'The semantic layer changed while undoing; try again',
                );
            }
            throw error;
        }
    }

    /** The pull request this draft's workspace was already sent as, while it is still open. */
    private async findOpenDraftPullRequest(
        user: SessionUser,
        { workspaceUuid }: DraftOwner,
    ): Promise<string | null> {
        if (workspaceUuid === null) return null;
        const workspace = await this.workspaceModel.find(
            workspaceUuid,
            user.userUuid,
        );
        const pullRequest = workspace?.pullRequest ?? null;
        return isPullRequestOpen(pullRequest) ? pullRequest.url : null;
    }

    /** A draft that went live finishes its workspace; one sent as a pull request waits on that. */
    private async recordDraftApplied(
        owner: DraftOwner,
        { pullRequestUrl, exploreCount }: SemanticLayerDraftApplyResult,
    ): Promise<void> {
        try {
            if (pullRequestUrl) {
                await this.workspaceModel.attachPullRequest(
                    owner,
                    pullRequestUrl,
                );
            } else if (exploreCount !== null) {
                await this.finishDraftWorkspace(owner);
            }
        } catch (error) {
            this.logger.warn(
                `Could not update the Studio workspace after a publish on project ${owner.projectUuid}: ${getErrorMessage(error)}`,
            );
        }
    }

    /** A draft that is gone, published or discarded, ends the workspace it was for. */
    private async finishDraftWorkspace(owner: DraftOwner): Promise<void> {
        if (owner.workspaceUuid === null) return;
        await this.workspaceModel.finish(owner, owner.workspaceUuid);
    }

    /** Refuses anyone who cannot change this project's models here; otherwise how a change lands. */
    async assertCanUseStudio(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerStatus> {
        const status = await this.getStatus(user, projectUuid);
        if (!status.enabled) throw new ForbiddenError(CANNOT_USE_STUDIO);
        return status;
    }

    async listChanges(
        user: SessionUser,
        projectUuid: string,
        threadUuid: string | null,
    ) {
        await this.assertCanUseStudio(user, projectUuid);
        return this.workspaceModel.listChanges(
            { projectUuid, userUuid: user.userUuid },
            threadUuid,
        );
    }

    async listWorkspaces(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticStudioWorkspaces> {
        await this.assertCanUseStudio(user, projectUuid);
        let all = await this.workspaceModel.findInProject(
            projectUuid,
            user.userUuid,
        );
        const pending = all
            .filter(
                (workspace) =>
                    workspace.isMine &&
                    !workspace.finishedAt &&
                    workspace.pullRequest,
            )
            .sort((a, b) => Number(b.isActive) - Number(a.isActive))
            // The list is read on every save and by every open tab; the provider is asked once a minute per pull request.
            .filter(
                (workspace) =>
                    Date.now() -
                        (this.pullRequestRefreshedAt.get(
                            workspace.pullRequest?.url ?? '',
                        ) ?? 0) >
                    PULL_REQUEST_REFRESH_MS,
            )
            .slice(0, MAX_PULL_REQUEST_REFRESHES);
        let changed = false;
        const project =
            pending.length > 0
                ? await this.projectModel.get(projectUuid)
                : null;
        await runWithConcurrency(pending, 1, async (workspace) => {
            if (!workspace.pullRequest || !project) return;
            try {
                const prUrl = workspace.pullRequest.url;
                this.pullRequestRefreshedAt.set(prUrl, Date.now());
                const state = await this.repoModels.getPullRequestState(
                    project.organizationUuid,
                    project.dbtConnection,
                    prUrl,
                );
                if (state && state !== 'open') {
                    await this.recordPullRequestState(
                        user,
                        projectUuid,
                        prUrl,
                        state,
                        false,
                    );
                    changed = true;
                }
            } catch (error) {
                this.logger.warn(
                    `SemanticStudio: failed to refresh pull request state: ${getErrorMessage(error)}`,
                );
            }
        });
        if (changed) {
            all = await this.workspaceModel.findInProject(
                projectUuid,
                user.userUuid,
            );
        }
        const recentSince = Date.now() - RECENT_WORKSPACE_MS;
        return {
            mine: all
                .filter(
                    (workspace) => workspace.isMine && !workspace.finishedAt,
                )
                .sort((a, b) => Number(b.isActive) - Number(a.isActive)),
            others: all.filter(
                (workspace) => !workspace.isMine && !workspace.finishedAt,
            ),
            recent: all
                .filter(
                    (workspace) =>
                        !!workspace.finishedAt &&
                        new Date(workspace.finishedAt).getTime() > recentSince,
                )
                .sort(
                    (a, b) =>
                        new Date(b.finishedAt ?? 0).getTime() -
                        new Date(a.finishedAt ?? 0).getTime(),
                ),
        };
    }

    async getWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<SemanticStudioWorkspace> {
        await this.assertCanUseStudio(user, projectUuid);
        return this.loadWorkspace(user, projectUuid, workspaceUuid);
    }

    private async loadWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<SemanticStudioWorkspace> {
        const workspace = await this.workspaceModel.find(
            workspaceUuid,
            user.userUuid,
        );
        if (!workspace || workspace.projectUuid !== projectUuid) {
            throw new NotFoundError('No such change');
        }
        return workspace;
    }

    /** Creates a checkout, or resumes the workspace of a repository conversation. */
    async startWorkspace(
        user: SessionUser,
        projectUuid: string,
        { threadUuid, name }: SemanticStudioWorkspaceStartBody,
    ): Promise<SemanticStudioWorkspace> {
        await this.assertCanUseStudio(user, projectUuid);
        const owner = { projectUuid, userUuid: user.userUuid };
        if (threadUuid === null) {
            await this.assertCanEditModels(user, projectUuid);
            const project = await this.projectModel.get(projectUuid);
            const uuid = await this.workspaceModel.create(
                owner,
                project.organizationUuid,
                normalizeWorkspaceName(name, WORKSPACE_NAME_MAX_LENGTH),
            );
            this.track(user, projectUuid, {
                event: 'semantic_studio.draft_started',
                properties: { trigger: 'explicit' },
            });
            return this.loadWorkspace(user, projectUuid, uuid);
        }
        const thread = await this.workspaceModel.findStudioThread(
            owner,
            threadUuid,
        );
        if (!thread) {
            throw new NotFoundError('No Studio conversation of yours matches');
        }
        const workspaceUuid = await this.workspaceModel.start(owner, {
            ...thread,
            threadUuid,
            name: normalizeWorkspaceName(name, WORKSPACE_NAME_MAX_LENGTH),
        });
        return this.loadWorkspace(user, projectUuid, workspaceUuid);
    }

    private async getOwnWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<SemanticStudioWorkspace> {
        await this.assertCanUseStudio(user, projectUuid);
        const workspace = await this.loadWorkspace(
            user,
            projectUuid,
            workspaceUuid,
        );
        if (!workspace.isMine) {
            throw new ForbiddenError("This change is someone else's");
        }
        return workspace;
    }

    async activateWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<SemanticStudioWorkspace> {
        await this.getOwnWorkspace(user, projectUuid, workspaceUuid);
        await this.workspaceModel.activate(
            { projectUuid, userUuid: user.userUuid },
            workspaceUuid,
        );
        this.track(user, projectUuid, {
            event: 'semantic_studio.draft_switched',
            properties: { to: 'draft' },
        });
        return this.loadWorkspace(user, projectUuid, workspaceUuid);
    }

    /** Leaves the active workspace, so the next conversation starts a new one. */
    async leaveWorkspace(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        await this.assertCanUseStudio(user, projectUuid);
        await this.workspaceModel.leave({
            projectUuid,
            userUuid: user.userUuid,
        });
        this.track(user, projectUuid, {
            event: 'semantic_studio.draft_switched',
            properties: { to: 'live' },
        });
    }

    async renameWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
        name: string,
    ): Promise<SemanticStudioWorkspace> {
        await this.getOwnWorkspace(user, projectUuid, workspaceUuid);
        if (!name.trim()) throw new ParameterError('A change needs a name');
        await this.workspaceModel.rename(
            { projectUuid, userUuid: user.userUuid },
            workspaceUuid,
            normalizeWorkspaceName(name, WORKSPACE_NAME_MAX_LENGTH),
        );
        return this.loadWorkspace(user, projectUuid, workspaceUuid);
    }

    /** Ends a workspace whose changes were discarded; it stays as history. */
    async finishWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<void> {
        await this.getOwnWorkspace(user, projectUuid, workspaceUuid);
        await this.workspaceModel.finish(
            { projectUuid, userUuid: user.userUuid },
            workspaceUuid,
        );
        await this.workspaceModel.deleteFinishedBranchCompiles(projectUuid);
        this.track(user, projectUuid, {
            event: 'semantic_studio.draft_discarded',
            properties: { scope: 'draft' },
        });
    }

    /** Merges a pull request and, once merged, records it so the change reads merged from that moment. */
    async mergePullRequest(
        user: SessionUser,
        projectUuid: string,
        prUrl: string,
        opts: { sha: string | undefined; incrementalCompile: boolean },
    ): Promise<WritebackMergeResult> {
        const result = await this.aiWritebackService.mergePullRequest({
            user,
            projectUuid,
            prUrl,
            ...opts,
        });
        if (result.merged) {
            await this.recordPullRequestState(
                user,
                projectUuid,
                prUrl,
                'merged',
                true,
            );
        }
        return result;
    }

    /**
     * Records a pull request's state as its provider reported it to someone allowed to ask. A draft sent as that
     * pull request is settled by its merge, and kept when it closes, so the work can be sent again or discarded;
     * once settled, the asker's try-out of it and the compiles of finished changes are dropped.
     * The first to record a merge refreshes the project with it, unless the merge already scheduled that compile.
     */
    async recordPullRequestState(
        user: SessionUser,
        projectUuid: string,
        prUrl: string,
        state: SemanticStudioWorkspacePullRequestState,
        mergeCompileScheduled: boolean,
    ): Promise<void> {
        const drafted =
            state === 'open'
                ? []
                : await this.findDraftsSentAs(projectUuid, prUrl);
        if (state === 'merged') {
            await Promise.all(
                drafted.map(({ owner, changeUuids }) =>
                    this.projectModelDocumentModel.updateDraftChangeStatus({
                        ...owner,
                        drafts: { changeUuids, model: null },
                        status: 'applied',
                        pullRequestUrl: prUrl,
                        discardedByUserUuid: null,
                    }),
                ),
            );
        }
        const recorded = await this.workspaceModel.recordPullRequestState(
            projectUuid,
            prUrl,
            state,
            // A closed pull request with a draft behind it leaves the workspace open.
            state === 'merged' || drafted.length === 0,
        );
        // Merged outside the app, so nothing has refreshed the project with it yet.
        if (state === 'merged' && recorded && !mergeCompileScheduled) {
            await this.aiWritebackService.scheduleCompileAfterMerge(
                user,
                projectUuid,
                true,
            );
        }
        if (state === 'open') return;
        await this.workspaceModel.deleteFinishedBranchCompiles(projectUuid);
        await retireDbtTryOut(
            this.fileStorageClient,
            { projectUuid, userUuid: user.userUuid },
            await this.workspaceModel.findActive({
                projectUuid,
                userUuid: user.userUuid,
            }),
            prUrl,
        );
    }

    /** The unfinished workspaces whose draft was sent as this pull request, with what is still in each draft. */
    private async findDraftsSentAs(
        projectUuid: string,
        prUrl: string,
    ): Promise<{ owner: WorkspaceDraftOwner; changeUuids: string[] }[]> {
        const workspaces =
            await this.workspaceModel.findUnfinishedWithPullRequest(
                projectUuid,
                prUrl,
            );
        const drafts = await Promise.all(
            workspaces.map(async ({ workspaceUuid, userUuid }) => {
                const owner = { projectUuid, userUuid, workspaceUuid };
                const changes =
                    await this.projectModelDocumentModel.findWorkspaceDraftChanges(
                        owner,
                    );
                return {
                    owner,
                    changeUuids: changes.map(
                        ({ draftChangeUuid }) => draftChangeUuid,
                    ),
                };
            }),
        );
        return drafts.filter(({ changeUuids }) => changeUuids.length > 0);
    }
}
