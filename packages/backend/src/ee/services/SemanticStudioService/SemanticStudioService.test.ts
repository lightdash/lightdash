import { Ability } from '@casl/ability';
import {
    DBFieldTypes,
    DbtProjectType,
    DimensionType,
    ExploreType,
    FieldImpactSeverity,
    ForbiddenError,
    isExploreError,
    JobStatusType,
    MetricType,
    NotFoundError,
    ParameterError,
    ProjectType,
    ValidationErrorType,
    ValidationSourceType,
    WarehouseTypes,
    type CompileSemanticStudioBranchPayload,
    type CreateValidation,
    type Explore,
    type ExploreError,
    type LightdashModelFragment,
    type PossibleAbilities,
    type Project,
    type SemanticLayerModelChange,
    type SemanticStudioWorkspace,
    type SemanticStudioWorkspacePullRequestState,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { stringify } from 'yaml';
import { user } from '../../../services/ProjectService/ProjectService.mock';
import { type DbSemanticStudioBranchCompile } from '../../database/entities/semanticStudioBranchCompiles';
import {
    ModelDocumentsChangedError,
    type ChangeSet,
    type DraftImpactCheck,
    type ProjectModelDocumentModel,
    type StoredDraftChange,
} from '../../models/ProjectModelDocumentModel';
import {
    isSourcePath,
    SemanticStudioService,
    type SemanticStudioServiceArguments,
} from './SemanticStudioService';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const USER_UUID = '00000000-0000-0000-0000-000000000003';

const orders = `type: model
name: orders
sql_from: public.orders
dimensions:
  - name: amount
    type: number
    sql: \${TABLE}.amount
  - name: customer_id
    type: number
    sql: \${TABLE}.customer_id
`;

const customers: LightdashModelFragment = {
    name: 'customers',
    sql_from: 'public.customers',
    dimensions: [
        { name: 'id', type: DimensionType.NUMBER, sql: '${TABLE}.id' },
    ],
};

const draftModel = (
    yaml: string | null,
    { remove = [], removeModel = false, name = 'orders' } = {} as {
        remove?: string[];
        removeModel?: boolean;
        name?: string;
    },
) => ({ name, yaml, remove, removeModel });

const REVENUE_YAML = `dimensions:
  - name: amount
    metrics:
      revenue:
        type: sum
`;

const withAbility = (
    rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0],
): SessionUser => ({
    ...user,
    userUuid: USER_UUID,
    ability: new Ability<PossibleAbilities>(rules),
});

const deployer = withAbility([
    { subject: 'DeployProject', action: 'manage' },
    { subject: 'Project', action: 'view' },
]);
const viewer = withAbility([]);
const repoWriter = withAbility([
    { subject: 'DeployProject', action: 'manage' },
    { subject: 'Project', action: 'view' },
    { subject: 'SourceCode', action: 'manage' },
]);
const PREVIEW_UUID = 'preview-project';
const PULL_REQUEST_URL = 'https://github.example/acme/analytics/pull/1';
const GITHUB_REPO = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'installation_id',
    repository: 'acme/analytics',
    branch: 'main',
    project_sub_path: '/',
} as const;
const DBT_IN_GITHUB: Project['dbtConnection'] = GITHUB_REPO;
const MODELS_IN_GITHUB: Project['dbtConnection'] = {
    ...GITHUB_REPO,
    semanticLayer: 'lightdash',
};
const validationError = (name: string, error: string): CreateValidation => ({
    name,
    error,
    errorType: ValidationErrorType.Metric,
    projectUuid: PROJECT_UUID,
    chartUuid: undefined,
    fieldName: undefined,
    source: ValidationSourceType.Chart,
    chartName: name,
});
const validator = withAbility([
    { subject: 'DeployProject', action: 'manage' },
    { subject: 'Project', action: 'view' },
    { subject: 'Validation', action: 'manage' },
]);

const TRY_OUT_EXPLORE: ExploreError = {
    name: 'try_out',
    label: 'Try out',
    errors: [],
};

const BRANCH_EXPLORE: ExploreError = {
    name: 'branch_compiled',
    label: 'Branch compiled',
    errors: [],
};

