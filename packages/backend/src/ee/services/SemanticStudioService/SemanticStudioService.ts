import { subject } from '@casl/ability';
import {
    DbtProjectType,
    ExploreType,
    FeatureFlags,
    ForbiddenError,
    isChartValidationError,
    isDashboardValidationError,
    isExploreError,
    NotFoundError,
    ParameterError,
    ValidationTarget,
    type Explore,
    type ExploreError,
    type LightdashError,
    type Project,
    type SemanticLayerDraft,
    type SemanticLayerDraftApplyResult,
    type SemanticLayerDraftImpact,
    type SemanticLayerDraftItemResult,
    type SemanticLayerDraftModelInput,
    type SemanticLayerModelCode,
    type SemanticLayerStatus,
    type SessionUser,
} from '@lightdash/common';
import { createHash } from 'node:crypto';
import { type DraftImpactBreaks } from '../../../database/entities/projectModelDraftImpacts';
import { type FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { BaseService } from '../../../services/BaseService';
import { type ProjectService } from '../../../services/ProjectService/ProjectService';
import { type ValidationService } from '../../../services/ValidationService/ValidationService';
import {
    ModelDocumentsChangedError,
    type ChangeSetSource,
    type ProjectModelDocument,
    type ProjectModelDocumentModel,
    type StoredDraftChange,
} from '../../models/ProjectModelDocumentModel';
import {
    DraftChecker,
    usesAnyModel,
    type DraftCheckerProjectService,
} from './DraftChecker';
import { foldDraft, withWrites } from './draftFold';
import {
    describePullRequest,
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
        ) => Promise<{ type?: ExploreType }[]>;
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
    projectService: Pick<ProjectService, 'setExplores'> &
        DraftCheckerProjectService;
    repoModels: Pick<
        RepoModelSource,
        'isInstalled' | 'load' | 'openPullRequest'
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
export class SemanticStudioService extends BaseService {
    private readonly featureFlagModel: SemanticStudioServiceArguments['featureFlagModel'];

    private readonly projectModel: SemanticStudioServiceArguments['projectModel'];

    private readonly projectModelDocumentModel: SemanticStudioServiceArguments['projectModelDocumentModel'];

    private readonly projectService: SemanticStudioServiceArguments['projectService'];

    private readonly validationService: SemanticStudioServiceArguments['validationService'];

    private readonly schedulerClient: SemanticStudioServiceArguments['schedulerClient'];

    private readonly repoModels: SemanticStudioServiceArguments['repoModels'];

    private readonly checker: DraftChecker;

    constructor(args: SemanticStudioServiceArguments) {
        super();
        this.featureFlagModel = args.featureFlagModel;
        this.projectModel = args.projectModel;
        this.projectModelDocumentModel = args.projectModelDocumentModel;
        this.projectService = args.projectService;
        this.validationService = args.validationService;
        this.schedulerClient = args.schedulerClient;
        this.repoModels = args.repoModels;
        this.checker = new DraftChecker(args.projectService);
    }

    /** Why this person cannot change this project's models here, or null when they can. */
    private async findBlocker(
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
        if (!enabled) {
            return new ForbiddenError('This feature is not enabled');
        }
        if (project.dbtConnection.type === DbtProjectType.NONE) return null;
        if (!resolveRepoConnection(project.dbtConnection)) {
            return new ParameterError(
                'Models can be changed here for a project without a dbt connection, or one that keeps its models in GitHub',
            );
        }
        // Applying sends a commit to the repository, so it needs what any write to it needs.
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                    isProtectedBranch: false,
                }),
            )
        ) {
            return new ForbiddenError(
                "User does not have permission to change this project's repository",
            );
        }
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
        return {
            enabled: (await this.findBlocker(user, project)) === null,
            appliesAs: resolveRepoConnection(project.dbtConnection)
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
    async getModel(
        user: SessionUser,
        projectUuid: string,
        name: string,
    ): Promise<SemanticLayerModelCode | null> {
        if (!(await this.canEditModels(user, projectUuid))) return null;
        const { stored, repo } = await this.loadStored(projectUuid);
        const document = stored.find((doc) => doc.name === name);
        if (!document) return null;
        return {
            ...document,
            // A repository keeps its own history.
            history: repo
                ? []
                : await this.projectModelDocumentModel.findModelHistory(
                      projectUuid,
                      name,
                  ),
        };
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
        if (draft.changes.length === 0) return { ...EMPTY_DRAFT, settled };
        const { explores } = await this.checker.compile(
            projectUuid,
            withWrites(draft.live, draft.writes),
        );
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
            models: [...draft.writes].map(([model, contentAfter]) => {
                const explore = explores.find(({ name }) => name === model);
                return {
                    model,
                    contentBefore: draft.live.get(model) ?? null,
                    contentAfter,
                    explore:
                        explore && !isExploreError(explore) ? explore : null,
                };
            }),
            errors: explores.filter(isExploreError).map(({ name, errors }) => ({
                model: name,
                message: errors.map(({ message }) => message).join('; '),
            })),
            settled,
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

    /** Takes this person's draft live as one change set, or one model of it; nothing goes live when any part fails its checks. */
    async applyDraft(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
    ): Promise<SemanticLayerDraftApplyResult> {
        await this.assertCanEditModels(user, projectUuid);
        const result = await this.applyDraftOnce(user, projectUuid, model);
        // What is left of the draft now sits on different live models.
        await this.queueDraftImpactCheckAfterChange(user, projectUuid);
        return result;
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
                await this.projectModelDocumentModel.updateDraftChangeStatus({
                    projectUuid,
                    userUuid: user.userUuid,
                    drafts,
                    status: 'applied',
                    pullRequestUrl: url,
                });
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
}
