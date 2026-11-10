import { subject } from '@casl/ability';
import {
    DbtProjectType,
    ExploreType,
    FeatureFlags,
    ForbiddenError,
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
    type SessionUser,
} from '@lightdash/common';
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

/** The parts of a project that decide whether its models are kept here. */
type ModelProject = Pick<
    Project,
    | 'projectUuid'
    | 'organizationUuid'
    | 'upstreamProjectUuid'
    | 'type'
    | 'createdByUserUuid'
> & { dbtConnection: Pick<Project['dbtConnection'], 'type'> };

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
    >;
    validationService: Pick<ValidationService, 'generateValidation'>;
    projectService: Pick<ProjectService, 'setExplores'> &
        DraftCheckerProjectService;
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

    private readonly checker: DraftChecker;

    constructor(args: SemanticStudioServiceArguments) {
        super();
        this.featureFlagModel = args.featureFlagModel;
        this.projectModel = args.projectModel;
        this.projectModelDocumentModel = args.projectModelDocumentModel;
        this.projectService = args.projectService;
        this.validationService = args.validationService;
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
        if (project.dbtConnection.type !== DbtProjectType.NONE) {
            return new ParameterError(
                'Only a project without a dbt connection keeps its models on the server',
            );
        }
        return null;
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
        stored: ProjectModelDocument[],
    ): Promise<void> {
        if (stored.length > 0) return;
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
        const [stored, drafted] = await Promise.all([
            this.projectModelDocumentModel.findDocuments(projectUuid),
            this.projectModelDocumentModel.findDraftChanges(
                projectUuid,
                userUuid,
            ),
        ]);
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
        const documents =
            await this.projectModelDocumentModel.findDocuments(projectUuid);
        const document = documents.find((doc) => doc.name === name);
        if (!document) return null;
        return {
            ...document,
            history: await this.projectModelDocumentModel.findModelHistory(
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
        await this.assertNoModelsFromElsewhere(projectUuid, draft.stored);
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
            const error = check.rejected.get(result.model);
            return result.status === 'ready' && error !== undefined
                ? failed(result, error)
                : result;
        });
        const passing = models.filter(
            (_model, index) => results[index].status === 'ready',
        );
        if (passing.length === 0) {
            return { results, diffs: [], draftChangeUuid: null };
        }
        const before = withWrites(draft.live, draft.writes);
        return {
            results,
            diffs: [...new Set(passing.map(({ name }) => name))].map(
                (model) => ({
                    model,
                    contentBefore: before.get(model) ?? null,
                    contentAfter: check.writes.get(model) ?? null,
                }),
            ),
            draftChangeUuid:
                await this.projectModelDocumentModel.createDraftChange({
                    projectUuid,
                    userUuid: user.userUuid,
                    promptUuid,
                    models: passing,
                }),
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

    /** Saved content that works on what is live and would stop working with this person's draft, or one model of it. */
    async getDraftImpact(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
    ): Promise<SemanticLayerDraftImpact> {
        const project = await this.projectModel.get(projectUuid);
        const canValidate = this.createAuditedAbility(user).can(
            'manage',
            subject('Validation', {
                organizationUuid: project.organizationUuid,
                projectUuid,
            }),
        );
        if (!canValidate || (await this.findBlocker(user, project))) {
            return { breaks: [] };
        }
        const { live, writes } = await this.loadDraft(
            projectUuid,
            user.userUuid,
            model,
        );
        // Saved content cannot depend on a model that is not live yet.
        if ([...writes.keys()].every((name) => !live.has(name))) {
            return { breaks: [] };
        }
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
        if (drafted.length === 0) return { breaks: [] };
        // Only now is what is broken already worth working out.
        const brokenAlready = new Set(
            (await validate(before.explores)).map(
                ({ name, error }) => `${name}|${error}`,
            ),
        );
        return {
            breaks: drafted.flatMap(({ name, error }) =>
                name !== undefined && !brokenAlready.has(`${name}|${error}`)
                    ? [{ name, error }]
                    : [],
            ),
        };
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
            });
        if (discarded === 0 && target.kind !== 'all') {
            throw new NotFoundError('Nothing in the draft matches');
        }
    }

    /** Takes this person's draft live as one change set, or one model of it; nothing goes live when any part fails its checks. */
    async applyDraft(
        user: SessionUser,
        projectUuid: string,
        model: string | null,
    ): Promise<SemanticLayerDraftApplyResult> {
        await this.assertCanEditModels(user, projectUuid);
        return this.retryOnConflict(projectUuid, async () => {
            const draft = await this.loadDraft(
                projectUuid,
                user.userUuid,
                model,
            );
            if (model !== null && draft.changes.length === 0) {
                throw new NotFoundError('Model not found');
            }
            await this.assertNoModelsFromElsewhere(projectUuid, draft.stored);
            const unmergeable = draft.results
                .flat()
                .flatMap(({ model: name, error }) =>
                    error === null ? [] : [{ model: name, error }],
                );
            if (unmergeable.length > 0) {
                return { exploreCount: null, failures: unmergeable };
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
                });
                return { exploreCount: null, failures: [] };
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
            return { exploreCount, failures: [] };
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
        const stored =
            await this.projectModelDocumentModel.findDocuments(projectUuid);
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