const setup = ({
    stored = [{ name: 'orders', content: orders }],
    otherDrafters = [],
    baseContents = [],
    usedFields = [],
    previewOf = PROJECT_UUID,
    previewExplores = {},
    previewCompile = null,
    publishedSince = new Map(),
    enabled = true,
    dbtConnection = { type: DbtProjectType.NONE },
    appInstalled = true,
    exploreTypes = [],
    rejectSql = null,
    rejectMetric = null,
    duplicated = [],
    changeSets = [],
    staleCommits = 0,
    validationFor = () => [],
}: {
    stored?: { name: string; content: string; version?: number }[];
    otherDrafters?: {
        name: string;
        models: string[];
        changes: ReturnType<typeof draftModel>[][];
    }[];
    baseContents?: [string, string | null][];
    /** Field ids a saved chart reads. */
    usedFields?: string[];
    /** The project the preview project was built from. */
    previewOf?: string;
    previewExplores?: Record<string, Explore | ExploreError>;
    previewCompile?: JobStatusType | null;
    publishedSince?: Map<
        string,
        { by: string | null; at: Date; isYours: boolean }
    >;
    enabled?: boolean;
    /** A repository connection makes `stored` the models in that repository. */
    dbtConnection?: Project['dbtConnection'];
    appInstalled?: boolean;
    exploreTypes?: ExploreType[];
    rejectSql?: string | null;
    rejectMetric?: string | null;
    duplicated?: string[];
    changeSets?: ChangeSet[];
    /** How many commits find the documents changed before one succeeds. */
    staleCommits?: number;
    /** What saved content fails against these explores. */
    validationFor?: (
        explores: (Explore | ExploreError)[],
    ) => CreateValidation[];
} = {}) => {
    const upsert = vi.fn(
        (
            _projectUuid: string,
            _documents: { name: string; content: string | null }[],
            _userUuid: string,
        ) => undefined,
    );
    let stale = staleCommits;
    const commitCalls: Parameters<
        ProjectModelDocumentModel['createChangeSet']
    >[0][] = [];
    const commit = async <T>(
        args: Parameters<ProjectModelDocumentModel['createChangeSet']>[0],
        deploy: () => Promise<T>,
    ) => {
        commitCalls.push(args);
        if (stale > 0) {
            stale -= 1;
            throw new ModelDocumentsChangedError();
        }
        upsert(args.projectUuid, args.documents, args.userUuid);
        return { changeSetUuid: 'change-set', deployed: await deploy() };
    };
    const compileQuery = vi.fn(
        async ({
            body,
        }: {
            body: { metrics: string[]; dimensions: string[] };
        }) => {
            if (rejectMetric && body.metrics.includes(rejectMetric))
                throw new Error(
                    `Tried to reference a dimension from a metric on a table that is aggregated separately (${body.dimensions.join(', ')})`,
                );
            return { query: 'compiled metric query', compilationErrors: [] };
        },
    );
    const runSqlQuery = vi.fn(
        async (_user: SessionUser, _projectUuid: string, sql: string) => {
            if (rejectSql && sql.includes(rejectSql))
                throw new Error(`relation "${rejectSql}" does not exist`);
            if (sql.includes('duplicate_keys'))
                return {
                    fields: {},
                    rows: [
                        {
                            duplicate_keys: duplicated.some((column) =>
                                sql.includes(column),
                            )
                                ? 2
                                : 0,
                        },
                    ],
                };
            return { fields: {}, rows: [] };
        },
    );
    const setExplores = vi.fn(
        async (
            _user: SessionUser,
            _projectUuid: string,
            explores: (Explore | ExploreError)[],
        ) => ({
            exploreCount: explores.length,
            warnings: {
                warningCount: 0,
                warningExploreCount: 0,
                exploresWithWarnings: [],
            },
        }),
    );
    const findModelHistory = vi.fn(
        async (): Promise<Omit<SemanticLayerModelChange, 'replaced'>[]> => [],
    );
    const deleteCachedExplores = vi.fn(
        async (_projectUuid: string, _names: string[]) => undefined,
    );
    const drafts: StoredDraftChange[] = [];
    const requestedBases: [string, number][] = [];
    const settled: ('applied' | 'discarded')[] = [];
    const generateValidation = vi.fn(
        async (
            _projectUuid: string,
            explores: (Explore | ExploreError)[] | undefined,
            _targets?: unknown,
            _onlyExploresInArgs?: boolean,
            _chartExploreNames?: string[],
        ) => validationFor(explores ?? []),
    );
    let impactCheck: DraftImpactCheck | null = null;
    const recordedPullRequests: string[] = [];
    const analyzeFieldImpact = vi.fn(
        async (projectUuid: string, fieldId: string) => ({
            projectUuid,
            fieldId,
            fieldType: null,
            severity: FieldImpactSeverity.Safe,
            summary: {
                charts: usedFields.includes(fieldId) ? 1 : 0,
                dashboards: 0,
                dashboardFilterTargets: 0,
                metricTreeDependents: 0,
                scheduledDeliveries: 0,
            },
            charts: usedFields.includes(fieldId)
                ? [
                      {
                          uuid: 'chart-1',
                          name: 'Saved chart',
                          fieldType: DBFieldTypes.METRIC,
                          viewsCount: 0,
                          spaceUuid: 'space',
                          spaceName: 'Space',
                          dashboardUuid: null,
                          dashboardName: null,
                      },
                  ]
                : [],
            dashboards: [],
            dashboardFilterTargets: [],
            metricTreeDependents: [],
            scheduledDeliveries: [],
        }),
    );
    const openPullRequest = vi.fn(
        async (_args: {
            writes: Map<string, string | null>;
            title: string;
            body: string;
        }) => ({ url: PULL_REQUEST_URL }),
    );
    const queueImpactCheck = vi.fn(async () => undefined);
    const createPreviewForPullRequest = vi.fn(async () => null);
    const compileExploresFromManifest = vi.fn(
        async (): Promise<(Explore | ExploreError)[]> => [TRY_OUT_EXPLORE],
    );
    const files = new Map<string, string>();
    const branchCompiles = new Map<string, DbSemanticStudioBranchCompile>();
    let compileRequests = 0;
    const queueBranchCompile = vi.fn(
        async (_payload: CompileSemanticStudioBranchPayload) => undefined,
    );
    const compileExploresFromBranch = vi.fn(
        async (): Promise<(Explore | ExploreError)[]> => [BRANCH_EXPLORE],
    );
    const findPullRequestBranch = vi.fn(async () => 'studio-branch');
    const mergePullRequest = vi.fn(async () => ({
        merged: true,
        sha: 'merge-sha',
        compileJobUuid: 'job-1',
    }));
    let activeWorkspace: { threadUuid: string; prUrl: string | null } | null =
        null;
    const unused = async (): Promise<never> => {
        throw new Error('not used in these tests');
    };
    const studioThreads = new Set<string>();
    /** The workspace each draft change was made in; a change missing here is from before workspaces. */
    const draftWorkspaces = new Map<string, string | null>();
    const workspaceOf = (threadUuid: string) => `workspace-${threadUuid}`;
    const startWorkspace = vi.fn(
        async (_owner: unknown, thread: { threadUuid: string }) => {
            activeWorkspace = { threadUuid: thread.threadUuid, prUrl: null };
            return workspaceOf(thread.threadUuid);
        },
    );
    const finishWorkspace = vi.fn(
        async (_owner: unknown, _workspaceUuid: string | null) => 1,
    );
    const findActive = async () =>
        activeWorkspace && {
            workspaceUuid: workspaceOf(activeWorkspace.threadUuid),
            projectUuid: PROJECT_UUID,
            name: 'A change',
            threadUuid: activeWorkspace.threadUuid,
            agentUuid: null,
            owner: { userUuid: USER_UUID, name: 'Someone' },
            isMine: true,
            isActive: true,
            pullRequest: activeWorkspace.prUrl
                ? { url: activeWorkspace.prUrl, state: null }
                : null,
            createdAt: new Date(),
            updatedAt: new Date(),
            finishedAt: null,
        };
    const workspaces: SemanticStudioWorkspace[] = [];
    const getPullRequestState = vi.fn(
        async (): Promise<SemanticStudioWorkspacePullRequestState | null> =>
            null,
    );
    const recordPullRequestState = vi.fn(
        async (
            _projectUuid: string,
            url: string,
            state: SemanticStudioWorkspacePullRequestState,
        ) => {
            for (const workspace of workspaces) {
                if (workspace.pullRequest?.url === url) {
                    workspace.pullRequest.state = state;
                    workspace.finishedAt = new Date();
                    workspace.isActive = false;
                }
            }
        },
    );
    const args: SemanticStudioServiceArguments = {
        aiWritebackService: {
            openStudioCheckout: unused,
            saveWithScript: unused,
            findPullRequestBranch,
            mergePullRequest,
        },
        workspaceModel: {
            listChanges: async () => [],
            create: unused,
            findActive,
            findStudioThread: async (_owner, threadUuid) =>
                studioThreads.has(threadUuid)
                    ? {
                          organizationUuid: ORGANIZATION_UUID,
                          agentUuid: null,
                          title: null,
                      }
                    : null,
            findInProject: async () => {
                const workspace = await findActive();
                return [...workspaces, ...(workspace ? [workspace] : [])];
            },
            find: async (workspaceUuid, userUuid) =>
                workspaceUuid.startsWith('workspace-')
                    ? {
                          workspaceUuid,
                          projectUuid: PROJECT_UUID,
                          name: 'A change',
                          threadUuid: workspaceUuid.slice('workspace-'.length),
                          agentUuid: null,
                          owner: { userUuid: USER_UUID, name: 'Someone' },
                          isMine: userUuid === USER_UUID,
                          isActive: false,
                          pullRequest:
                              activeWorkspace?.prUrl &&
                              workspaceOf(activeWorkspace.threadUuid) ===
                                  workspaceUuid
                                  ? { url: activeWorkspace.prUrl, state: null }
                                  : null,
                          createdAt: new Date(),
                          updatedAt: new Date(),
                          finishedAt: null,
                      }
                    : null,
            start: startWorkspace,
            activate: unused,
            leave: unused,
            rename: unused,
            finish: finishWorkspace,
            attachPullRequest: async () => undefined,
            attachThreadPullRequest: async () => undefined,
            recordPullRequestState,
            requestBranchCompile: async (workspaceUuid) => {
                compileRequests += 1;
                const compileRequestUuid = `request-${compileRequests}`;
                const previous = branchCompiles.get(workspaceUuid);
                branchCompiles.set(workspaceUuid, {
                    semantic_studio_workspace_uuid: workspaceUuid,
                    compile_request_uuid: compileRequestUuid,
                    status: 'compiling',
                    branch: previous?.branch ?? null,
                    error: null,
                    explores: previous?.explores ?? null,
                    requested_at: new Date(),
                    compiled_at: previous?.compiled_at ?? null,
                });
                return compileRequestUuid;
            },
            finishBranchCompile: async (
                workspaceUuid,
                compileRequestUuid,
                outcome,
            ) => {
                const row = branchCompiles.get(workspaceUuid);
                if (row?.compile_request_uuid !== compileRequestUuid)
                    return false;
                branchCompiles.set(
                    workspaceUuid,
                    outcome.status === 'ready'
                        ? {
                              ...row,
                              ...outcome,
                              error: null,
                              compiled_at: new Date(),
                          }
                        : { ...row, ...outcome },
                );
                return true;
            },
            findBranchCompile: async (workspaceUuid) =>
                branchCompiles.get(workspaceUuid) ?? null,
            deleteFinishedBranchCompiles: async () => undefined,
        },
        featureFlagModel: {
            get: async () => ({ id: 'semantic-studio-editing', enabled }),
        },
        projectModel: {
            get: async (projectUuid) =>
                projectUuid === PREVIEW_UUID
                    ? {
                          projectUuid: PREVIEW_UUID,
                          organizationUuid: ORGANIZATION_UUID,
                          upstreamProjectUuid: previewOf,
                          type: ProjectType.PREVIEW,
                          createdByUserUuid: USER_UUID,
                          dbtConnection,
                      }
                    : {
                          projectUuid: PROJECT_UUID,
                          organizationUuid: ORGANIZATION_UUID,
                          upstreamProjectUuid: undefined,
                          type: ProjectType.DEFAULT,
                          createdByUserUuid: USER_UUID,
                          dbtConnection,
                      },
            getAllExploreSummaries: async () =>
                exploreTypes.map((type, index) => ({
                    name: `explore_${index}`,
                    type,
                })),
            findExploresFromCache: async () => previewExplores,
            deleteCachedExplores,
        },
        projectModelDocumentModel: {
            findDocuments: async () =>
                stored.map((doc) => ({ version: 1, ...doc })),
            findDocumentsAt: async (_projectUuid, versions) => {
                requestedBases.push(...versions);
                return new Map(baseContents);
            },
            rebaseDraftChanges: async (_owner, model, version) => {
                // Live is always at version 1 here.
                if (version !== 1) return false;
                drafts.forEach((change, index) => {
                    drafts[index] = {
                        ...change,
                        baseVersions: {
                            ...change.baseVersions,
                            [model]: version,
                        },
                    };
                });
                return true;
            },
            createChangeSet: commit,
            findChangeSets: async (_projectUuid, uuids) =>
                changeSets.filter(({ changeSetUuid }) =>
                    uuids.includes(changeSetUuid),
                ),
            findModelHistory,
            findDraftChanges: async ({ workspaceUuid }) =>
                drafts.filter((change) => {
                    const madeIn =
                        draftWorkspaces.get(change.draftChangeUuid) ?? null;
                    return madeIn === workspaceUuid;
                }),
            findWorkspaceDraftChanges: async ({ workspaceUuid }) =>
                drafts.filter(
                    (change) =>
                        draftWorkspaces.get(change.draftChangeUuid) ===
                        workspaceUuid,
                ),
            findOtherDrafters: async () => otherDrafters,
            withPublishLock: async (_owner, publish) => publish(),
            findDraftState: async () => ({ versions: [], changes: [] }),
            swapDraftChanges: async (_owner, [first, second]) => {
                const a = drafts.findIndex(
                    (change) => change.draftChangeUuid === first,
                );
                const b = drafts.findIndex(
                    (change) => change.draftChangeUuid === second,
                );
                [drafts[a], drafts[b]] = [drafts[b], drafts[a]];
            },
            findPublishedSince: async () => publishedSince,
            findSettledDraftChanges: async () => [],
            createCheckedOutDraftChange: async ({
                workspaceUuid,
                promptUuid,
                changeName,
                models,
                baseVersions,
            }) => {
                const draftChangeUuid = `draft-${drafts.length + 1}`;
                const started = !activeWorkspace;
                if (!activeWorkspace)
                    activeWorkspace = { threadUuid: 'first', prUrl: null };
                draftWorkspaces.set(
                    draftChangeUuid,
                    workspaceUuid ?? workspaceOf(activeWorkspace.threadUuid),
                );
                drafts.push({
                    draftChangeUuid,
                    promptUuid,
                    question: null,
                    createdAt: new Date(),
                    models,
                    baseVersions,
                });
                const checkedOut =
                    workspaceUuid ?? workspaceOf(activeWorkspace.threadUuid);
                return {
                    draftChangeUuid,
                    workspaceUuid: checkedOut,
                    startedChange: started
                        ? { workspaceUuid: checkedOut, name: changeName }
                        : null,
                };
            },
            updateDraftChangeStatus: async ({
                drafts: selection,
                status,
                pullRequestUrl,
            }) => {
                if (pullRequestUrl) recordedPullRequests.push(pullRequestUrl);
                const holds = (change: StoredDraftChange) =>
                    selection.changeUuids.includes(change.draftChangeUuid) &&
                    (selection.model === null ||
                        change.models.some(
                            ({ name }) => name === selection.model,
                        ));
                const settling = drafts.filter(holds);
                const kept = drafts.flatMap((change) => {
                    if (!holds(change)) return [change];
                    const rest = change.models.filter(
                        ({ name }) =>
                            selection.model !== null &&
                            name !== selection.model,
                    );
                    return rest.length > 0 ? [{ ...change, models: rest }] : [];
                });
                drafts.splice(0, drafts.length, ...kept);
                settled.push(...settling.map(() => status));
                return settling.length;
            },
            findDraftImpactCheck: async () => impactCheck,
            startDraftImpactCheck: async ({ draftHash }) => {
                impactCheck = {
                    draftHash,
                    status: 'checking',
                    breaks: null,
                    startedAt: new Date(),
                };
            },
            finishDraftImpactCheck: async ({ draftHash, outcome }) => {
                if (impactCheck?.draftHash !== draftHash) return;
                impactCheck = {
                    ...impactCheck,
                    status: outcome.status,
                    breaks: outcome.status === 'done' ? outcome.breaks : null,
                };
            },
        },
        schedulerClient: {
            checkSemanticLayerDraftImpact: queueImpactCheck,
            compileSemanticStudioBranch: queueBranchCompile,
        },
        validationService: { generateValidation },
        savedChartModel: { analyzeFieldImpact },
        repoModels: {
            getPullRequestState,
            isInstalled: async () => appInstalled,
            load: async (_organizationUuid, connection) => ({
                connection,
                baseSha: 'base-sha',
                documents: stored,
                paths: new Map(
                    stored.map(({ name }) => [name, `models/${name}.yml`]),
                ),
                modelsDirectory: 'models',
            }),
            openPullRequest,
        },
        projectService: {
            getWarehouseSqlBuilderSettings: async () => ({
                type: WarehouseTypes.POSTGRES,
                startOfWeek: null,
                columnTimezone: 'UTC',
                dataTimezone: null,
            }),
            getWarehouseTables: async () => ({}),
            describeWarehouseTable: async () => {
                throw new Error('no catalog in these tests');
            },
            compileQuery,
            runSqlQuery,
            setExplores,
            compileExploresFromManifest,
            compileExploresFromBranch,
        },
        jobModel: { findLatestCompileStatus: async () => previewCompile },
        writebackPreviewService: { createPreviewForPullRequest },
        fileStorageClient: {
            isEnabled: () => true,
            uploadTxt: async (txt, id) => {
                files.set(`${id}.txt`, txt.toString());
                return `${id}.txt`;
            },
            getFileStream: async (fileId) => {
                const file = files.get(fileId);
                if (file === undefined) throw new NotFoundError('No file');
                return {
                    stream: Readable.from([file]),
                    contentDisposition: null,
                };
            },
            deleteFile: async (fileId) => {
                files.delete(fileId);
            },
        },
    };
    const service = new SemanticStudioService(args);
    return {
        service,
        workspaces,
        getPullRequestState,
        recordPullRequestState,
        aiWritebackService: args.aiWritebackService,
        workspaceModel: args.workspaceModel,
        setActiveWorkspace: (next: typeof activeWorkspace) => {
            activeWorkspace = next;
        },
        studioThreads,
        draftWorkspaces,
        startWorkspace,
        finishWorkspace,
        workspaceOf,
        compileExploresFromManifest,
        compileExploresFromBranch,
        findPullRequestBranch,
        mergePullRequest,
        queueBranchCompile,
        branchCompiles,
        upsert,
        openPullRequest,
        recordedPullRequests,
        commitCalls,
        setExplores,
        runSqlQuery,
        compileQuery,
        deleteCachedExplores,
        findModelHistory,
        drafts,
        requestedBases,
        settled,
        generateValidation,
        queueImpactCheck,
        /** Stands in for the worker picking the queued check up. */
        runImpactCheck: () =>
            service.checkDraftImpact({
                projectUuid: PROJECT_UUID,
                userUuid: USER_UUID,
            }),
    };
};

const toDraftModel = ({ name, ...fragment }: LightdashModelFragment) =>
    draftModel(stringify(fragment), { name });

/** Drafts the fragments, then applies whatever passed. */
const draftAndApply = async (
    context: ReturnType<typeof setup>,
    fragments: LightdashModelFragment[],
) => {
    const { results } = await context.service.proposeDraftChange(
        deployer,
        PROJECT_UUID,
        fragments.map(toDraftModel),
        null,
        null,
    );
    const { exploreCount } = await context.service.applyDraft(
        deployer,
        PROJECT_UUID,
        null,
    );
    return { results, exploreCount };
};

