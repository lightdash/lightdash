import { subject } from '@casl/ability';
import {
    DbtProjectType,
    diffModelDocuments,
    doModelPathsOverlap,
    ExploreType,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    getItemId,
    isChartValidationError,
    isDashboardValidationError,
    isExploreError,
    isUserManagedExplore,
    NotFoundError,
    ParameterError,
    ProjectType,
    readModelPart,
    ValidationTarget,
    type DbtManifest,
    type Explore,
    type ExploreError,
    type LightdashError,
    type Project,
    type SemanticLayerDraft,
    type SemanticLayerDraftApplyResult,
    type SemanticLayerDraftedModels,
    type SemanticLayerDrafter,
    type SemanticLayerDraftImpact,
    type SemanticLayerDraftItemResult,
    type SemanticLayerDraftModelInput,
    type SemanticLayerDraftMoveDirection,
    type SemanticLayerDraftReconciliation,
    type SemanticLayerDraftState,
    type SemanticLayerDraftUsage,
    type SemanticLayerModelCode,
    type SemanticLayerStatus,
    type SemanticLayerStoredModels,
    type SemanticLayerTouchedField,
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspacePullRequestState,
    type SemanticStudioWorkspaces,
    type SemanticStudioWorkspaceStartBody,
    type SessionUser,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { text } from 'node:stream/consumers';
import { type FileStorageClient } from '../../../clients/FileStorage/FileStorageClient';
import { type DraftImpactBreaks } from '../../../database/entities/projectModelDraftImpacts';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { type SavedChartModel } from '../../../models/SavedChartModel';
import { BaseService } from '../../../services/BaseService';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { type ValidationService } from '../../../services/ValidationService/ValidationService';
import { runWithConcurrency } from '../../../utils/runWithConcurrency';
import {
    ModelDocumentsChangedError,
    type ChangeSetSource,
    type ProjectModelDocument,
    type ProjectModelDocumentModel,
    type StoredDraftChange,
} from '../../models/ProjectModelDocumentModel';
import { type SemanticStudioWorkspaceModel } from '../../models/SemanticStudioWorkspaceModel';
import { getWritebackConnectionSupport } from '../AiAgentService/writebackConnection';
import { type ParsedDbtProject } from '../AiWritebackService/types';
import {
    dbtTryOutFileId,
    findChangedModels,
    findLiveTableLocations,
    markNewModels,
    pointManifestAtLiveTables,
    type DbtTryOut,
} from './dbtTryOut';
import {
    DraftChecker,
    usesAnyModel,
    type DraftCheckerProjectService,
} from './DraftChecker';
import { foldDraft, withWrites } from './draftFold';
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

/** The parts of a project that decide whether its models are kept here. */
type ModelProject = Pick<
    Project,
    | 'projectUuid'
    | 'organizationUuid'
    | 'upstreamProjectUuid'
    | 'type'
    | 'createdByUserUuid'
> & { dbtConnection: Project['dbtConnection'] };

export type SemanticStudioServiceArguments = {
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    projectModel: {
        get: (projectUuid: string) => Promise<ModelProject>;
        getAllExploreSummaries: (
            projectUuid: string,
        ) => Promise<{ name: string; type?: ExploreType }[]>;
        findExploresFromCache: (
            projectUuid: string,
            key: 'name',
        ) => Promise<Record<string, Explore | ExploreError>>;
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
        | 'findOtherDrafters'
        | 'swapDraftChanges'
        | 'withPublishLock'
        | 'findDraftState'
        | 'rebaseDraftChanges'
        | 'findDocumentsAt'
        | 'findPublishedSince'
        | 'findSettledDraftChanges'
        | 'createDraftChange'
        | 'updateDraftChangeStatus'
        | 'findDraftImpactCheck'
        | 'startDraftImpactCheck'
        | 'finishDraftImpactCheck'
    >;
    schedulerClient: {
        checkSemanticLayerDraftImpact: (payload: {
            organizationUuid: string;
            projectUuid: string;
            userUuid: string;
        }) => Promise<unknown>;
    };
    validationService: Pick<ValidationService, 'generateValidation'>;
    projectService: Pick<
        ProjectService,
        'setExplores' | 'compileExploresFromManifest'
    > &
        DraftCheckerProjectService;
    fileStorageClient: Pick<
        FileStorageClient,
        'isEnabled' | 'uploadTxt' | 'getFileStream' | 'deleteFile'
    >;
    repoModels: Pick<
        RepoModelSource,
        'isInstalled' | 'load' | 'openPullRequest'
    >;
    savedChartModel: Pick<SavedChartModel, 'analyzeFieldImpact'>;
    workspaceModel: Pick<
        SemanticStudioWorkspaceModel,
        | 'findStudioThread'
        | 'findInProject'
        | 'find'
        | 'findActive'
        | 'start'
        | 'activate'
        | 'leave'
        | 'rename'
        | 'finish'
        | 'attachPullRequest'
        | 'recordPullRequestState'
    >;
};

/** A proposal once it was checked on top of the person's draft. */
export type SemanticLayerDraftProposal = {
    results: SemanticLayerDraftItemResult[];
    diffs: {
        model: string;
        contentBefore: string | null;
        contentAfter: string | null;
    }[];
    /** Null when nothing passed. */
    draftChangeUuid: string | null;
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

export type DiscardTarget =
    | { kind: 'all' }
    | { kind: 'change'; changeUuid: string }
    | { kind: 'model'; model: string };

// A write rereads and rechecks when another one lands first.
const MAX_WRITE_ATTEMPTS = 3;

// ponytail: a check whose worker died reads as failed after this long; sweep stale checks if that is not enough.
const IMPACT_CHECK_TIMEOUT_MS = 10 * 60 * 1000;

const NO_IMPACT: SemanticLayerDraftImpact = { status: 'done', breaks: [] };

/** Identifies a draft on top of what is live, so a check of one is not read as a check of another. */
const hashDraft = (
    live: Map<string, string>,
    writes: Map<string, string | null>,
): string =>
    createHash('sha256')
        .update(JSON.stringify([[...live], [...writes]]))
        .digest('hex');

const EMPTY_DRAFT: SemanticLayerDraft = {
    changes: [],
    models: [],
    errors: [],
    settled: [],
    othersDrafting: [],
};

const failed = (
    result: SemanticLayerDraftItemResult,
    error: string,
): SemanticLayerDraftItemResult => ({
    ...result,
    status: 'failed',
    changes: [],
    error,
});

/** Keeps a project's native models on the server and takes reviewed drafts of them live. */
// ponytail: a draft that redefines more fields than this is only partly looked up; page the lookup if drafts grow that large.
const MAX_USAGE_FIELDS = 40;

const RECENT_WORKSPACE_MS = 14 * 24 * 60 * 60 * 1000;

export class SemanticStudioService extends BaseService {
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

    private readonly checker: DraftChecker;

    /** Publishes under way, so a repeated request joins the one already running. */
    private readonly publishing = new Map<
        string,
        Promise<SemanticLayerDraftApplyResult>
    >();

    constructor(args: SemanticStudioServiceArguments) {
        super();
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
        this.checker = new DraftChecker(args.projectService);
    }

    /** Why this person cannot change this project's models here, or null when they can. */
    private async findAccessBlocker(
        user: SessionUser,
        project: ModelProject,
    ): Promise<LightdashError | null> {
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
            return new ForbiddenError(
                'User does not have permission to deploy to this project',
            );
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
            : new ForbiddenError('This feature is not enabled');
    }

    /** A write to the project's repository needs what any write to it needs. */
    private findSourceBlocker(
        user: SessionUser,
        project: ModelProject,
    ): LightdashError | null {
        return this.createAuditedAbility(user).cannot(
            'manage',
            subject('SourceCode', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
                isProtectedBranch: false,
            }),
        )
            ? new ForbiddenError(
                  "User does not have permission to change this project's repository",
              )
            : null;
    }

    /** Why this person cannot keep a draft of this project's models, or null when they can. */
    private async findBlocker(
        user: SessionUser,
        project: ModelProject,
    ): Promise<LightdashError | null> {
        const blocker = await this.findAccessBlocker(user, project);
        if (blocker) return blocker;
        if (project.dbtConnection.type === DbtProjectType.NONE) return null;
        if (
            keepsModelsInGithub(project.dbtConnection) &&
            !resolveRepoConnection(project.dbtConnection)
        ) {
            return new ParameterError(
                'Models in a repository can only be changed here when the connection uses the GitHub App on github.com',
            );
        }
        if (!resolveRepoConnection(project.dbtConnection)) {
            return new ParameterError(
                'A draft is kept for a project without a dbt connection, or one that keeps its models in GitHub',
            );
        }
        const sourceBlocker = this.findSourceBlocker(user, project);
        if (sourceBlocker) return sourceBlocker;
        return (await this.repoModels.isInstalled(project.organizationUuid))
            ? null
            : new ParameterError(
                  'The GitHub App must be installed to change models that live in a repository',
              );
    }

    /** Whether this person can change this project's models here, and what applying a draft would do. */
    async getStatus(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticLayerStatus> {
        const project = await this.projectModel.get(projectUuid);
        const { dbtConnection } = project;
        if (
            dbtConnection.type !== DbtProjectType.NONE &&
            !keepsModelsInGithub(dbtConnection)
        ) {
            // A dbt project keeps no draft: the agent edits the repository in a pull request.
            return {
                enabled:
                    // A preview is a look at a pull request's branch, not a place to start another.
                    project.type !== ProjectType.PREVIEW &&
                    getWritebackConnectionSupport(dbtConnection)
                        .editDbtProject &&
                    (await this.findAccessBlocker(user, project)) === null &&
                    this.findSourceBlocker(user, project) === null,
                appliesAs: 'dbt_pull_request',
            };
        }
        return {
            enabled: (await this.findBlocker(user, project)) === null,
            appliesAs: keepsModelsInGithub(dbtConnection)
                ? 'pull_request'
                : 'live',
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
        if (blocker) throw blocker;
    }

    async canEditModels(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const project = await this.projectModel.get(projectUuid);
        return (await this.findBlocker(user, project)) === null;
    }

    /** Explores deployed from a repository or the CLI would be replaced by the first model written here. */
    private async assertNoModelsFromElsewhere(
        projectUuid: string,
        { stored, repo }: Pick<LoadedDraft, 'stored' | 'repo'>,
    ): Promise<void> {
        // A repository is where its project's explores are meant to come from.
        if (repo || stored.length > 0) return;
        const summaries =
            await this.projectModel.getAllExploreSummaries(projectUuid);
        if (
            summaries.some(
                ({ type }) =>
                    type === undefined || type === ExploreType.DEFAULT,
            )
        ) {
            throw new ParameterError(
                'This project already has models deployed from outside the server; they cannot be changed here yet',
            );
        }
    }

    /** This person's draft replayed on what is live; with `model`, only that model's part of it. */
    private async loadDraft(
        projectUuid: string,
        userUuid: string,
        model: string | null,
    ): Promise<LoadedDraft> {
        const [{ organizationUuid, repo, stored }, drafted] = await Promise.all(
            [
                this.loadStored(projectUuid),
                this.projectModelDocumentModel.findDraftChanges(
                    projectUuid,
                    userUuid,
                ),
            ],
        );
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
        drafters: { name: string; changes: SemanticLayerDraftModelInput[][] }[],
    ): Map<string, SemanticLayerDrafter[]> {
        const byModel = new Map<string, SemanticLayerDrafter[]>();
        drafters.forEach(({ name, changes }) => {
            const results = foldDraft(live, changes).results.flat();
            [...new Set(results.map(({ model }) => model))].forEach((model) => {
                byModel.set(model, [
                    ...(byModel.get(model) ?? []),
                    { name, paths: findDraftedPaths(model, results) },
                ]);
            });
        });
        return byModel;
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

    /** Checks a change on top of this person's draft and adds what passes to it; nothing goes live. */
    async proposeDraftChange(
        user: SessionUser,
        projectUuid: string,
        models: SemanticLayerDraftModelInput[],
        promptUuid: string | null,
    ): Promise<SemanticLayerDraftProposal> {
        await this.assertCanEditModels(user, projectUuid);
        const draft = await this.loadDraft(projectUuid, user.userUuid, null);
        await this.assertNoModelsFromElsewhere(projectUuid, draft);
        const proposed = foldDraft(draft.live, [
            ...draft.changes.map((change) => change.models),
            models,
        ]);
        const check = await this.checker.check(
            user,
            projectUuid,
            draft.live,
            proposed.writes,
        );
        const results = proposed.results[draft.changes.length].map((result) => {
            if (result.status !== 'ready') return result;
            const error = check.rejected.get(result.model);
            return error === undefined
                ? { ...result, notes: check.notes.get(result.model) ?? [] }
                : failed(result, error);
        });
        const passing = models.filter(
            (_model, index) => results[index].status === 'ready',
        );
        if (passing.length === 0) {
            return { results, diffs: [], draftChangeUuid: null };
        }
        const before = withWrites(draft.live, draft.writes);
        const draftChangeUuid =
            await this.projectModelDocumentModel.createDraftChange({
                projectUuid,
                userUuid: user.userUuid,
                promptUuid,
                models: passing,
                // A repository has commits, not versions.
                baseVersions: draft.repo
                    ? null
                    : Object.fromEntries(
                          passing.map(({ name }) => [
                              name,
                              draft.stored.find((doc) => doc.name === name)
                                  ?.version ?? null,
                          ]),
                      ),
            });
        await this.queueDraftImpactCheckAfterChange(user, projectUuid);
        return {
            results,
            diffs: [...new Set(passing.map(({ name }) => name))].map(
                (model) => ({
                    model,
                    contentBefore: before.get(model) ?? null,
                    contentAfter: check.writes.get(model) ?? null,
                }),
            ),
            draftChangeUuid,
        };
    }

    /**
     * Every explore as the person's draft leaves it, by name, with null for a model
     * the draft removes; null when they have nothing drafted or cannot change the
     * project. This is what lets them query their own changes on the live project.
     */
    async findDevelopmentExplores(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Map<string, Explore | ExploreError | null> | null> {
        const status = await this.getStatus(user, projectUuid);
        if (status.appliesAs === 'dbt_pull_request') {
            return status.enabled
                ? this.findDbtTryOutExplores(user, projectUuid)
                : null;
        }
        if (!(await this.canEditModels(user, projectUuid))) return null;
        // Asked first: with nothing drafted there is no reason to read the live models, which for a repository is a network call.
        const changes = await this.projectModelDocumentModel.findDraftChanges(
            projectUuid,
            user.userUuid,
        );
        if (changes.length === 0) return null;
        const draft = await this.loadDraft(projectUuid, user.userUuid, null);
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

    /** Stores what this person's latest dbt change leaves to try, and returns the models it changed. */
    async saveDbtTryOut(
        user: SessionUser,
        projectUuid: string,
        {
            manifestJson,
            lightdashConfigYaml,
            changedFiles,
            prUrl,
        }: ParsedDbtProject,
        threadUuid: string | null,
    ): Promise<string[]> {
        let manifest: DbtManifest;
        try {
            manifest = JSON.parse(manifestJson);
        } catch {
            this.logger.warn(
                `Skipped trying a dbt change on project ${projectUuid}: its manifest is not valid JSON`,
            );
            return [];
        }
        const changedModels = findChangedModels(manifest, changedFiles);
        if (!this.fileStorageClient.isEnabled()) return changedModels;
        const status = await this.getStatus(user, projectUuid);
        if (!status.enabled || status.appliesAs !== 'dbt_pull_request')
            return changedModels;
        const live = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
        );
        const pointed = pointManifestAtLiveTables(
            manifest,
            findLiveTableLocations(Object.values(live)),
        );
        const explores = markNewModels(
            await this.projectService.compileExploresFromManifest(
                user,
                projectUuid,
                pointed.manifest,
                lightdashConfigYaml,
            ),
            pointed.newModels,
        );
        const tryOut: DbtTryOut = { prUrl, explores };
        await this.fileStorageClient.uploadTxt(
            Buffer.from(JSON.stringify(tryOut)),
            dbtTryOutFileId(projectUuid, user.userUuid, threadUuid),
        );
        return changedModels;
    }

    /** Forgets this person's try-out once its pull request is merged or closed. */
    async retireDbtTryOut(
        user: SessionUser,
        projectUuid: string,
        prUrl: string,
    ): Promise<void> {
        const found = await this.readDbtTryOut(user, projectUuid);
        if (found?.tryOut.prUrl !== prUrl) return;
        await this.fileStorageClient.deleteFile(`${found.fileId}.txt`);
    }

    private async readDbtTryOutFile(fileId: string): Promise<DbtTryOut | null> {
        try {
            const { stream } = await this.fileStorageClient.getFileStream(
                `${fileId}.txt`,
            );
            const tryOut: DbtTryOut = JSON.parse(await text(stream));
            return Array.isArray(tryOut.explores) ? tryOut : null;
        } catch (error) {
            if (error instanceof NotFoundError || error instanceof SyntaxError)
                return null;
            throw error;
        }
    }

    /** The try-out of the person's active workspace; without one, their latest change from before workspaces. */
    private async readDbtTryOut(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ fileId: string; tryOut: DbtTryOut } | null> {
        if (!this.fileStorageClient.isEnabled()) return null;
        const active = await this.workspaceModel.findActive({
            projectUuid,
            userUuid: user.userUuid,
        });
        if (active) {
            const fileId = dbtTryOutFileId(
                projectUuid,
                user.userUuid,
                active.threadUuid,
            );
            const tryOut = await this.readDbtTryOutFile(fileId);
            if (tryOut) return { fileId, tryOut };
        }
        const legacyId = dbtTryOutFileId(projectUuid, user.userUuid, null);
        const legacy = await this.readDbtTryOutFile(legacyId);
        // An older try-out belongs to the active workspace only when it is for that workspace's pull request.
        if (!legacy || (active && legacy.prUrl !== active.pullRequest?.url)) {
            return null;
        }
        return { fileId: legacyId, tryOut: legacy };
    }

    /** The explores this person's latest dbt change leaves, by name; null when they have none to try. */
    private async findDbtTryOutExplores(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Map<string, Explore | ExploreError> | null> {
        const found = await this.readDbtTryOut(user, projectUuid);
        // ponytail: models the change removes still show; the preview shows removals.
        return found
            ? new Map(
                  found.tryOut.explores.map((explore) => [
                      explore.name,
                      explore,
                  ]),
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
        const status = await this.getStatus(user, projectUuid);
        if (!status.enabled || status.appliesAs !== 'dbt_pull_request') {
            return null;
        }
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
        // A preview has no explores until its first compile; until then the person's own compiled change stands in.
        if (Object.keys(explores).length === 0) {
            return this.findDbtTryOutExplores(user, projectUuid);
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
        const state =
            await this.projectModelDocumentModel.findDraftState(projectUuid);
        return {
            fingerprint: createHash('sha256')
                .update(JSON.stringify(state))
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
            projectUuid,
            user.userUuid,
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
        const [draft, settled] = await Promise.all([
            this.loadDraft(projectUuid, user.userUuid, null),
            this.projectModelDocumentModel.findSettledDraftChanges(
                projectUuid,
                user.userUuid,
            ),
        ]);
        const others = SemanticStudioService.describeOtherDrafts(
            draft.live,
            await this.projectModelDocumentModel.findOtherDrafters(
                projectUuid,
                user.userUuid,
            ),
        );
        const othersDrafting = [...others].map(([model, drafters]) => ({
            model,
            drafters,
        }));
        if (draft.changes.length === 0) {
            return { ...EMPTY_DRAFT, settled, othersDrafting };
        }
        // When each model first joined the draft: what was published after that happened under it.
        const startedAt = new Map<string, Date>();
        draft.changes.forEach(({ createdAt }, index) =>
            draft.results[index].forEach(({ model }) => {
                if (!startedAt.has(model)) startedAt.set(model, createdAt);
            }),
        );
        const reconciliations = await this.reconcileDraft(projectUuid, draft);
        const [{ explores }, publishedSince] = await Promise.all([
            this.checker.compile(
                projectUuid,
                withWrites(draft.live, draft.writes),
            ),
            this.projectModelDocumentModel.findPublishedSince(
                projectUuid,
                user.userUuid,
                startedAt,
            ),
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
            })),
            models: [
                ...draft.writes,
                // A conflict on a model the draft writes nothing to still needs settling.
                ...[...reconciliations].flatMap(
                    ([model, { state }]): [string, string | null][] =>
                        state === 'conflict' && !draft.writes.has(model)
                            ? [[model, draft.live.get(model) ?? null]]
                            : [],
                ),
            ].map(([model, contentAfter]) => {
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
            othersDrafting,
        };
    }

    /** Leaves one part of this person's drafted model as it is live, by adding the changes that put it back. */
    async takeLiveDraftPart(
        user: SessionUser,
        projectUuid: string,
        model: string,
        path: string,
    ): Promise<void> {
        await this.assertCanEditModels(user, projectUuid);
        const draft = await this.loadDraft(projectUuid, user.userUuid, model);
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
        await this.projectModelDocumentModel.createDraftChange({
            projectUuid,
            userUuid: user.userUuid,
            promptUuid: null,
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
        });
        await this.queueDraftImpactCheckAfterChange(user, projectUuid);
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
            { projectUuid, userUuid: user.userUuid },
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
        const draft = await this.loadDraft(projectUuid, user.userUuid, null);
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
        const owner = { projectUuid, userUuid: user.userUuid };
        const [{ live, writes }, check] = await Promise.all([
            this.loadDraft(projectUuid, user.userUuid, null),
            this.projectModelDocumentModel.findDraftImpactCheck(owner),
        ]);
        if (writes.size === 0) return NO_IMPACT;
        if (!check || check.draftHash !== hashDraft(live, writes)) {
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
    ): Promise<void> {
        if (!this.canValidate(user, project)) return;
        const owner = {
            projectUuid: project.projectUuid,
            userUuid: user.userUuid,
        };
        const { live, writes } = await this.loadDraft(
            owner.projectUuid,
            owner.userUuid,
            null,
        );
        if (writes.size === 0) return;
        await this.projectModelDocumentModel.startDraftImpactCheck({
            ...owner,
            draftHash: hashDraft(live, writes),
        });
        await this.schedulerClient.checkSemanticLayerDraftImpact({
            ...owner,
            organizationUuid: project.organizationUuid,
        });
    }

    /** Queues the check after a change to the draft; a failure to queue leaves the draft unchecked, not the change undone. */
    private async queueDraftImpactCheckAfterChange(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        try {
            await this.queueDraftImpactCheck(
                user,
                await this.projectModel.get(projectUuid),
            );
        } catch (error) {
            this.logger.error(
                `Could not queue a semantic layer draft check for ${projectUuid}`,
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
        if (blocker) throw blocker;
        if (!this.canValidate(user, project)) {
            throw new ForbiddenError(
                'User does not have permission to validate this project',
            );
        }
        await this.queueDraftImpactCheck(user, project);
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
        projectUuid,
        userUuid,
    }: {
        projectUuid: string;
        userUuid: string;
    }): Promise<void> {
        const { live, writes } = await this.loadDraft(
            projectUuid,
            userUuid,
            null,
        );
        if (writes.size === 0) return;
        const check = {
            projectUuid,
            userUuid,
            draftHash: hashDraft(live, writes),
        };
        try {
            const models: DraftImpactBreaks['models'] = {};
            // One model alone is the whole draft, so only a draft of several is checked per model.
            if (writes.size > 1) {
                for (const model of writes.keys()) {
                    // eslint-disable-next-line no-await-in-loop
                    const part = await this.loadDraft(
                        projectUuid,
                        userUuid,
                        model,
                    );
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
        const changeUuids =
            target.kind === 'change'
                ? [target.changeUuid]
                : (
                      await this.projectModelDocumentModel.findDraftChanges(
                          projectUuid,
                          user.userUuid,
                      )
                  ).map(({ draftChangeUuid }) => draftChangeUuid);
        const discarded =
            await this.projectModelDocumentModel.updateDraftChangeStatus({
                projectUuid,
                userUuid: user.userUuid,
                drafts: {
                    changeUuids,
                    model: target.kind === 'model' ? target.model : null,
                },
                status: 'discarded',
                pullRequestUrl: null,
            });
        if (discarded === 0 && target.kind !== 'all') {
            throw new NotFoundError('Nothing in the draft matches');
        }
        await this.queueDraftImpactCheckAfterChange(user, projectUuid);
    }

    /** Moves one change one place earlier or later in this person's draft; each change builds on the ones before it, so the order decides what a later one sees. */
    async moveDraftChange(
        user: SessionUser,
        projectUuid: string,
        draftChangeUuid: string,
        direction: SemanticLayerDraftMoveDirection,
    ): Promise<void> {
        await this.assertCanEditModels(user, projectUuid);
        const owner = { projectUuid, userUuid: user.userUuid };
        const order = (
            await this.projectModelDocumentModel.findDraftChanges(
                projectUuid,
                user.userUuid,
            )
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
        await this.queueDraftImpactCheckAfterChange(user, projectUuid);
    }

    /** Takes this person's draft live as one change set, or one model of it; nothing goes live when any part fails its checks. */
    async applyDraft(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
    ): Promise<SemanticLayerDraftApplyResult> {
        await this.assertCanEditModels(user, projectUuid);
        // Requests that arrive together on this server share one publish; one that lands elsewhere waits on the lock, then finds nothing left to publish.
        const key = `${projectUuid}:${user.userUuid}:${model ?? ''}`;
        const running = this.publishing.get(key);
        if (running) return running;
        const publish = (async () => {
            const result = await this.projectModelDocumentModel.withPublishLock(
                { projectUuid, userUuid: user.userUuid },
                () => this.applyDraftOnce(user, projectUuid, model),
            );
            if (model === null && result.failures.length === 0) {
                await this.recordDraftApplied(user, projectUuid, result);
            }
            // What is left of the draft now sits on different live models.
            await this.queueDraftImpactCheckAfterChange(user, projectUuid);
            return result;
        })().finally(() => this.publishing.delete(key));
        this.publishing.set(key, publish);
        return publish;
    }

    private applyDraftOnce(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
    ): Promise<SemanticLayerDraftApplyResult> {
        return this.retryOnConflict(projectUuid, async () => {
            const draft = await this.loadDraft(
                projectUuid,
                user.userUuid,
                model,
            );
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
                };
            }
            // Publishing would put this person's version in place of one they have not looked at.
            const contested = [
                ...(await this.reconcileDraft(projectUuid, draft)),
            ].flatMap(([name, { state }]) =>
                state === 'conflict'
                    ? [
                          {
                              model: name,
                              error: 'Someone published a change to a part of this model that you changed too. Keep yours or combine them before publishing.',
                          },
                      ]
                    : [],
            );
            if (contested.length > 0) {
                return {
                    exploreCount: null,
                    failures: contested,
                    pullRequestUrl: null,
                };
            }
            const check = await this.checker.check(
                user,
                projectUuid,
                draft.live,
                draft.writes,
            );
            if (check.rejected.size > 0) {
                return {
                    exploreCount: null,
                    failures: [...check.rejected].map(([name, error]) => ({
                        model: name,
                        error,
                    })),
                    pullRequestUrl: null,
                };
            }
            const drafts = {
                changeUuids: draft.changes.map(
                    ({ draftChangeUuid }) => draftChangeUuid,
                ),
                model,
            };
            // Nothing left to write: what the draft asked for is live already.
            if (!check.explores) {
                await this.projectModelDocumentModel.updateDraftChangeStatus({
                    projectUuid,
                    userUuid: user.userUuid,
                    drafts,
                    status: 'applied',
                    pullRequestUrl: null,
                });
                return {
                    exploreCount: null,
                    failures: [],
                    pullRequestUrl: null,
                };
            }
            if (draft.repo) {
                // The repository deploys the models once the pull request merges, so nothing goes live here.
                const { url } = await this.repoModels.openPullRequest({
                    organizationUuid: draft.organizationUuid,
                    models: draft.repo,
                    writes: check.writes,
                    ...describePullRequest(draft.results.flat()),
                });
                let settled = 0;
                try {
                    settled =
                        await this.projectModelDocumentModel.updateDraftChangeStatus(
                            {
                                projectUuid,
                                userUuid: user.userUuid,
                                drafts,
                                status: 'applied',
                                pullRequestUrl: url,
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
                };
            }
            const exploreCount = await this.commitDocuments(user, projectUuid, {
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
            });
            return { exploreCount, failures: [], pullRequestUrl: null };
        });
    }

    /** Writes the documents and sets their explores live, removing the explores of deleted models by name since setExplores merges. */
    private async commitDocuments(
        user: SessionUser,
        projectUuid: string,
        {
            stored,
            writes,
            explores,
            source,
        }: {
            stored: ProjectModelDocument[];
            /** Null content deletes the model. */
            writes: Map<string, string | null>;
            explores: (Explore | ExploreError)[];
            source: ChangeSetSource;
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
                    projectUuid,
                    userUuid: user.userUuid,
                    source,
                    readVersions: new Map(
                        stored.map(({ name, version }) => [name, version]),
                    ),
                    documents: [...writes].map(([name, content]) => ({
                        name,
                        content,
                    })),
                },
                async () => {
                    const { exploreCount } =
                        explores.length > 0
                            ? await this.projectService.setExplores(
                                  user,
                                  projectUuid,
                                  explores,
                              )
                            : { exploreCount: 0 };
                    // ponytail: neither write joins the commit's transaction; the removal goes last so a failed deploy removes nothing.
                    if (removed.length > 0) {
                        await this.projectModel.deleteCachedExplores(
                            projectUuid,
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
            projectUuid,
            user.userUuid,
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
                exploreCount: await this.commitDocuments(user, projectUuid, {
                    stored,
                    writes,
                    explores,
                    source: { kind: 'undo', reverts },
                }),
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

    /** A draft that went live finishes its workspace; one sent as a pull request waits on that. */
    private async recordDraftApplied(
        user: SessionUser,
        projectUuid: string,
        { pullRequestUrl, exploreCount }: SemanticLayerDraftApplyResult,
    ): Promise<void> {
        const owner = { projectUuid, userUuid: user.userUuid };
        try {
            if (pullRequestUrl) {
                await this.workspaceModel.attachPullRequest(
                    owner,
                    pullRequestUrl,
                );
            } else if (exploreCount !== null) {
                await this.workspaceModel.finish(owner, null);
            }
        } catch (error) {
            this.logger.warn(
                `Could not update the Studio workspace after a publish on project ${projectUuid}: ${getErrorMessage(error)}`,
            );
        }
    }

    private async assertCanViewProject(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.get(projectUuid);
        if (
            this.createAuditedAbility(user).cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private async assertCanUseStudio(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        if (!(await this.getStatus(user, projectUuid)).enabled) {
            throw new ForbiddenError(
                "You cannot change this project's models here",
            );
        }
    }

    /** Everyone's Studio work in this project: yours in flight, others' in flight, and yours finished lately. */
    async listWorkspaces(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SemanticStudioWorkspaces> {
        await this.assertCanViewProject(user, projectUuid);
        const all = await this.workspaceModel.findInProject(
            projectUuid,
            user.userUuid,
        );
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
                        workspace.isMine &&
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
        await this.assertCanViewProject(user, projectUuid);
        const workspace = await this.workspaceModel.find(
            workspaceUuid,
            user.userUuid,
        );
        if (!workspace || workspace.projectUuid !== projectUuid) {
            throw new NotFoundError('No such workspace');
        }
        return workspace;
    }

    /** Makes a conversation's workspace the active one, starting it the first time the conversation changes something. */
    async startWorkspace(
        user: SessionUser,
        projectUuid: string,
        { threadUuid, name }: SemanticStudioWorkspaceStartBody,
    ): Promise<SemanticStudioWorkspace> {
        await this.assertCanUseStudio(user, projectUuid);
        const owner = { projectUuid, userUuid: user.userUuid };
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
            name: name.trim().slice(0, 120) || 'Untitled change',
        });
        return this.getWorkspace(user, projectUuid, workspaceUuid);
    }

    private async getOwnWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<SemanticStudioWorkspace> {
        const workspace = await this.getWorkspace(
            user,
            projectUuid,
            workspaceUuid,
        );
        if (!workspace.isMine) {
            throw new ForbiddenError("This workspace is someone else's");
        }
        return workspace;
    }

    async activateWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
    ): Promise<SemanticStudioWorkspace> {
        await this.assertCanUseStudio(user, projectUuid);
        await this.getOwnWorkspace(user, projectUuid, workspaceUuid);
        await this.workspaceModel.activate(
            { projectUuid, userUuid: user.userUuid },
            workspaceUuid,
        );
        return this.getWorkspace(user, projectUuid, workspaceUuid);
    }

    /** Leaves the active workspace, so the next conversation starts a new one. */
    async leaveWorkspace(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        await this.assertCanViewProject(user, projectUuid);
        await this.workspaceModel.leave({
            projectUuid,
            userUuid: user.userUuid,
        });
    }

    async renameWorkspace(
        user: SessionUser,
        projectUuid: string,
        workspaceUuid: string,
        name: string,
    ): Promise<SemanticStudioWorkspace> {
        await this.getOwnWorkspace(user, projectUuid, workspaceUuid);
        const trimmed = name.trim().slice(0, 120);
        if (!trimmed) throw new ParameterError('A workspace needs a name');
        await this.workspaceModel.rename(
            { projectUuid, userUuid: user.userUuid },
            workspaceUuid,
            trimmed,
        );
        return this.getWorkspace(user, projectUuid, workspaceUuid);
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
    }

    /** Records a pull request's state as its provider reported it to someone allowed to ask. */
    async recordPullRequestState(
        projectUuid: string,
        prUrl: string,
        state: SemanticStudioWorkspacePullRequestState,
    ): Promise<void> {
        await this.workspaceModel.recordPullRequestState(
            projectUuid,
            prUrl,
            state,
        );
    }
}
