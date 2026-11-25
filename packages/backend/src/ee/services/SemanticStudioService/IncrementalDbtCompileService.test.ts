import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    ExploreType,
    NotFoundError,
    SupportedDbtAdapter,
    type Explore,
    type ExploreError,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import {
    readCompiledDbtManifest,
    saveCompiledDbtManifest,
} from '../../../services/ProjectService/compiledDbtManifest';
import { user } from '../../../services/ProjectService/ProjectService.mock';
import { type ApiCheckout } from '../AiWritebackService/providers/GithubProvider';
import { type DbtScriptChange } from './dbtManifestPatch';
import { IncrementalDbtCompileService } from './IncrementalDbtCompileService';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';

const repoWriter: SessionUser = {
    ...user,
    userUuid: '00000000-0000-0000-0000-000000000003',
    ability: new Ability<PossibleAbilities>([
        { subject: 'SourceCode', action: 'manage' },
    ]),
};

const TRY_OUT_EXPLORE: ExploreError = {
    name: 'try_out',
    label: 'Try out',
    errors: [],
};

const setup = ({
    exploreSummaries = [],
    latestCompileJob = null,
    checkout = null,
}: {
    exploreSummaries?: {
        name: string;
        type?: ExploreType;
        baseTable?: string;
    }[];
    /** The job of the project's last explore save. */
    latestCompileJob?: string | null;
    /** The project branch as Studio reads it. */
    checkout?: ApiCheckout | null;
} = {}) => {
    const files = new Map<string, Buffer>();
    const compileExploresFromManifest = vi.fn(
        async (): Promise<(Explore | ExploreError)[]> => [TRY_OUT_EXPLORE],
    );
    const saveExploresToCacheAndIndexCatalog = vi.fn(
        async (_args: {
            explores: (Explore | ExploreError)[];
            complete?: boolean;
            jobUuid?: string | null;
        }) => 'index-job',
    );
    const fileStorageClient = {
        isEnabled: () => true,
        uploadTxt: async (txt: Buffer, id: string) => {
            files.set(`${id}.txt`, txt);
            return `${id}.txt`;
        },
        getFileStream: async (fileId: string) => {
            const file = files.get(fileId);
            if (file === undefined) throw new NotFoundError('No file');
            return { stream: Readable.from([file]), contentDisposition: null };
        },
        deleteFile: async (fileId: string) => {
            files.delete(fileId);
        },
    };
    const service = new IncrementalDbtCompileService({
        projectModel: {
            get: async () => ({
                organizationUuid: ORGANIZATION_UUID,
                dbtConnection: {
                    type: DbtProjectType.GITHUB,
                    authorization_method: 'installation_id',
                    repository: 'acme/analytics',
                    branch: 'main',
                    project_sub_path: '/',
                },
            }),
            findExploresByBaseTables: async (_projectUuid, baseTables) =>
                exploreSummaries.flatMap(({ name, type, baseTable }) =>
                    baseTable !== undefined && baseTables.includes(baseTable)
                        ? [{ name, type: type ?? null }]
                        : [],
                ),
            findExploresFromCache: async () => ({}),
        },
        projectService: {
            compileExploresFromManifest,
            saveExploresToCacheAndIndexCatalog,
        },
        checker: {
            findExploreError: async () => {
                throw new Error('not used in these tests');
            },
        },
        fileStorageClient,
        projectCompileLogModel: {
            findLatestJobUuid: async () => latestCompileJob,
        },
        aiWritebackService: {
            openStudioCheckout: async () => {
                if (checkout === null) throw new Error('No checkout');
                return { checkout, root: '' };
            },
        },
    });
    return {
        service,
        fileStorageClient,
        compileExploresFromManifest,
        saveExploresToCacheAndIndexCatalog,
    };
};