describe('SemanticStudioService', () => {
    describe('proposing a change to the draft', () => {
        it('adds what passes to the draft and writes nothing live', async () => {
            const context = setup();
            const proposal = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                { promptUuid: 'prompt-1', threadUuid: 'thread-1' },
                null,
            );
            expect(proposal.results[0].status).toBe('ready');
            expect(proposal.draftChangeUuid).toBe('draft-1');
            expect(proposal.diffs[0].contentBefore).toBe(orders);
            expect(proposal.diffs[0].contentAfter).toContain('revenue');
            expect(context.drafts[0].promptUuid).toBe('prompt-1');
            expect(context.upsert).not.toHaveBeenCalled();
        });

        it('names the draft an edit on Published starts, and only that one', async () => {
            const context = setup();
            const first = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                '  Orders revenue  ',
            );
            expect(first.startedChange).toEqual({
                workspaceUuid: 'workspace-first',
                name: 'Orders revenue',
            });
            const second = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel('label: Orders\n')],
                null,
                'Ignored',
            );
            expect(second.startedChange).toBeNull();
        });

        it('calls a draft started without a name Untitled', async () => {
            const { startedChange } = await setup().service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                ' ',
            );
            expect(startedChange?.name).toBe('Untitled');
        });

        it('builds on what is already in the draft', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            const second = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel('label: Orders\n')],
                null,
                null,
            );
            expect(second.results).toHaveLength(1);
            expect(second.diffs[0].contentBefore).toContain('revenue');
            expect(second.diffs[0].contentAfter).toContain('revenue');
            expect(second.diffs[0].contentAfter).toContain('label: Orders');
        });

        it('redefines the SQL of an existing field', async () => {
            const context = setup();
            const { results, diffs } = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [
                    draftModel(
                        'dimensions:\n  - name: amount\n    sql: ${TABLE}.amount_usd\n',
                    ),
                ],
                null,
                null,
            );
            expect(results[0].changes).toEqual([
                { path: 'dimensions.amount.sql', action: 'redefined' },
            ]);
            expect(diffs[0].contentAfter).toContain('amount_usd');
        });

        it('removes a field', async () => {
            const context = setup();
            const { results, diffs } = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(null, { remove: ['dimensions.customer_id'] })],
                null,
                null,
            );
            expect(results[0].changes).toEqual([
                { path: 'dimensions.customer_id', action: 'removed' },
            ]);
            expect(diffs[0].contentAfter).not.toContain('customer_id');
        });

        it('removes a whole model, and removed stays removed for later changes', async () => {
            const context = setup({
                stored: [
                    { name: 'orders', content: orders },
                    {
                        name: 'customers',
                        content:
                            'type: model\nname: customers\nsql_from: public.customers\ndimensions:\n  - name: id\n    type: number\n    sql: ${TABLE}.id\n',
                    },
                ],
            });
            const removal = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(null, { name: 'customers', removeModel: true })],
                null,
                null,
            );
            expect(removal.diffs[0].contentAfter).toBeNull();
            const read = await context.service.readDraftedModel(
                deployer,
                PROJECT_UUID,
                'customers',
            );
            expect(read).toMatchObject({ content: null, inDraft: true });
            expect(read.modelNames).toEqual(['orders']);
        });

        it('fails a removal that would break another model', async () => {
            const context = setup({
                stored: [
                    {
                        name: 'orders',
                        content: `${orders}joins:\n  - join: customers\n    sql_on: \${orders.customer_id} = \${customers.id}\n`,
                    },
                    {
                        name: 'customers',
                        content:
                            'type: model\nname: customers\nsql_from: public.customers\ndimensions:\n  - name: id\n    type: number\n    sql: ${TABLE}.id\n',
                    },
                ],
            });
            const { results, draftChangeUuid } =
                await context.service.proposeDraftChange(
                    deployer,
                    PROJECT_UUID,
                    [
                        draftModel(null, {
                            name: 'customers',
                            removeModel: true,
                        }),
                    ],
                    null,
                    null,
                );
            expect(results[0].status).toBe('failed');
            expect(results[0].error).toContain('This would break orders');
            expect(draftChangeUuid).toBeNull();
        });

        it('still refuses who can see a field', async () => {
            const context = setup();
            const { results, draftChangeUuid } =
                await context.service.proposeDraftChange(
                    deployer,
                    PROJECT_UUID,
                    [
                        draftModel(
                            'dimensions:\n  - name: amount\n    required_attributes:\n      team: sales\n',
                        ),
                    ],
                    null,
                    null,
                );
            expect(results[0].refusals[0].reason).toBe('access');
            expect(draftChangeUuid).toBeNull();
        });

        it('keeps a model the warehouse rejects out of the draft', async () => {
            const context = setup({ rejectSql: 'orders' });
            const { results, diffs, draftChangeUuid } =
                await context.service.proposeDraftChange(
                    deployer,
                    PROJECT_UUID,
                    [draftModel(REVENUE_YAML)],
                    null,
                    null,
                );
            expect(results[0].status).toBe('failed');
            expect(diffs).toEqual([]);
            expect(draftChangeUuid).toBeNull();
            expect(context.drafts).toEqual([]);
        });

        it('fails YAML that does not parse', async () => {
            const context = setup();
            const { results } = await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel('- not a mapping')],
                null,
                null,
            );
            expect(results[0].status).toBe('failed');
            expect(context.drafts).toEqual([]);
        });

        it('refuses someone who cannot deploy', async () => {
            await expect(
                setup().service.proposeDraftChange(
                    viewer,
                    PROJECT_UUID,
                    [draftModel(REVENUE_YAML)],
                    null,
                    null,
                ),
            ).rejects.toThrow();
        });
    });

    describe('reading the draft', () => {
        it('replays it on what is live, with the compiled explore', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            const draft = await context.service.getDraft(
                deployer,
                PROJECT_UUID,
            );
            expect(draft.changes[0].models[0].changes[0].action).toBe('added');
            expect(draft.models[0].contentBefore).toBe(orders);
            expect(draft.models[0].contentAfter).toContain('revenue');
            expect(
                draft.models[0].explore?.tables.orders.metrics.revenue,
            ).toBeDefined();
            expect(draft.errors).toEqual([]);
        });

        it('is empty for someone who cannot deploy', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            expect(
                (await context.service.getDraft(viewer, PROJECT_UUID)).changes,
            ).toEqual([]);
        });

        const ORDERS_BREAK = {
            name: 'Orders by customer',
            error: 'no field',
            chartUuid: 'chart-uuid',
            dashboardUuid: null,
        };
        const breaksWithoutCustomerId = (
            explores: (Explore | ExploreError)[],
        ) => [
            validationError('already broken', 'old'),
            ...(explores.some(
                (explore) =>
                    !isExploreError(explore) &&
                    explore.tables.orders &&
                    !explore.tables.orders.dimensions.customer_id,
            )
                ? [
                      {
                          ...validationError(
                              ORDERS_BREAK.name,
                              ORDERS_BREAK.error,
                          ),
                          chartUuid: ORDERS_BREAK.chartUuid,
                      },
                  ]
                : []),
        ];
        const dropCustomerId = draftModel(null, {
            remove: ['dimensions.customer_id'],
        });
        const impact = (
            context: ReturnType<typeof setup>,
            model: string | null,
        ) => context.service.getDraftImpact(validator, PROJECT_UUID, model);

        it('queues a check on every change to the draft and reports only what it newly breaks', async () => {
            const context = setup({ validationFor: breaksWithoutCustomerId });
            await context.service.proposeDraftChange(
                validator,
                PROJECT_UUID,
                [dropCustomerId],
                null,
                null,
            );
            expect(context.queueImpactCheck).toHaveBeenCalledTimes(1);
            expect(await impact(context, null)).toEqual({
                status: 'checking',
                breaks: [],
            });

            await context.runImpactCheck();
            expect(await impact(context, null)).toEqual({
                status: 'done',
                breaks: [ORDERS_BREAK],
            });
            expect(context.generateValidation.mock.calls[0][4]).toEqual([
                'orders',
            ]);

            await context.service.proposeDraftChange(
                validator,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            expect(context.queueImpactCheck).toHaveBeenCalledTimes(2);
            expect((await impact(context, null)).status).toBe('checking');
        });

        it('reads as unchecked when the draft changed without a check being queued', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            expect(context.queueImpactCheck).not.toHaveBeenCalled();
            expect((await impact(context, null)).status).toBe('unchecked');

            await context.service.requestDraftImpactCheck(
                validator,
                PROJECT_UUID,
            );
            await context.runImpactCheck();
            expect(await impact(context, null)).toEqual({
                status: 'done',
                breaks: [],
            });
            expect(context.generateValidation).toHaveBeenCalledTimes(1);
        });

        it('says what each model of the draft breaks alone, validating nothing for a new model', async () => {
            const context = setup({ validationFor: breaksWithoutCustomerId });
            await context.service.proposeDraftChange(
                validator,
                PROJECT_UUID,
                [dropCustomerId, toDraftModel(customers)],
                null,
                null,
            );
            await context.runImpactCheck();
            expect((await impact(context, 'orders')).breaks).toEqual([
                ORDERS_BREAK,
            ]);
            expect((await impact(context, 'customers')).breaks).toEqual([]);
            expect((await impact(context, null)).breaks).toEqual([
                ORDERS_BREAK,
            ]);
            // Orders alone and the whole draft, each on the draft and on what is live.
            expect(context.generateValidation).toHaveBeenCalledTimes(4);
        });

        it('reads as failed when the check could not finish', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                validator,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            context.generateValidation.mockRejectedValueOnce(
                new Error('validator down'),
            );
            await expect(context.runImpactCheck()).rejects.toThrow(
                'validator down',
            );
            expect((await impact(context, null)).status).toBe('failed');
        });

        it('checks no saved content for someone who cannot validate', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            expect(
                await context.service.getDraftImpact(
                    deployer,
                    PROJECT_UUID,
                    null,
                ),
            ).toEqual({ status: 'done', breaks: [] });
            await expect(
                context.service.requestDraftImpactCheck(deployer, PROJECT_UUID),
            ).rejects.toThrow(ForbiddenError);
            expect(context.queueImpactCheck).not.toHaveBeenCalled();
        });
    });

    describe('the development view of a draft', () => {
        it('compiles the drafted models for the person who drafted them', async () => {
            const context = setup();
            expect(
                await context.service.findDevelopmentExplores(
                    deployer,
                    PROJECT_UUID,
                ),
            ).toBeNull();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            const explores = await context.service.findDevelopmentExplores(
                deployer,
                PROJECT_UUID,
            );
            const drafted = explores?.get('orders');
            expect(
                drafted && !isExploreError(drafted)
                    ? Object.keys(drafted.tables.orders.metrics)
                    : [],
            ).toContain('revenue');
            expect(context.setExplores).not.toHaveBeenCalled();
        });

        it('marks a model the draft removes, and is nothing to someone who cannot change the project', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(null, { removeModel: true })],
                null,
                null,
            );
            expect(
                (
                    await context.service.findDevelopmentExplores(
                        deployer,
                        PROJECT_UUID,
                    )
                )?.get('orders'),
            ).toBeNull();
            expect(
                await context.service.findDevelopmentExplores(
                    viewer,
                    PROJECT_UUID,
                ),
            ).toBeNull();
        });
    });

    describe('the development view of a dbt project', () => {
        const branch: ExploreError = {
            name: 'payments',
            label: 'Payments',
            errors: [],
        };
        const dbt = (overrides: Parameters<typeof setup>[0] = {}) =>
            setup({
                dbtConnection: DBT_IN_GITHUB,
                exploreTypes: [ExploreType.DEFAULT, ExploreType.VIRTUAL],
                previewExplores: { payments: branch },
                ...overrides,
            });

        it("reads the explores of the pull request's preview, and hides what the branch removes", async () => {
            const explores = await dbt().service.findPreviewExplores(
                repoWriter,
                PROJECT_UUID,
                PREVIEW_UUID,
            );
            expect(explores?.get('payments')).toBe(branch);
            expect(explores?.get('explore_0')).toBeNull();
            expect(explores?.has('explore_1')).toBe(false);
        });

        it('does not hide live models while the preview holds only explores copied into it', async () => {
            const explores = await dbt({
                previewExplores: {
                    copied: { ...branch, type: ExploreType.VIRTUAL },
                },
            }).service.findPreviewExplores(
                repoWriter,
                PROJECT_UUID,
                PREVIEW_UUID,
            );
            expect(explores?.get('explore_0')).not.toBeNull();
        });

        it('is nothing for a preview of another project, a person who cannot write, or a project that keeps a draft', async () => {
            expect(
                await dbt({
                    previewOf: 'another-project',
                }).service.findPreviewExplores(
                    repoWriter,
                    PROJECT_UUID,
                    PREVIEW_UUID,
                ),
            ).toBeNull();
            expect(
                await dbt().service.findPreviewExplores(
                    deployer,
                    PROJECT_UUID,
                    PREVIEW_UUID,
                ),
            ).toBeNull();
            expect(
                await setup().service.findPreviewExplores(
                    deployer,
                    PROJECT_UUID,
                    PREVIEW_UUID,
                ),
            ).toBeNull();
        });
    });

    describe('trying a dbt change before its preview', () => {
        const project = {
            prUrl: 'https://github.com/acme/shop/pull/1',
            explores: [TRY_OUT_EXPLORE],
        };
        const dbt = (overrides: Parameters<typeof setup>[0] = {}) =>
            setup({ dbtConnection: DBT_IN_GITHUB, ...overrides });

        it('shows the person who made the change what it compiles to, and no one else', async () => {
            const context = dbt();
            expect(
                await context.service.findDevelopmentExplores(
                    repoWriter,
                    PROJECT_UUID,
                ),
            ).toBeNull();
            await context.service.saveDbtScriptTryOut(
                repoWriter,
                PROJECT_UUID,
                null,
                project,
            );
            expect(
                (
                    await context.service.findDevelopmentExplores(
                        repoWriter,
                        PROJECT_UUID,
                    )
                )?.get('try_out'),
            ).toEqual(TRY_OUT_EXPLORE);
            expect(
                await context.service.findDevelopmentExplores(
                    deployer,
                    PROJECT_UUID,
                ),
            ).toBeNull();
        });

        it('is forgotten once its own pull request closes, not another one', async () => {
            const context = dbt();
            await context.service.saveDbtScriptTryOut(
                repoWriter,
                PROJECT_UUID,
                null,
                project,
            );
            await context.service.retireDbtTryOut(
                repoWriter,
                PROJECT_UUID,
                'https://github.com/acme/shop/pull/2',
            );
            expect(
                await context.service.findDevelopmentExplores(
                    repoWriter,
                    PROJECT_UUID,
                ),
            ).not.toBeNull();
            await context.service.retireDbtTryOut(
                repoWriter,
                PROJECT_UUID,
                project.prUrl,
            );
            expect(
                await context.service.findDevelopmentExplores(
                    repoWriter,
                    PROJECT_UUID,
                ),
            ).toBeNull();
        });

        it("reads the active workspace's own change, not an older one for another pull request", async () => {
            const context = dbt();
            await context.service.saveDbtScriptTryOut(
                repoWriter,
                PROJECT_UUID,
                null,
                project,
            );
            context.setActiveWorkspace({
                threadUuid: 'thread-2',
                prUrl: 'https://github.com/acme/shop/pull/2',
            });
            expect(
                await context.service.findDevelopmentExplores(
                    repoWriter,
                    PROJECT_UUID,
                ),
            ).toBeNull();
            await context.service.saveDbtScriptTryOut(
                repoWriter,
                PROJECT_UUID,
                'thread-2',
                project,
            );
            expect(
                (
                    await context.service.findDevelopmentExplores(
                        repoWriter,
                        PROJECT_UUID,
                    )
                )?.get('try_out'),
            ).toEqual(TRY_OUT_EXPLORE);
            context.setActiveWorkspace({
                threadUuid: 'thread-1',
                prUrl: project.prUrl,
            });
            expect(
                (
                    await context.service.findDevelopmentExplores(
                        repoWriter,
                        PROJECT_UUID,
                    )
                )?.get('try_out'),
            ).toEqual(TRY_OUT_EXPLORE);
        });

        it('stands in for a preview that has not compiled yet', async () => {
            const context = dbt({ previewExplores: {} });
            await context.service.saveDbtScriptTryOut(
                repoWriter,
                PROJECT_UUID,
                null,
                project,
            );
            expect(
                (
                    await context.service.findPreviewExplores(
                        repoWriter,
                        PROJECT_UUID,
                        PREVIEW_UUID,
                    )
                )?.get('try_out'),
            ).toEqual(TRY_OUT_EXPLORE);
        });

        it.each([
            [JobStatusType.RUNNING, 'try_out'],
            [JobStatusType.ERROR, 'try_out'],
            [JobStatusType.DONE, 'payments'],
        ])(
            'reads a reused preview only once its compile is done (%s)',
            async (previewCompile, shown) => {
                const context = dbt({
                    previewExplores: {
                        payments: {
                            name: 'payments',
                            label: 'Payments',
                            errors: [],
                        },
                    },
                    previewCompile,
                });
                await context.service.saveDbtScriptTryOut(
                    repoWriter,
                    PROJECT_UUID,
                    null,
                    project,
                );
                const explores = await context.service.findPreviewExplores(
                    repoWriter,
                    PROJECT_UUID,
                    PREVIEW_UUID,
                );
                expect(
                    ['try_out', 'payments'].filter((name) =>
                        explores?.has(name),
                    ),
                ).toEqual([shown]);
            },
        );
    });

    describe('the order of a draft', () => {
        it('moves a change one place, and stays put at either end', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel('label: Orders\n')],
                null,
                null,
            );
            const order = () =>
                context.drafts.map((change) => change.draftChangeUuid);
            expect(order()).toEqual(['draft-1', 'draft-2']);
            await context.service.moveDraftChange(
                deployer,
                PROJECT_UUID,
                'draft-2',
                'earlier',
            );
            expect(order()).toEqual(['draft-2', 'draft-1']);
            await context.service.moveDraftChange(
                deployer,
                PROJECT_UUID,
                'draft-2',
                'earlier',
            );
            expect(order()).toEqual(['draft-2', 'draft-1']);
            await expect(
                context.service.moveDraftChange(
                    deployer,
                    PROJECT_UUID,
                    'missing',
                    'later',
                ),
            ).rejects.toThrow(NotFoundError);
            await expect(
                context.service.moveDraftChange(
                    viewer,
                    PROJECT_UUID,
                    'draft-1',
                    'later',
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('what is happening around a draft', () => {
        it('lists the saved content that reads a field the draft redefines, and nothing for a field it only adds', async () => {
            const context = setup({ usedFields: ['orders_amount'] });
            expect(
                await context.service.getDraftUsage(deployer, PROJECT_UUID),
            ).toEqual({ fields: [], checkedFields: 0 });
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [
                    draftModel(
                        `dimensions:
  - name: amount
    type: number
    sql: \${TABLE}.amount * 100
    metrics:
      revenue:
        type: sum
`,
                    ),
                ],
                null,
                null,
            );
            const usage = await context.service.getDraftUsage(
                deployer,
                PROJECT_UUID,
            );
            expect(usage.fields).toEqual([
                {
                    model: 'orders',
                    fieldId: 'orders_amount',
                    label: expect.any(String),
                    kind: 'changed',
                    charts: [{ uuid: 'chart-1', name: 'Saved chart' }],
                    dashboards: 0,
                    scheduledDeliveries: 0,
                },
            ]);
            expect(usage.checkedFields).toBe(1);
            expect(
                await context.service.getDraftUsage(viewer, PROJECT_UUID),
            ).toEqual({ fields: [], checkedFields: 0 });
        });

        it('says who else is changing a drafted model and what was published under it', async () => {
            const at = new Date('2026-01-02T00:00:00Z');
            const context = setup({
                otherDrafters: [
                    {
                        name: 'Ada Lovelace',
                        models: ['orders'],
                        changes: [[draftModel('label: Sales\n')]],
                    },
                    {
                        name: 'Alan Turing',
                        models: ['customers'],
                        changes: [
                            [
                                draftModel('label: People\n', {
                                    name: 'customers',
                                }),
                            ],
                        ],
                    },
                ],
                publishedSince: new Map([
                    ['orders', { by: 'Grace Hopper', at, isYours: false }],
                ]),
            });
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            const draft = await context.service.getDraft(
                deployer,
                PROJECT_UUID,
            );
            expect(draft.models).toEqual([
                expect.objectContaining({
                    model: 'orders',
                    alsoChanging: [{ name: 'Ada Lovelace', paths: ['label'] }],
                    publishedSince: { by: 'Grace Hopper', at, isYours: false },
                }),
            ]);
        });
    });

    describe('reconciling the draft with live', () => {
        const drafted = async (context: ReturnType<typeof setup>) => {
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            return context;
        };
        const reconciliationOf = async (context: ReturnType<typeof setup>) =>
            (await context.service.getDraft(deployer, PROJECT_UUID)).models[0]
                .reconciliation;

        it('records the version a change was made on and is current while live stays there', async () => {
            const context = await drafted(setup());
            expect(context.drafts[0].baseVersions).toEqual({ orders: 1 });
            expect(await reconciliationOf(context)).toEqual({
                state: 'current',
                liveVersion: 1,
                merged: [],
                conflicts: [],
            });
        });

        it('merges what was published to other parts of the model', async () => {
            const context = await drafted(
                setup({
                    baseContents: [
                        [
                            'orders',
                            orders.replace(
                                'type: model',
                                'type: model\nlabel: Old',
                            ),
                        ],
                    ],
                }),
            );
            context.drafts[0].baseVersions = { orders: 0 };
            expect(await reconciliationOf(context)).toEqual({
                state: 'merged',
                liveVersion: 1,
                merged: ['label'],
                conflicts: [],
            });
        });

        it('reports a part both sides changed, until the person keeps theirs', async () => {
            const context = await drafted(
                setup({
                    baseContents: [
                        [
                            'orders',
                            orders.replace(
                                '    sql: ${TABLE}.amount\n',
                                '    sql: ${TABLE}.amount\n    metrics:\n      revenue:\n        type: count\n',
                            ),
                        ],
                    ],
                }),
            );
            context.drafts[0].baseVersions = { orders: 0 };
            const reconciliation = await reconciliationOf(context);
            expect(reconciliation?.state).toBe('conflict');
            expect(reconciliation?.conflicts).toEqual([
                {
                    path: 'dimensions.amount.metrics.revenue',
                    base: 'type: count',
                    live: null,
                    mine: 'type: sum',
                },
            ]);
            const refused = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                null,
            );
            expect(refused.failures.map(({ model }) => model)).toEqual([
                'orders',
            ]);
            expect(context.commitCalls).toEqual([]);
            await expect(
                context.service.keepDraftModel(
                    deployer,
                    PROJECT_UUID,
                    'orders',
                    7,
                ),
            ).rejects.toThrow('published again');
            await context.service.keepDraftModel(
                deployer,
                PROJECT_UUID,
                'orders',
                1,
            );
            expect((await reconciliationOf(context))?.state).toBe('current');
        });

        it('takes the live version of one contested part and leaves the rest of the draft', async () => {
            const context = await drafted(
                setup({
                    baseContents: [
                        [
                            'orders',
                            orders.replace(
                                '    sql: ${TABLE}.amount\n',
                                '    sql: ${TABLE}.amount\n    metrics:\n      revenue:\n        type: count\n',
                            ),
                        ],
                    ],
                }),
            );
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel('label: Sales\n')],
                null,
                null,
            );
            context.drafts[0].baseVersions = { orders: 0 };
            expect((await reconciliationOf(context))?.state).toBe('conflict');
            await context.service.takeLiveDraftPart(
                deployer,
                PROJECT_UUID,
                'orders',
                'dimensions.amount.metrics.revenue',
            );
            const draft = await context.service.getDraft(
                deployer,
                PROJECT_UUID,
            );
            expect(draft.models[0].reconciliation?.conflicts).toEqual([]);
            // Live exactly, plus the one change the draft kept.
            expect(draft.models[0].contentAfter).toBe(
                `${orders}label: Sales\n`,
            );
            expect(context.drafts.at(-1)?.models).toEqual([
                expect.objectContaining({
                    restore: ['dimensions.amount.metrics.revenue'],
                }),
            ]);
        });

        it('still sees a conflict after the changes are reordered', async () => {
            const context = await drafted(
                setup({
                    baseContents: [
                        [
                            'orders',
                            orders.replace(
                                '    sql: ${TABLE}.amount\n',
                                '    sql: ${TABLE}.amount\n    metrics:\n      revenue:\n        type: count\n',
                            ),
                        ],
                    ],
                }),
            );
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel('label: Sales\n')],
                null,
                null,
            );
            context.drafts[0].baseVersions = { orders: 0 };
            context.drafts.reverse();
            expect((await reconciliationOf(context))?.state).toBe('conflict');
            // The oldest base is the one read, whichever change comes first.
            expect(context.requestedBases.at(-1)).toEqual(['orders', 0]);
        });

        it('runs one publish for requests that arrive together', async () => {
            const context = await drafted(setup());
            const [first, second] = await Promise.all([
                context.service.applyDraft(deployer, PROJECT_UUID, null),
                context.service.applyDraft(deployer, PROJECT_UUID, null),
            ]);
            expect(second).toBe(first);
            expect(context.commitCalls).toHaveLength(1);
        });

        it('blocks publishing a change to a model that was removed live', async () => {
            const stored = [{ name: 'orders', content: orders }];
            const context = await drafted(
                setup({ stored, baseContents: [['orders', orders]] }),
            );
            stored.splice(0);
            const draft = await context.service.getDraft(
                deployer,
                PROJECT_UUID,
            );
            expect(draft.models.map(({ model }) => model)).toEqual(['orders']);
            expect(
                draft.models[0].reconciliation?.conflicts.map(
                    ({ path, live }) => [path, live],
                ),
            ).toEqual([['', null]]);
            const refused = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                null,
            );
            expect(refused.failures.map(({ model }) => model)).toEqual([
                'orders',
            ]);
            expect(context.commitCalls).toEqual([]);
        });

        it('says nothing when the base was never recorded', async () => {
            const context = await drafted(setup());
            context.drafts[0].baseVersions = null;
            expect(await reconciliationOf(context)).toBeNull();
        });
    });

    describe('settling the draft', () => {
        it('applies every change as one change set that names the latest question', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                { promptUuid: 'prompt-1', threadUuid: 'thread-1' },
                null,
            );
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel('label: Orders\n')],
                { promptUuid: 'prompt-2', threadUuid: 'thread-1' },
                null,
            );
            const outcome = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                null,
            );
            expect(outcome.failures).toEqual([]);
            expect(context.commitCalls).toHaveLength(1);
            expect(context.commitCalls[0].source).toEqual({
                kind: 'draft',
                promptUuid: 'prompt-2',
                drafts: { changeUuids: ['draft-1', 'draft-2'], model: null },
            });
            expect(context.commitCalls[0].documents[0].content).toContain(
                'revenue',
            );
            expect(context.setExplores).toHaveBeenCalled();
        });

        it('commits nothing when any part stopped passing', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            context.draftWorkspaces.set(
                'draft-2',
                context.workspaceOf('first'),
            );
            context.drafts.push({
                draftChangeUuid: 'draft-2',
                baseVersions: null,
                promptUuid: null,
                question: null,
                createdAt: new Date(),
                models: [draftModel('- not a mapping')],
            });
            const outcome = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                null,
            );
            expect(outcome.exploreCount).toBeNull();
            expect(outcome.failures).toHaveLength(1);
            expect(context.commitCalls).toEqual([]);
            expect(context.drafts).toHaveLength(2);
        });

        it('applies one model of a mixed change and leaves the other drafted', async () => {
            const context = setup();
            context.drafts.push({
                draftChangeUuid: 'draft-1',
                baseVersions: null,
                promptUuid: null,
                question: null,
                createdAt: new Date(),
                models: [
                    draftModel(REVENUE_YAML),
                    { ...draftModel('label: Other\n'), name: 'other' },
                ],
            });
            const outcome = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                draftModel(REVENUE_YAML).name,
            );
            expect(outcome.failures).toEqual([]);
            expect(
                context.commitCalls[0].documents.map(({ name }) => name),
            ).toEqual([draftModel(REVENUE_YAML).name]);
            expect(context.commitCalls[0].source).toMatchObject({
                drafts: {
                    changeUuids: ['draft-1'],
                    model: draftModel(REVENUE_YAML).name,
                },
            });
        });

        it('discards one model of a mixed change, then fails on one that is gone', async () => {
            const context = setup();
            context.drafts.push({
                draftChangeUuid: 'draft-1',
                baseVersions: null,
                promptUuid: null,
                question: null,
                createdAt: new Date(),
                models: [
                    draftModel(REVENUE_YAML),
                    { ...draftModel('label: Other\n'), name: 'other' },
                ],
            });
            await context.service.discardDraft(deployer, PROJECT_UUID, {
                kind: 'model',
                model: 'other',
            });
            expect(
                context.drafts.flatMap(({ models }) =>
                    models.map(({ name }) => name),
                ),
            ).toEqual([draftModel(REVENUE_YAML).name]);
            await expect(
                context.service.discardDraft(deployer, PROJECT_UUID, {
                    kind: 'model',
                    model: 'other',
                }),
            ).rejects.toThrow(NotFoundError);
        });

        it('marks a draft that is live already as applied, not discarded', async () => {
            const context = setup();
            context.drafts.push({
                draftChangeUuid: 'draft-1',
                baseVersions: null,
                promptUuid: null,
                question: null,
                createdAt: new Date(),
                models: [draftModel('sql_from: public.orders\n')],
            });
            const outcome = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                null,
            );
            expect(outcome).toEqual({
                exploreCount: null,
                failures: [],
                pullRequestUrl: null,
                merge: null,
            });
            expect(context.commitCalls).toEqual([]);
            expect(context.settled).toEqual(['applied']);
        });

        it('reads a drafted model only for someone who can change the project', async () => {
            await expect(
                setup().service.readDraftedModel(
                    viewer,
                    PROJECT_UUID,
                    'orders',
                ),
            ).rejects.toThrow(ForbiddenError);
        });

        it('discards one change, then fails on one that is gone', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            await context.service.discardDraft(deployer, PROJECT_UUID, {
                kind: 'change',
                changeUuid: 'draft-1',
            });
            expect(context.drafts).toEqual([]);
            await expect(
                context.service.discardDraft(deployer, PROJECT_UUID, {
                    kind: 'change',
                    changeUuid: 'draft-1',
                }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    it('merges, compiles, saves and deploys a patch across models', async () => {
        const context = setup();
        const { upsert, setExplores } = context;
        const outcome = await draftAndApply(context, [
            customers,
            {
                name: 'orders',
                dimensions: [
                    {
                        name: 'amount',
                        metrics: { revenue: { type: MetricType.SUM } },
                    },
                ],
                joins: [
                    {
                        join: 'customers',
                        sql_on: '${orders.customer_id} = ${customers.id}',
                    },
                ],
            },
        ]);

        expect(outcome.results.map(({ status }) => status)).toEqual([
            'ready',
            'ready',
        ]);
        expect(outcome.exploreCount).toBe(2);
        expect(upsert).toHaveBeenCalledWith(
            PROJECT_UUID,
            expect.arrayContaining([
                expect.objectContaining({ name: 'customers' }),
                expect.objectContaining({ name: 'orders' }),
            ]),
            USER_UUID,
        );
        const [, , explores] = setExplores.mock.calls[0];
        const deployed = explores.find(({ name }) => name === 'orders');
        if (!deployed || isExploreError(deployed))
            throw new Error('Expected the orders explore to compile');
        expect(deployed.tables.orders.metrics.revenue.type).toBe(
            MetricType.SUM,
        );
        expect(deployed.joinedTables.map(({ table }) => table)).toEqual([
            'customers',
        ]);
    });

    it('drops a model that does not compile and still deploys the rest', async () => {
        const context = setup();
        const { upsert, setExplores } = context;
        const outcome = await draftAndApply(context, [
            customers,
            {
                name: 'orders',
                metrics: {
                    broken: {
                        type: MetricType.NUMBER,
                        sql: '${does_not_exist} * 2',
                    },
                },
            },
        ]);

        expect(outcome.results[0].status).toBe('ready');
        expect(outcome.results[1]).toMatchObject({
            model: 'orders',
            status: 'failed',
            changes: [],
        });
        expect(outcome.results[1].error).toContain('does_not_exist');
        expect(upsert).toHaveBeenCalledWith(
            PROJECT_UUID,
            [expect.objectContaining({ name: 'customers' })],
            USER_UUID,
        );
        const [, , explores] = setExplores.mock.calls[0];
        expect(explores.filter(isExploreError)).toEqual([]);
    });

    it('runs each patched model on the warehouse and drops the ones it rejects', async () => {
        const context = setup({
            rejectSql: 'public.missing',
        });
        const { upsert, setExplores, runSqlQuery } = context;
        const outcome = await draftAndApply(context, [
            customers,
            {
                name: 'missing',
                sql_from: 'public.missing',
                dimensions: [
                    {
                        name: 'id',
                        type: DimensionType.NUMBER,
                        sql: '${TABLE}.id',
                        metrics: { rows: { type: MetricType.COUNT } },
                    },
                ],
            },
        ]);

        expect(outcome.results[0].status).toBe('ready');
        expect(outcome.results[1]).toMatchObject({
            model: 'missing',
            status: 'failed',
            error: 'The warehouse rejected this model: relation "public.missing" does not exist',
        });
        expect(runSqlQuery.mock.calls.map(([, , sql]) => sql)).toEqual(
            expect.arrayContaining([
                expect.stringContaining(
                    'FROM (SELECT * FROM public.customers AS no_rows WHERE 1 = 0) AS "customers"',
                ),
            ]),
        );
        expect(upsert).toHaveBeenCalledWith(
            PROJECT_UUID,
            [expect.objectContaining({ name: 'customers' })],
            USER_UUID,
        );
        const [, , explores] = setExplores.mock.calls[0];
        expect(explores.map(({ name }) => name)).toEqual([
            'orders',
            'customers',
        ]);
    });

    it('compiles each patched model through the query builder, grouped by its own and each joined model', async () => {
        const context = setup({
            rejectMetric: 'orders_revenue',
        });
        const { setExplores, compileQuery, runSqlQuery } = context;
        const outcome = await draftAndApply(context, [
            customers,
            {
                name: 'orders',
                dimensions: [
                    {
                        name: 'amount',
                        metrics: { revenue: { type: MetricType.SUM } },
                    },
                ],
                joins: [
                    {
                        join: 'customers',
                        sql_on: '${orders.customer_id} = ${customers.id}',
                    },
                ],
            },
        ]);

        expect(outcome.results[0].status).toBe('ready');
        expect(outcome.results[1]).toMatchObject({
            model: 'orders',
            status: 'failed',
        });
        expect(outcome.results[1].error).toContain(
            'This model does not work in a query: Tried to reference a dimension',
        );
        const groupings = compileQuery.mock.calls
            .map(([{ body }]) => body)
            .filter(({ metrics }) => metrics.includes('orders_revenue'))
            .map(({ dimensions }) => dimensions);
        expect(groupings).toEqual([['orders_amount'], ['customers_id']]);
        expect(
            runSqlQuery.mock.calls.some(([, , sql]) =>
                sql.includes('public.orders'),
            ),
        ).toBe(false);
        const [, , explores] = setExplores.mock.calls[0];
        const deployed = explores.find(({ name }) => name === 'orders');
        if (!deployed || isExploreError(deployed))
            throw new Error('Expected the stored orders explore');
        expect(deployed.tables.orders.metrics).toEqual({});
    });

    describe('one draft per workspace', () => {
        const proposeIn = (
            context: ReturnType<typeof setup>,
            threadUuid: string,
            yaml: string,
        ) => {
            context.studioThreads.add(threadUuid);
            return context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(yaml)],
                { promptUuid: `prompt-${threadUuid}`, threadUuid },
                null,
            );
        };
        const draftedQuestions = async (context: ReturnType<typeof setup>) =>
            (
                await context.service.getDraft(deployer, PROJECT_UUID)
            ).changes.map(({ draftChangeUuid }) => draftChangeUuid);

        it('keeps edits from different conversations in the same checkout', async () => {
            const context = setup();
            await proposeIn(context, 'thread-1', REVENUE_YAML);
            await proposeIn(context, 'thread-2', 'label: Orders\n');
            expect(await draftedQuestions(context)).toEqual([
                'draft-1',
                'draft-2',
            ]);
            expect(context.startWorkspace).not.toHaveBeenCalled();
        });

        it("reads one workspace's changes alone, whichever is active, without changes from before workspaces", async () => {
            const context = setup();
            context.drafts.push({
                draftChangeUuid: 'legacy',
                baseVersions: null,
                promptUuid: null,
                question: null,
                createdAt: new Date(),
                models: [draftModel('label: Legacy\n')],
            });
            context.setActiveWorkspace({ threadUuid: 'thread-1', prUrl: null });
            await proposeIn(context, 'thread-1', REVENUE_YAML);
            context.setActiveWorkspace({ threadUuid: 'thread-2', prUrl: null });
            await proposeIn(context, 'thread-1', 'label: Orders\n');
            const first = await context.service.getWorkspaceDraft(
                deployer,
                PROJECT_UUID,
                context.workspaceOf('thread-1'),
            );
            expect(
                first.changes.map(({ draftChangeUuid }) => draftChangeUuid),
            ).toEqual(['draft-2']);
            expect(first.models[0].contentAfter).toContain('revenue');
            const second = await context.service.getWorkspaceDraft(
                deployer,
                PROJECT_UUID,
                context.workspaceOf('thread-2'),
            );
            expect(
                second.changes.map(({ draftChangeUuid }) => draftChangeUuid),
            ).toEqual(['draft-3']);
            expect(second.models[0].contentAfter).not.toContain('revenue');
        });

        it("refuses to read someone else's workspace", async () => {
            const context = setup();
            context.setActiveWorkspace({ threadUuid: 'thread-1', prUrl: null });
            await proposeIn(context, 'thread-1', REVENUE_YAML);
            await expect(
                context.service.getWorkspaceDraft(
                    { ...deployer, userUuid: 'someone-else' },
                    PROJECT_UUID,
                    context.workspaceOf('thread-1'),
                ),
            ).rejects.toThrow("This change is someone else's");
        });

        it('publishes only the active workspace and finishes that workspace', async () => {
            const context = setup();
            context.setActiveWorkspace({ threadUuid: 'thread-1', prUrl: null });
            await proposeIn(context, 'thread-1', REVENUE_YAML);
            context.setActiveWorkspace({ threadUuid: 'thread-2', prUrl: null });
            await proposeIn(context, 'thread-1', 'label: Orders\n');
            await context.service.applyDraft(deployer, PROJECT_UUID, null);
            expect(context.commitCalls[0].source).toMatchObject({
                drafts: { changeUuids: ['draft-2'] },
            });
            expect(context.commitCalls[0].workspaceUuid).toBe(
                context.workspaceOf('thread-2'),
            );
            expect(context.finishWorkspace).toHaveBeenCalledWith(
                expect.anything(),
                context.workspaceOf('thread-2'),
            );
        });

        it('finishes the workspace when its whole draft is discarded, not when one change is', async () => {
            const context = setup();
            context.setActiveWorkspace({ threadUuid: 'thread-1', prUrl: null });
            await proposeIn(context, 'thread-1', REVENUE_YAML);
            await proposeIn(context, 'thread-1', 'label: Orders\n');
            await context.service.discardDraft(deployer, PROJECT_UUID, {
                kind: 'change',
                changeUuid: 'draft-1',
            });
            expect(context.finishWorkspace).not.toHaveBeenCalled();
            await context.service.discardDraft(deployer, PROJECT_UUID, {
                kind: 'all',
            });
            expect(context.finishWorkspace).toHaveBeenCalledWith(
                {
                    projectUuid: PROJECT_UUID,
                    userUuid: USER_UUID,
                    workspaceUuid: context.workspaceOf('thread-1'),
                },
                context.workspaceOf('thread-1'),
            );
            expect(context.drafts).toEqual([]);
        });

        it('finishes the threadless workspace started by a manual edit', async () => {
            const context = setup();
            await context.service.proposeDraftChange(
                deployer,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            await context.service.discardDraft(deployer, PROJECT_UUID, {
                kind: 'all',
            });
            expect(context.finishWorkspace).toHaveBeenCalledWith(
                expect.anything(),
                context.workspaceOf('first'),
            );
        });

        it("refuses to publish a workspace's change to a model another workspace published to the same part since", async () => {
            const stored = [{ name: 'orders', content: orders, version: 1 }];
            const context = setup({
                stored,
                baseContents: [['orders', orders]],
            });
            context.setActiveWorkspace({ threadUuid: 'thread-1', prUrl: null });
            await proposeIn(context, 'thread-1', REVENUE_YAML);
            context.setActiveWorkspace({ threadUuid: 'thread-2', prUrl: null });
            await proposeIn(
                context,
                'thread-1',
                REVENUE_YAML.replace('sum', 'count'),
            );
            const published = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                null,
            );
            expect(published.failures).toEqual([]);
            stored.splice(0, 1, {
                name: 'orders',
                content: context.commitCalls[0].documents[0].content ?? '',
                version: 2,
            });
            context.setActiveWorkspace({ threadUuid: 'thread-1', prUrl: null });
            const refused = await context.service.applyDraft(
                deployer,
                PROJECT_UUID,
                null,
            );
            expect(refused.failures).toEqual([
                expect.objectContaining({ model: 'orders' }),
            ]);
            expect(context.commitCalls).toHaveLength(1);
        });
    });

    describe('derived models', () => {
        const latest: LightdashModelFragment = {
            name: 'latest_orders',
            sql_from:
                'select * from (select *, row_number() over () rn from public.orders) o where rn = 1',
            dimensions: [
                { name: 'id', type: DimensionType.NUMBER, sql: '${TABLE}.id' },
            ],
        };

        it('deploys a query as a model and checks it on the warehouse', async () => {
            const context = setup();
            const { setExplores, runSqlQuery } = context;
            const { results } = await draftAndApply(context, [latest]);
            expect(results[0].status).toBe('ready');
            const [, , explores] = setExplores.mock.calls[0];
            const deployed = explores.find(
                ({ name }) => name === 'latest_orders',
            );
            if (!deployed || isExploreError(deployed))
                throw new Error('Expected the derived explore');
            expect(deployed.tables.latest_orders.sqlTable).toBe(
                `(\n${latest.sql_from}\n)`,
            );
            expect(
                runSqlQuery.mock.calls.some(([, , sql]) =>
                    sql.includes(
                        `SELECT * FROM (\n${latest.sql_from}\n) AS no_rows WHERE 1 = 0`,
                    ),
                ),
            ).toBe(true);
        });

        it('refuses more than one statement', async () => {
            const context = setup();
            const { upsert } = context;
            const { results } = await draftAndApply(context, [
                { ...latest, sql_from: 'select 1; drop table orders' },
            ]);
            expect(results[0].status).toBe('failed');
            expect(results[0].error).toContain('one SELECT');
            expect(upsert).not.toHaveBeenCalled();
        });
    });

    describe('keys and joins', () => {
        const join: LightdashModelFragment = {
            name: 'orders',
            joins: [
                {
                    join: 'customers',
                    sql_on: '${orders.customer_id} = ${customers.id}',
                },
            ],
        };
        const apply = async (
            duplicated: string[],
            fragments: LightdashModelFragment[],
        ) => {
            const context = setup({ duplicated });
            const { results } = await draftAndApply(context, fragments);
            return { results, upsert: context.upsert };
        };

        it('keeps a primary key that identifies one row', async () => {
            const { results } = await apply(
                [],
                [{ name: 'orders', primary_key: 'customer_id' }],
            );
            expect(results[0].status).toBe('ready');
        });

        it('fails a primary key with duplicates', async () => {
            const { results } = await apply(
                ['customer_id'],
                [{ name: 'orders', primary_key: 'customer_id' }],
            );
            expect(results[0].status).toBe('failed');
            expect(results[0].error).toContain('not unique');
        });

        it('records a measured many-to-one join', async () => {
            const { results, upsert } = await apply(
                ['customer_id'],
                [customers, join],
            );
            expect(results.map(({ status }) => status)).toEqual([
                'ready',
                'ready',
            ]);
            expect(JSON.stringify(upsert.mock.calls)).toContain(
                'relationship: many-to-one',
            );
        });

        it('fails a many-to-many join', async () => {
            const { results } = await apply(
                ['customer_id', '.id'],
                [customers, join],
            );
            expect(results[1].error).toContain('many-to-many');
        });

        it('fails a one-to-many join until the model has a primary key', async () => {
            const { results } = await apply(['.id'], [customers, join]);
            expect(results[1].error).toContain('primary_key');
            const withKey = await apply(
                ['.id'],
                [customers, { ...join, primary_key: 'customer_id' }],
            );
            expect(withKey.results[1].status).toBe('ready');
            expect(JSON.stringify(withKey.upsert.mock.calls)).toContain(
                'relationship: one-to-many',
            );
        });
    });

    it('drafts and deploys nothing when a fragment changes nothing', async () => {
        const context = setup();
        const outcome = await draftAndApply(context, [
            { name: 'orders', sql_from: 'public.orders' },
        ]);
        expect(outcome.results[0].status).toBe('unchanged');
        expect(outcome.exploreCount).toBeNull();
        expect(context.drafts).toEqual([]);
        expect(context.setExplores).not.toHaveBeenCalled();
    });

    it('refuses without permission, with the flag off, or on a dbt project', async () => {
        const propose = (
            context: ReturnType<typeof setup>,
            asUser: SessionUser,
        ) =>
            context.service.proposeDraftChange(
                asUser,
                PROJECT_UUID,
                [toDraftModel(customers)],
                null,
                null,
            );
        await expect(propose(setup(), viewer)).rejects.toThrow(ForbiddenError);
        await expect(
            propose(setup({ enabled: false }), deployer),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            propose(setup({ dbtConnection: DBT_IN_GITHUB }), deployer),
        ).rejects.toThrow(ParameterError);
        expect(await setup().service.canEditModels(viewer, PROJECT_UUID)).toBe(
            false,
        );
        expect(
            await setup().service.canEditModels(deployer, PROJECT_UUID),
        ).toBe(true);
    });

    it('refuses to replace models that were deployed from elsewhere', async () => {
        await expect(
            draftAndApply(
                setup({ stored: [], exploreTypes: [ExploreType.DEFAULT] }),
                [customers],
            ),
        ).rejects.toThrow(ParameterError);

        const outcome = await draftAndApply(
            setup({ stored: [], exploreTypes: [ExploreType.VIRTUAL] }),
            [customers],
        );
        expect(outcome.exploreCount).toBe(1);
    });

    describe('concurrent writes', () => {
        it('rereads and retries when another write lands first', async () => {
            const context = setup({ staleCommits: 1 });
            const outcome = await draftAndApply(context, [customers]);
            expect(outcome.exploreCount).toBe(2);
            expect(context.commitCalls).toHaveLength(2);
            expect(context.upsert).toHaveBeenCalledTimes(1);
        });

        it('gives up after repeated conflicts', async () => {
            const context = setup({ staleCommits: 5 });
            await expect(draftAndApply(context, [customers])).rejects.toThrow(
                ModelDocumentsChangedError,
            );
            expect(context.commitCalls).toHaveLength(3);
        });

        it('passes every stored version so a stale read is caught', async () => {
            const context = setup();
            await draftAndApply(context, [customers]);
            expect(context.commitCalls[0].readVersions).toEqual(
                new Map([['orders', 1]]),
            );
            expect(context.commitCalls[0].source).toMatchObject({
                kind: 'draft',
                promptUuid: null,
            });
        });
    });

    describe('getModel', () => {
        it('returns the YAML and history of a stored model', async () => {
            const { service, findModelHistory } = setup();
            expect(
                await service.getModel(deployer, PROJECT_UUID, 'orders'),
            ).toEqual({
                name: 'orders',
                content: orders,
                version: 1,
                history: [],
            });
            expect(findModelHistory).toHaveBeenCalledWith(
                PROJECT_UUID,
                'orders',
            );
        });

        it('names whose change a later change wrote over', async () => {
            const { service, findModelHistory } = setup();
            const change = (
                by: string,
                before: string,
                after: string,
                byUserUuid: string | null = `user-${by}`,
            ) => ({
                changeSetUuid: `set-${by}`,
                source: 'draft' as const,
                question: null,
                reverted: false,
                createdAt: new Date(),
                contentBefore: before,
                contentAfter: after,
                otherModels: [],
                by,
                byUserUuid,
            });
            const labelled = orders.replace(
                'name: orders',
                'name: orders\nlabel: A',
            );
            findModelHistory.mockResolvedValueOnce([
                change(
                    'Grace',
                    labelled,
                    labelled.replace('label: A', 'label: B'),
                ),
                change('Ada', orders, labelled),
            ]);
            const model = await service.getModel(
                deployer,
                PROJECT_UUID,
                'orders',
            );
            expect(model?.history.map(({ replaced }) => replaced)).toEqual([
                { by: 'Ada', paths: ['label'] },
                null,
            ]);
            findModelHistory.mockResolvedValueOnce([
                change(
                    'Sam',
                    labelled,
                    labelled.replace('label: A', 'label: B'),
                    'user-sam-2',
                ),
                change('Sam', orders, labelled, 'user-sam-1'),
            ]);
            const sameName = await service.getModel(
                deployer,
                PROJECT_UUID,
                'orders',
            );
            // Two people who share a name are still two people.
            expect(sameName?.history[0].replaced).toEqual({
                by: 'Sam',
                paths: ['label'],
            });
        });

        it('returns null for a model the project does not keep', async () => {
            expect(
                await setup().service.getModel(
                    deployer,
                    PROJECT_UUID,
                    'missing',
                ),
            ).toBeNull();
        });

        it('shows nothing to someone who cannot change the project', async () => {
            expect(
                await setup().service.getModel(viewer, PROJECT_UUID, 'orders'),
            ).toBeNull();
        });

        it('shows nothing on a project with a dbt connection', async () => {
            expect(
                await setup({
                    dbtConnection: DBT_IN_GITHUB,
                }).service.getModel(deployer, PROJECT_UUID, 'orders'),
            ).toBeNull();
        });
    });

    describe('a project whose models live in a repository', () => {
        const repo = (overrides: Parameters<typeof setup>[0] = {}) =>
            setup({ dbtConnection: MODELS_IN_GITHUB, ...overrides });

        it('applies a draft as a pull request and takes nothing live', async () => {
            const context = repo();
            await context.service.proposeDraftChange(
                repoWriter,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            const outcome = await context.service.applyDraft(
                repoWriter,
                PROJECT_UUID,
                null,
            );
            expect(outcome).toEqual({
                exploreCount: null,
                failures: [],
                pullRequestUrl: PULL_REQUEST_URL,
                merge: null,
            });
            expect(context.mergePullRequest).not.toHaveBeenCalled();
            const [{ writes, title }] = context.openPullRequest.mock.calls[0];
            expect(writes.get('orders')).toContain('revenue');
            expect(title).toBe('Update semantic layer: orders');
            expect(context.recordedPullRequests).toEqual([PULL_REQUEST_URL]);
            expect(context.commitCalls).toHaveLength(0);
            expect(context.setExplores).not.toHaveBeenCalled();
            expect(context.drafts).toHaveLength(0);
        });

        it('merges the pull request when publishing asks to', async () => {
            const context = repo();
            await context.service.proposeDraftChange(
                repoWriter,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            const outcome = await context.service.applyDraft(
                repoWriter,
                PROJECT_UUID,
                null,
                true,
            );
            expect(outcome.merge).toEqual({ merged: true });
            expect(context.mergePullRequest).toHaveBeenCalledWith({
                user: repoWriter,
                projectUuid: PROJECT_UUID,
                prUrl: PULL_REQUEST_URL,
            });
        });

        it('leaves the pull request open and says why when the repository refuses the merge', async () => {
            const context = repo();
            context.mergePullRequest.mockRejectedValueOnce(
                new Error('Required status check "ci" is expected.'),
            );
            await context.service.proposeDraftChange(
                repoWriter,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            const outcome = await context.service.applyDraft(
                repoWriter,
                PROJECT_UUID,
                null,
                true,
            );
            expect(outcome).toMatchObject({
                failures: [],
                pullRequestUrl: PULL_REQUEST_URL,
                merge: {
                    merged: false,
                    reason: 'Required status check "ci" is expected.',
                },
            });
            expect(context.recordedPullRequests).toEqual([PULL_REQUEST_URL]);
        });

        it('opens one pull request when the same draft is applied twice', async () => {
            const context = repo();
            await context.service.proposeDraftChange(
                repoWriter,
                PROJECT_UUID,
                [draftModel(REVENUE_YAML)],
                null,
                null,
            );
            await context.service.applyDraft(repoWriter, PROJECT_UUID, null);
            const second = await context.service.applyDraft(
                repoWriter,
                PROJECT_UUID,
                null,
            );
            expect(second.pullRequestUrl).toBeNull();
            expect(context.openPullRequest).toHaveBeenCalledTimes(1);
        });

        it('is off for a repository the GitHub App cannot reach', async () => {
            expect(
                await setup({
                    dbtConnection: {
                        ...GITHUB_REPO,
                        semanticLayer: 'lightdash',
                        authorization_method: 'personal_access_token',
                    },
                }).service.getStatus(repoWriter, PROJECT_UUID),
            ).toEqual({ enabled: false, appliesAs: 'pull_request' });
        });

        it('opens no pull request for a draft that stopped passing', async () => {
            const context = repo();
            context.drafts.push({
                draftChangeUuid: 'draft-1',
                baseVersions: null,
                promptUuid: null,
                question: null,
                createdAt: new Date(),
                models: [draftModel('- not a mapping')],
            });
            const outcome = await context.service.applyDraft(
                repoWriter,
                PROJECT_UUID,
                null,
            );
            expect(outcome.failures).not.toEqual([]);
            expect(context.openPullRequest).not.toHaveBeenCalled();
        });

        it('says how a draft applies', async () => {
            expect(
                await repo().service.getStatus(repoWriter, PROJECT_UUID),
            ).toEqual({ enabled: true, appliesAs: 'pull_request' });
            expect(
                await setup().service.getStatus(deployer, PROJECT_UUID),
            ).toEqual({ enabled: true, appliesAs: 'live' });
        });

        it('shows changes only to those who can make them', async () => {
            const dbt = setup({ dbtConnection: DBT_IN_GITHUB }).service;
            await expect(
                dbt.listWorkspaces(viewer, PROJECT_UUID),
            ).rejects.toThrow(/cannot change/);
            await expect(
                dbt.listWorkspaces(deployer, PROJECT_UUID),
            ).rejects.toThrow(/cannot change/);
            await expect(
                dbt.getWorkspace(viewer, PROJECT_UUID, 'workspace-uuid'),
            ).rejects.toThrow(/cannot change/);
            await expect(
                dbt.finishWorkspace(viewer, PROJECT_UUID, 'workspace-uuid'),
            ).rejects.toThrow(/cannot change/);
        });

        it('keeps no draft on a dbt project, where the agent edits the repository', async () => {
            const dbt = () => setup({ dbtConnection: DBT_IN_GITHUB });
            expect(
                await dbt().service.getStatus(repoWriter, PROJECT_UUID),
            ).toEqual({ enabled: true, appliesAs: 'dbt_pull_request' });
            expect(
                await dbt().service.getStatus(deployer, PROJECT_UUID),
            ).toEqual({ enabled: false, appliesAs: 'dbt_pull_request' });
            expect(
                await setup({
                    dbtConnection: DBT_IN_GITHUB,
                    enabled: false,
                }).service.getStatus(repoWriter, PROJECT_UUID),
            ).toEqual({ enabled: false, appliesAs: 'dbt_pull_request' });
            expect(
                await dbt().service.canEditModels(repoWriter, PROJECT_UUID),
            ).toBe(false);
            expect(
                await dbt().service.getDraft(repoWriter, PROJECT_UUID),
            ).toEqual(expect.objectContaining({ changes: [] }));
        });

        it('needs permission to write to the repository, and the GitHub App', async () => {
            expect(
                await repo().service.canEditModels(deployer, PROJECT_UUID),
            ).toBe(false);
            expect(
                await repo({ appInstalled: false }).service.canEditModels(
                    repoWriter,
                    PROJECT_UUID,
                ),
            ).toBe(false);
        });

        it('keeps no history of its own and undoes nothing', async () => {
            const context = repo();
            expect(
                await context.service.getModel(
                    repoWriter,
                    PROJECT_UUID,
                    'orders',
                ),
            ).toEqual(expect.objectContaining({ history: [] }));
            expect(context.findModelHistory).not.toHaveBeenCalled();
            await expect(
                context.service.undo(repoWriter, PROJECT_UUID, ['change-set']),
            ).rejects.toThrow();
            expect(context.commitCalls).toHaveLength(0);
        });
    });

    describe('undo', () => {
        const customersYaml = `type: model
name: customers
sql_from: public.customers
dimensions:
  - name: id
    type: number
    sql: \${TABLE}.id
`;
        const ordersEdited = `${orders}\n# edited\n`;
        const created: ChangeSet = {
            changeSetUuid: 'created-customers',
            revertedByChangeSetUuid: null,
            createdAt: new Date('2026-11-09T10:00:00Z'),
            revisions: [
                {
                    name: 'customers',
                    contentBefore: null,
                    contentAfter: customersYaml,
                },
            ],
        };
        const patched: ChangeSet = {
            changeSetUuid: 'patched-orders',
            revertedByChangeSetUuid: null,
            createdAt: new Date('2026-11-09T11:00:00Z'),
            revisions: [
                {
                    name: 'orders',
                    contentBefore: orders,
                    contentAfter: ordersEdited,
                },
            ],
        };
        const stored = [
            { name: 'orders', content: ordersEdited, version: 2 },
            { name: 'customers', content: customersYaml, version: 1 },
        ];

        it('restores what each change set replaced and deletes what it created', async () => {
            const {
                service,
                commitCalls,
                upsert,
                setExplores,
                deleteCachedExplores,
            } = setup({
                stored,
                changeSets: [created, patched],
            });
            await service.undo(deployer, PROJECT_UUID, [
                'created-customers',
                'patched-orders',
            ]);
            expect(deleteCachedExplores).toHaveBeenCalledWith(PROJECT_UUID, [
                'customers',
            ]);
            expect(commitCalls[0]).toMatchObject({
                source: {
                    kind: 'undo',
                    reverts: ['created-customers', 'patched-orders'],
                },
                readVersions: new Map([
                    ['orders', 2],
                    ['customers', 1],
                ]),
            });
            expect(upsert.mock.calls[0][1]).toEqual(
                expect.arrayContaining([
                    { name: 'customers', content: null },
                    { name: 'orders', content: orders },
                ]),
            );
            const [, , explores] = setExplores.mock.calls[0];
            expect(explores.map(({ name }) => name)).toEqual(['orders']);
        });

        it('removes the last model without deploying an empty set', async () => {
            const { service, setExplores, deleteCachedExplores } = setup({
                stored: [{ name: 'customers', content: customersYaml }],
                changeSets: [created],
            });
            await expect(
                service.undo(deployer, PROJECT_UUID, ['created-customers']),
            ).resolves.toEqual({ exploreCount: 0 });
            expect(deleteCachedExplores).toHaveBeenCalledWith(PROJECT_UUID, [
                'customers',
            ]);
            expect(setExplores).not.toHaveBeenCalled();
        });

        it('refuses when a model changed after the change set', async () => {
            const { service, commitCalls } = setup({
                stored: [
                    {
                        name: 'orders',
                        content: `${orders}\n# later\n`,
                        version: 3,
                    },
                ],
                changeSets: [patched],
            });
            await expect(
                service.undo(deployer, PROJECT_UUID, ['patched-orders']),
            ).rejects.toThrow('orders changed after this');
            expect(commitCalls).toHaveLength(0);
        });

        it('undoes a change once the later change to the model was undone', async () => {
            const { service, upsert } = setup({
                stored: [{ name: 'orders', content: ordersEdited, version: 3 }],
                changeSets: [patched],
            });
            await service.undo(deployer, PROJECT_UUID, ['patched-orders']);
            expect(upsert.mock.calls[0][1]).toEqual([
                { name: 'orders', content: orders },
            ]);
        });

        it('undoes a change while an unrelated model is already broken', async () => {
            const broken = {
                name: 'bad',
                content:
                    'type: model\nname: bad\nsql_from: public.bad\ndimensions:\n  - name: id\n    type: number\n    sql: ${TABLE}.id\nmetrics:\n  broken:\n    type: number\n    sql: ${does_not_exist} * 2\n',
            };
            const { service, upsert } = setup({
                stored: [
                    { name: 'orders', content: ordersEdited, version: 2 },
                    broken,
                ],
                changeSets: [patched],
            });
            await service.undo(deployer, PROJECT_UUID, ['patched-orders']);
            expect(upsert.mock.calls[0][1]).toEqual([
                { name: 'orders', content: orders },
            ]);
        });

        it('refuses a change set that was undone or does not exist', async () => {
            const { service } = setup({
                stored,
                changeSets: [{ ...patched, revertedByChangeSetUuid: 'later' }],
            });
            await expect(
                service.undo(deployer, PROJECT_UUID, ['patched-orders']),
            ).rejects.toThrow('already undone');
            await expect(
                service.undo(deployer, PROJECT_UUID, ['missing']),
            ).rejects.toThrow(NotFoundError);
        });

        it('refuses without permission', async () => {
            const { service } = setup({ stored, changeSets: [patched] });
            await expect(
                service.undo(viewer, PROJECT_UUID, ['patched-orders']),
            ).rejects.toThrow(ForbiddenError);
        });
    });
});

describe('saving a hand edit', () => {
    const edit = (prUrl: string | null) => ({
        revision: null,
        path: 'models/orders.yml',
        content: 'version: 2',
        prUrl,
        threadUuid: null,
    });

    it('passes the loaded revision to both save attempts and permits continuation', async () => {
        const context = setup();
        const save = vi
            .spyOn(context.aiWritebackService, 'saveWithScript')
            .mockResolvedValueOnce({ status: 'checked' })
            .mockResolvedValueOnce({
                status: 'script_failed',
                error: 'changed',
                logs: [],
            });
        await expect(
            context.service.saveSource(deployer, PROJECT_UUID, {
                ...edit(null),
                revision: 'original',
            }),
        ).resolves.toEqual({ status: 'failed', error: 'changed' });
        expect(save).toHaveBeenCalledTimes(2);
        for (const [args, , options] of save.mock.calls) {
            expect(args.startNewPullRequest).toBe(false);
            expect(options.expectedSource).toEqual({
                path: 'models/orders.yml',
                revision: 'original',
            });
        }
    });

    it('refuses to continue a thread owned by someone else', async () => {
        const context = setup();
        vi.spyOn(context.workspaceModel, 'findStudioThread').mockResolvedValue(
            null,
        );
        const save = vi.spyOn(context.aiWritebackService, 'saveWithScript');
        await expect(
            context.service.saveSource(deployer, PROJECT_UUID, {
                ...edit(null),
                threadUuid: 'other-thread',
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(save).not.toHaveBeenCalled();
    });

    it('returns a null revision for a missing file and a content hash for an existing file', async () => {
        const context = setup();
        const readFile = vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('select 1');
        vi.spyOn(
            context.aiWritebackService,
            'openStudioCheckout',
        ).mockResolvedValue({
            root: 'dbt/',
            checkout: {
                prUrl: null,
                branch: 'main',
                baseBranch: 'main',
                headSha: 'head',
                listFiles: async () => [],
                readFile,
                readFileAt: async () => null,
                listFilesChangedSince: async () => [],
            },
        });
        await expect(
            context.service.readSource(
                deployer,
                PROJECT_UUID,
                null,
                'models/orders.sql',
            ),
        ).resolves.toEqual({
            path: 'models/orders.sql',
            content: null,
            revision: null,
        });
        const file = await context.service.readSource(
            deployer,
            PROJECT_UUID,
            null,
            'models/orders.sql',
        );
        expect(file.revision).toMatch(/^[a-f0-9]{64}$/);
        expect(file.content).toBe('select 1');
        expect(readFile).toHaveBeenCalledWith('dbt/models/orders.sql');
    });

    it('refuses a pull request that is not your own change', async () => {
        const context = setup();
        await expect(
            context.service.saveSource(
                deployer,
                PROJECT_UUID,
                edit(PULL_REQUEST_URL),
            ),
        ).rejects.toThrow(ForbiddenError);
        context.setActiveWorkspace({
            threadUuid: 'thread',
            prUrl: PULL_REQUEST_URL,
        });
        await expect(
            context.service.saveSource(
                deployer,
                PROJECT_UUID,
                edit(PULL_REQUEST_URL),
            ),
        ).rejects.toThrow('not used in these tests');
    });

    it('refuses a path outside the project files', async () => {
        const context = setup();
        await expect(
            context.service.saveSource(deployer, PROJECT_UUID, {
                ...edit(null),
                path: 'models/../profiles.yml',
            }),
        ).rejects.toThrow(ParameterError);
    });
});

describe('isSourcePath', () => {
    it('takes model and project files, and nothing that steps outside them', () => {
        expect(isSourcePath('models/orders.yml')).toBe(true);
        expect(isSourcePath('dbt_project.yml')).toBe(true);
        expect(isSourcePath('macros/cents.sql')).toBe(true);
        expect(isSourcePath('models/../profiles.yml')).toBe(false);
        expect(isSourcePath('models/./x/../../.env.yml')).toBe(false);
        expect(isSourcePath('models//orders.yml')).toBe(false);
        expect(isSourcePath('profiles.yml')).toBe(false);
        expect(isSourcePath('/etc/models/x.yml')).toBe(false);
    });
});

describe('workspace pull request reconciliation', () => {
    const workspace = (index: number): SemanticStudioWorkspace => ({
        workspaceUuid: String(index),
        projectUuid: PROJECT_UUID,
        name: 'Update orders',
        threadUuid: String(index),
        agentUuid: null,
        owner: { userUuid: USER_UUID, name: 'Owner' },
        isMine: true,
        isActive: false,
        pullRequest: {
            url: `https://github.com/acme/orders/pull/${index}`,
            state: 'open',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        finishedAt: null,
    });

    it.each(['merged', 'closed'] as const)(
        'returns externally %s changes as finished',
        async (state) => {
            const context = setup();
            context.workspaces.push(workspace(1));
            context.getPullRequestState.mockResolvedValue(state);
            const result = await context.service.listWorkspaces(
                deployer,
                PROJECT_UUID,
            );
            expect(result.mine).toEqual([]);
            expect(result.recent[0].pullRequest?.state).toBe(state);
            expect(result.recent[0].isActive).toBe(false);
            expect(context.recordPullRequestState).toHaveBeenCalledWith(
                PROJECT_UUID,
                workspace(1).pullRequest?.url,
                state,
            );
        },
    );

    it('only checks five own unfinished pull requests, active first', async () => {
        const context = setup();
        context.workspaces.push(
            { ...workspace(0), isMine: false },
            { ...workspace(1), finishedAt: new Date() },
            { ...workspace(2), pullRequest: null },
            ...Array.from({ length: 7 }, (_, i) => workspace(i + 3)),
            { ...workspace(10), isActive: true },
        );
        await context.service.listWorkspaces(deployer, PROJECT_UUID);
        expect(context.getPullRequestState).toHaveBeenCalledTimes(5);
        expect(context.getPullRequestState.mock.calls[0]).toEqual([
            ORGANIZATION_UUID,
            { type: DbtProjectType.NONE },
            workspace(10).pullRequest?.url,
        ]);
    });

    it('keeps stored state on provider failure or unavailable state', async () => {
        const context = setup();
        context.workspaces.push(workspace(1), workspace(2));
        context.getPullRequestState.mockRejectedValueOnce(
            new Error('Unavailable'),
        );
        const result = await context.service.listWorkspaces(
            deployer,
            PROJECT_UUID,
        );
        expect(result.mine).toHaveLength(2);
        expect(context.recordPullRequestState).not.toHaveBeenCalled();
    });

    it('does not write an unchanged open state', async () => {
        const context = setup();
        context.workspaces.push(workspace(1));
        context.getPullRequestState.mockResolvedValue('open');
        await context.service.listWorkspaces(deployer, PROJECT_UUID);
        expect(context.recordPullRequestState).not.toHaveBeenCalled();
    });
});

describe('compiling a dbt change on its branch', () => {
    const OWN_PULL_REQUEST = 'https://github.com/acme/shop/pull/7';
    const onChange = (overrides: Parameters<typeof setup>[0] = {}) => {
        const context = setup({ dbtConnection: DBT_IN_GITHUB, ...overrides });
        context.setActiveWorkspace({
            threadUuid: 'thread',
            prUrl: OWN_PULL_REQUEST,
        });
        return context;
    };
    /** Stands in for the worker picking the queued compile up. */
    const runQueued = (context: ReturnType<typeof setup>, index = 0) =>
        context.service.compileBranch(
            context.queueBranchCompile.mock.calls[index][0],
        );

    it('queues a compile of the change on the saved pull request, and shows the person what its branch compiles to', async () => {
        const context = onChange();
        await context.service.queueBranchCompile(
            repoWriter,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        expect(context.queueBranchCompile).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: PROJECT_UUID,
                userUuid: repoWriter.userUuid,
                workspaceUuid: 'workspace-thread',
            }),
        );
        await runQueued(context);
        expect(context.findPullRequestBranch).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        expect(context.compileExploresFromBranch).toHaveBeenCalledWith(
            {
                userUuid: repoWriter.userUuid,
                organizationUuid: ORGANIZATION_UUID,
            },
            PROJECT_UUID,
            'studio-branch',
        );
        const explores = await context.service.findDevelopmentExplores(
            repoWriter,
            PROJECT_UUID,
        );
        expect(explores?.get(BRANCH_EXPLORE.name)).toEqual(BRANCH_EXPLORE);
    });

    it('queues nothing for a pull request that is not one of your changes, or on a project kept on the server', async () => {
        const other = onChange();
        await other.service.queueBranchCompile(
            repoWriter,
            PROJECT_UUID,
            'https://github.com/acme/shop/pull/8',
        );
        expect(other.queueBranchCompile).not.toHaveBeenCalled();
        const native = onChange({
            dbtConnection: { type: DbtProjectType.NONE },
        });
        await native.service.queueBranchCompile(
            deployer,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        expect(native.queueBranchCompile).not.toHaveBeenCalled();
    });

    it('drops a compile asked for before a newer one', async () => {
        const context = onChange();
        await context.service.queueBranchCompile(
            repoWriter,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        await context.service.queueBranchCompile(
            repoWriter,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        await runQueued(context, 0);
        expect(context.branchCompiles.get('workspace-thread')).toMatchObject({
            status: 'compiling',
            explores: null,
        });
        await runQueued(context, 1);
        expect(context.branchCompiles.get('workspace-thread')).toMatchObject({
            status: 'ready',
            branch: 'studio-branch',
        });
    });

    it('keeps the last good compile through a failed one, with what failed', async () => {
        const context = onChange();
        await context.service.queueBranchCompile(
            repoWriter,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        await runQueued(context, 0);
        context.compileExploresFromBranch.mockRejectedValueOnce(
            new Error('Compilation Error in model orders'),
        );
        await context.service.queueBranchCompile(
            repoWriter,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        await runQueued(context, 1);
        expect(context.branchCompiles.get('workspace-thread')).toMatchObject({
            status: 'failed',
            error: 'Compilation Error in model orders',
        });
        expect(
            (
                await context.service.findDevelopmentExplores(
                    repoWriter,
                    PROJECT_UUID,
                )
            )?.get(BRANCH_EXPLORE.name),
        ).toEqual(BRANCH_EXPLORE);
    });

    it('tells the person which change they are on and where its compile stands', async () => {
        const context = onChange();
        expect(
            await context.service.getCheckout(repoWriter, PROJECT_UUID),
        ).toMatchObject({
            workspaceUuid: 'workspace-thread',
            appliesAs: 'dbt_pull_request',
            branchCompile: null,
        });
        await context.service.compileCheckout(repoWriter, PROJECT_UUID);
        expect(
            (await context.service.getCheckout(repoWriter, PROJECT_UUID))
                ?.branchCompile,
        ).toMatchObject({ status: 'compiling', hasExplores: false });
        await runQueued(context);
        expect(
            (await context.service.getCheckout(repoWriter, PROJECT_UUID))
                ?.branchCompile,
        ).toMatchObject({
            status: 'ready',
            branch: 'studio-branch',
            hasExplores: true,
        });
        expect(
            await context.service.getCheckout(viewer, PROJECT_UUID),
        ).toBeNull();
        await expect(
            context.service.compileCheckout(viewer, PROJECT_UUID),
        ).rejects.toBeInstanceOf(ForbiddenError);
        context.setActiveWorkspace(null);
        expect(
            await context.service.getCheckout(repoWriter, PROJECT_UUID),
        ).toBeNull();
    });

    it('publishes the checked-out draft only once its latest edit compiled', async () => {
        const context = onChange();
        const publish = () =>
            context.service.publishCheckout(
                repoWriter,
                PROJECT_UUID,
                OWN_PULL_REQUEST,
            );
        await expect(publish()).rejects.toThrow(
            'This draft can be published once its latest edit compiles',
        );
        await context.service.compileCheckout(repoWriter, PROJECT_UUID);
        await expect(publish()).rejects.toBeInstanceOf(ParameterError);
        await runQueued(context);
        await expect(
            context.service.publishCheckout(
                repoWriter,
                PROJECT_UUID,
                'https://github.com/acme/shop/pull/8',
            ),
        ).rejects.toThrow(
            'This pull request is not the draft you have checked out',
        );
        await expect(
            context.service.publishCheckout(
                viewer,
                PROJECT_UUID,
                OWN_PULL_REQUEST,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(context.mergePullRequest).not.toHaveBeenCalled();
        expect(await publish()).toMatchObject({ merged: true });
        expect(context.mergePullRequest).toHaveBeenCalledWith({
            user: repoWriter,
            projectUuid: PROJECT_UUID,
            prUrl: OWN_PULL_REQUEST,
        });
        expect(context.recordPullRequestState).toHaveBeenCalledWith(
            PROJECT_UUID,
            OWN_PULL_REQUEST,
            'merged',
        );
    });

    it("says plainly when the pull request's branch cannot be read", async () => {
        const context = onChange();
        context.findPullRequestBranch.mockRejectedValueOnce(
            new ParameterError('Pull request #7 is already merged'),
        );
        await context.service.queueBranchCompile(
            repoWriter,
            PROJECT_UUID,
            OWN_PULL_REQUEST,
        );
        await runQueued(context);
        expect(context.compileExploresFromBranch).not.toHaveBeenCalled();
        expect(context.branchCompiles.get('workspace-thread')).toMatchObject({
            status: 'failed',
            error: "Could not read this draft's branch. Its pull request may be merged, closed or in another repository.",
        });
    });
});