describe('checking a dbt change against the compiled manifest', () => {
    const MODEL = {
        unique_id: 'model.shop.orders',
        resource_type: 'model',
        name: 'orders',
        package_name: 'shop',
        patch_path: 'shop://models/schema.yml',
        description: '',
        meta: {},
        columns: {},
    };
    const COMPILED = {
        commitSha: 'compiled-sha',
        manifest: {
            metadata: {
                dbt_schema_version:
                    'https://schemas.getdbt.com/dbt/manifest/v12.json',
                generated_at: '',
                adapter_type: 'postgres',
                project_name: 'shop',
            },
            nodes: { [MODEL.unique_id]: MODEL },
            metrics: {},
            docs: {},
        },
        exploresJobUuid: 'compile-job',
    };
    const SCHEMA = 'version: 2\nmodels:\n  - name: orders\n';
    /** A branch where one commit since the compile changed `path`; nothing changed since `head-sha`. */
    const branchWith = (
        path: string,
        next: string,
        headCommitSha: string | null,
    ): DbtScriptChange => ({
        edits: new Map(),
        readHead: async (at) => (at === path ? next : null),
        readAt: async (at, commitSha) => {
            if (at !== path) return null;
            return commitSha === COMPILED.commitSha ? SCHEMA : next;
        },
        listChangedSince: async (commitSha) =>
            commitSha === 'head-sha' ? [] : [path],
        headCommitSha,
    });
    const check = async (change: DbtScriptChange) => {
        const context = setup();
        await saveCompiledDbtManifest(
            context.fileStorageClient,
            PROJECT_UUID,
            COMPILED,
        );
        const result = await context.service.checkDbtScriptChange(
            repoWriter,
            PROJECT_UUID,
            change,
            { checkQueries: false },
        );
        const compiled = await readCompiledDbtManifest(
            context.fileStorageClient,
            PROJECT_UUID,
        );
        return { context, result, compiled };
    };
    const described = `${SCHEMA}    description: Orders\n`;

    it('moves the compiled manifest on to the project branch head, so a save checks only its own change', async () => {
        const { context, result, compiled } = await check(
            branchWith('models/schema.yml', described, 'head-sha'),
        );
        expect(compiled?.commitSha).toBe('head-sha');
        expect(compiled?.manifest.nodes[MODEL.unique_id]).toMatchObject({
            description: 'Orders',
        });
        expect(result).toEqual({
            status: 'passed',
            changedModels: [],
            explores: [],
        });
        expect(context.compileExploresFromManifest).not.toHaveBeenCalled();
    });

    it('leaves the compiled manifest alone from a pull request branch', async () => {
        const { context, result, compiled } = await check(
            branchWith('models/schema.yml', described, null),
        );
        expect(compiled?.commitSha).toBe(COMPILED.commitSha);
        expect(result).toMatchObject({
            status: 'passed',
            changedModels: ['orders'],
        });
        expect(context.compileExploresFromManifest).toHaveBeenCalledTimes(1);
    });

    it('leaves the compiled manifest alone when only dbt can parse what changed', async () => {
        const { result, compiled } = await check(
            branchWith('models/orders.sql', 'select 1', 'head-sha'),
        );
        expect(compiled?.commitSha).toBe(COMPILED.commitSha);
        expect(result).toEqual({
            status: 'unsupported',
            reason: 'models/orders.sql needs dbt to parse',
        });
    });
});

describe('compiling after a merge', () => {
    const model = (name: string, meta: Record<string, unknown> = {}) => ({
        unique_id: `model.shop.${name}`,
        resource_type: 'model',
        name,
        package_name: 'shop',
        patch_path: `shop://models/${name}.yml`,
        description: '',
        meta,
        columns: {},
    });
    const STORED = {
        commitSha: 'compiled-sha',
        manifest: {
            metadata: {
                dbt_schema_version:
                    'https://schemas.getdbt.com/dbt/manifest/v12.json',
                generated_at: '',
                adapter_type: 'postgres',
                project_name: 'shop',
            },
            nodes: Object.fromEntries(
                [
                    model('orders', {
                        joins: [{ join: 'customers' }, { join: 'payments' }],
                    }),
                    model('customers'),
                    model('payments'),
                ].map((node) => [node.unique_id, node]),
            ),
            metrics: {},
            docs: {},
        },
        exploresJobUuid: 'compile-job',
    };
    const explore = (name: string, baseTable = name): Explore => ({
        name,
        label: name,
        tags: [],
        baseTable,
        joinedTables: [],
        tables: {},
        targetDatabase: SupportedDbtAdapter.POSTGRES,
    });
    const schemaOf = (path: string) =>
        path.endsWith('.sql')
            ? 'select 1'
            : `version: 2\nmodels:\n  - name: ${path.slice('models/'.length, -'.yml'.length)}\n`;
    /** The project branch at `head-sha`, where `changes` are the files changed since the compile. */
    const branchWith = (changes: Record<string, string>): ApiCheckout => ({
        prUrl: null,
        branch: 'main',
        baseBranch: null,
        headSha: 'head-sha',
        listFiles: async () => [],
        readFile: async (path) => changes[path] ?? null,
        readFileAt: async (path, commitSha) => {
            if (!(path in changes)) return null;
            return commitSha === 'head-sha' ? changes[path] : schemaOf(path);
        },
        listFilesChangedSince: async () => Object.keys(changes),
    });
    const DESCRIBED = {
        'models/customers.yml': `${schemaOf('models/customers.yml')}    description: Who buys\n`,
    };
    const SUMMARIES = ['orders', 'customers', 'payments'].map((name) => ({
        name,
        baseTable: name,
    }));
    const compileAfterMerge = async ({
        changes = DESCRIBED,
        latestCompileJob = 'compile-job',
        exploreSummaries = SUMMARIES,
        compiled = [
            explore('orders'),
            explore('customers'),
            explore('payments'),
        ],
        checked = null,
    }: {
        /** What a check of the pull request saw changed and compiled to, before it merged. */
        checked?: {
            changes: Record<string, string>;
            explores: (Explore | ExploreError)[];
        } | null;
        changes?: Record<string, string>;
        latestCompileJob?: string | null;
        exploreSummaries?: {
            name: string;
            type?: ExploreType;
            baseTable?: string;
        }[];
        compiled?: (Explore | ExploreError)[];
    } = {}) => {
        const context = setup({
            latestCompileJob,
            exploreSummaries,
            checkout: branchWith(changes),
        });
        context.compileExploresFromManifest.mockResolvedValue(compiled);
        await saveCompiledDbtManifest(
            context.fileStorageClient,
            PROJECT_UUID,
            STORED,
        );
        if (checked) {
            context.compileExploresFromManifest.mockResolvedValueOnce(
                checked.explores,
            );
            const pullRequest = branchWith(checked.changes);
            await context.service.checkDbtScriptChange(
                repoWriter,
                PROJECT_UUID,
                {
                    edits: new Map(),
                    readHead: (path) => pullRequest.readFile(path),
                    readAt: (path, commitSha) =>
                        pullRequest.readFileAt(path, commitSha),
                    listChangedSince: () =>
                        pullRequest.listFilesChangedSince(''),
                    headCommitSha: null,
                },
                { checkQueries: false },
            );
        }
        const result = await context.service.compileAfterMerge(
            repoWriter,
            PROJECT_UUID,
            'merge-job',
        );
        const stored = await readCompiledDbtManifest(
            context.fileStorageClient,
            PROJECT_UUID,
        );
        return { context, result, stored };
    };

    it('saves only the explores a YAML change reaches, and moves the manifest on with them', async () => {
        const { context, result, stored } = await compileAfterMerge();
        // Orders joins customers, so it changes too; payments only compiles to be joined.
        expect(context.compileExploresFromManifest).toHaveBeenCalledWith(
            repoWriter,
            PROJECT_UUID,
            expect.anything(),
            null,
            [
                'model.shop.orders',
                'model.shop.customers',
                'model.shop.payments',
            ],
        );
        expect(
            context.saveExploresToCacheAndIndexCatalog,
        ).toHaveBeenCalledTimes(1);
        expect(
            context.saveExploresToCacheAndIndexCatalog.mock.calls[0][0],
        ).toMatchObject({
            explores: [explore('orders'), explore('customers')],
            complete: false,
            jobUuid: 'merge-job',
        });
        expect(result).toEqual({
            indexCatalogJobUuid: 'index-job',
            errorCount: 0,
            total: 2,
        });
        expect(stored).toMatchObject({
            commitSha: 'head-sha',
            exploresJobUuid: 'merge-job',
        });
        expect(stored?.manifest.nodes['model.shop.customers']).toMatchObject({
            description: 'Who buys',
        });
    });

    it('saves what the merged change was checked to compile to, without compiling it again', async () => {
        const checkedExplores = [
            { ...explore('orders'), label: 'Checked orders' },
            { ...explore('customers'), label: 'Checked customers' },
            explore('payments'),
        ];
        const { context, result } = await compileAfterMerge({
            checked: { changes: DESCRIBED, explores: checkedExplores },
        });
        // Once for the check; the compile after the merge reuses it.
        expect(context.compileExploresFromManifest).toHaveBeenCalledTimes(1);
        expect(
            context.saveExploresToCacheAndIndexCatalog.mock.calls[0][0],
        ).toMatchObject({ explores: checkedExplores.slice(0, 2) });
        expect(result).toMatchObject({ total: 2 });
    });

    it('compiles again when the merged change differs from the checked one', async () => {
        const { context } = await compileAfterMerge({
            checked: {
                changes: {
                    'models/customers.yml': `${schemaOf('models/customers.yml')}    description: Older\n`,
                },
                explores: [explore('orders'), explore('customers')],
            },
        });
        expect(context.compileExploresFromManifest).toHaveBeenCalledTimes(2);
        expect(
            context.saveExploresToCacheAndIndexCatalog.mock.calls[0][0],
        ).toMatchObject({
            explores: [explore('orders'), explore('customers')],
        });
    });

    it('stays incremental when a reached model has pre-aggregate explores in the cache', async () => {
        const { result } = await compileAfterMerge({
            exploreSummaries: [
                ...SUMMARIES,
                {
                    name: '__preagg__customers__daily',
                    type: ExploreType.PRE_AGGREGATE,
                    baseTable: 'customers',
                },
            ],
        });
        expect(result).not.toBeNull();
    });

    it.each([
        [
            'only dbt can parse the change',
            { changes: { 'models/customers.sql': 'select 2' } },
        ],
        [
            'something else saved explores since the manifest was compiled',
            { latestCompileJob: 'cli-deploy-job' },
        ],
        [
            'the change adds or removes an explore',
            {
                exploreSummaries: [
                    ...SUMMARIES,
                    { name: 'vip_customers', baseTable: 'customers' },
                ],
            },
        ],
        [
            'an explore it reaches does not compile',
            {
                compiled: [
                    explore('orders'),
                    { name: 'customers', label: 'customers', errors: [] },
                ],
            },
        ],
    ])('runs the full compile when %s', async (_label, options) => {
        const { context, result, stored } = await compileAfterMerge(options);
        expect(result).toBeNull();
        expect(
            context.saveExploresToCacheAndIndexCatalog,
        ).not.toHaveBeenCalled();
        expect(stored).toEqual(STORED);
    });
});
