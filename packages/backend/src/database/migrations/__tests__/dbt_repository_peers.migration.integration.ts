import { Ability, subject } from '@casl/ability';
import {
    DbtProjectType,
    EMPTY_WAREHOUSE_LOCATION,
    FeatureFlags,
    getWarehouseLocation,
    type DbtProjectConfig,
    type PossibleAbilities,
    type ProjectDbtSourceSummary,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { ProjectDbtSourcesService } from '../../../services/ProjectDbtSourcesService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { type DbProjectDbtSource } from '../../entities/projectDbtSources';
import { down, up } from '../20261022160000_add_dbt_repository_peers';

type PeerFixture = DbProjectDbtSource & {
    dbt_repository_uuid: string | null;
    dbt_project_name: string | null;
    dbt_project_name_conflict: string | null;
    warehouse_connection_uuid: string | null;
    membership_role: 'publish' | 'dependency_only';
    refresh_policy: 'git_refresh' | 'ci_managed';
    role: 'main' | 'extra';
    repository_fill_state:
        | 'pending'
        | 'registered'
        | 'not_git'
        | 'cannot_decrypt'
        | 'cannot_parse'
        | 'failed';
    repository_fill_attempted_at: Date | null;
    dbt_project_name_initialized_at: Date | null;
};

const inSequence = <T>(items: T[], step: (item: T) => Promise<void>) =>
    items.reduce<Promise<void>>(
        (previous, item) => previous.then(() => step(item)),
        Promise.resolve(),
    );

const ACTIVE_SECRET = 'peer-migration-active-fixture-secret';
let migrated: MigratedDatabase;
let database: Knex;
let organization: { organization_id: number; organization_uuid: string };

const encrypt = (value: unknown, secret = ACTIVE_SECRET) =>
    new EncryptionUtil({
        lightdashConfig: {
            lightdashSecret: secret,
            lightdashSecrets: { active: secret, fallbacks: [], all: [secret] },
        },
    }).encrypt(JSON.stringify(value));

const gitConfig = (
    repository = 'Fixture/Analytics',
    host = 'git.example.test',
) => ({
    type: 'github',
    repository,
    host_domain: host,
    branch: 'Main',
    personal_access_token: 'synthetic-token',
    project_sub_path: '/',
});

const project = async (type = 'none', connection: Buffer | null = null) => {
    const [row] = await database<{
        project_uuid: string;
        dbt_source_uuid: string;
        name: string;
        organization_id: number;
        dbt_connection_type: DbtProjectType;
        dbt_connection: Buffer | null;
    }>('projects')
        .insert({
            name: 'Peer migration fixture',
            organization_id: organization.organization_id,
            dbt_connection_type: type as DbtProjectType,
            dbt_connection: connection,
        })
        .returning(['project_uuid', 'dbt_source_uuid']);
    return row as { project_uuid: string; dbt_source_uuid: string };
};

const source = async (
    projectUuid: string,
    values: {
        type?: string | null;
        connection?: Buffer | null;
        warehouseConnectionUuid?: string | null;
        isPrimary?: boolean;
        uuid?: string;
    } = {},
) => {
    const uuid = values.uuid ?? randomUUID();
    await database<PeerFixture>('project_dbt_sources').insert({
        project_dbt_source_uuid: uuid,
        project_uuid: projectUuid,
        name: `source_${uuid}`,
        dbt_connection_type: (values.type ?? 'github') as DbtProjectType,
        dbt_connection:
            values.connection === undefined
                ? Buffer.from('synthetic-unreadable-connection')
                : values.connection,
        warehouse_connection_uuid: values.warehouseConnectionUuid ?? null,
        is_primary: values.isPrimary ?? false,
        precedence: 7,
        warehouse_database: 'fixture_database',
        warehouse_schema: 'fixture_schema',
    });
    return uuid;
};

const catalog = (
    projectUuid: string,
    sourceUuid: string,
    name: string,
    group = 'original',
) =>
    database('dbt_source_ref_catalogs').insert({
        project_uuid: projectUuid,
        dbt_source_uuid: sourceUuid,
        project_name: name,
        connection_group: group,
        dbt_version: 'v1.9',
        status: 'confirmed',
        nodes: '[]',
        nodes_digest: 'fixture-digest',
        compile_job_uuid: null,
    });

const explore = (
    projectUuid: string,
    sourceUuid: string | null,
    packageName: string,
) => {
    const name = `orders_${randomUUID()}`;
    return database('cached_explore').insert({
        project_uuid: projectUuid,
        name,
        table_names: ['orders'],
        explore: {
            baseTable: 'orders',
            tables: {
                orders: {
                    dbtSourceUuid: sourceUuid,
                    dbtPackageName: packageName,
                },
                unrelated: {
                    dbtSourceUuid: sourceUuid,
                    dbtPackageName: 'ignored_dependency',
                },
            },
        },
    });
};

const peers = (projectUuid: string) =>
    database<PeerFixture>('project_dbt_sources').where(
        'project_uuid',
        projectUuid,
    );
const peer = (uuid: string) =>
    database<PeerFixture>('project_dbt_sources')
        .where('project_dbt_source_uuid', uuid)
        .first()
        .then((row) => {
            if (!row) throw new Error('Missing peer fixture');
            return row;
        });

type FrozenLegacyDbtSource = {
    project_dbt_source_uuid: string;
    project_uuid: string;
    name: string;
    is_primary: boolean;
    precedence: number;
    dbt_connection_type: DbtProjectType | null;
    dbt_connection: Buffer | null;
    warehouse_database: string | null;
    warehouse_schema: string | null;
    created_at: Date;
    updated_at: Date;
};

const frozenLegacyGitIdentity = (connection: DbtProjectConfig | null) => {
    if (
        connection &&
        (connection.type === DbtProjectType.GITHUB ||
            connection.type === DbtProjectType.GITLAB ||
            connection.type === DbtProjectType.BITBUCKET ||
            connection.type === DbtProjectType.AZURE_DEVOPS)
    ) {
        return {
            repository: connection.repository,
            branch: connection.branch,
            projectSubPath: connection.project_sub_path,
        };
    }
    return { repository: null, branch: null, projectSubPath: null };
};

const toFrozenLegacySourceSummary = (
    row: FrozenLegacyDbtSource,
    encryptionUtil: EncryptionUtil,
): ProjectDbtSourceSummary => {
    let dbtConnection: DbtProjectConfig | null = null;
    let hasCredentialError = false;
    if (row.dbt_connection) {
        try {
            const parsed = JSON.parse(
                encryptionUtil.decrypt(row.dbt_connection),
            ) as DbtProjectConfig;
            if (
                parsed.type === DbtProjectType.GITHUB &&
                !parsed.authorization_method
            ) {
                dbtConnection = {
                    ...parsed,
                    authorization_method:
                        parsed.installation_id && !parsed.personal_access_token
                            ? 'installation_id'
                            : 'personal_access_token',
                };
            } else {
                dbtConnection = parsed;
            }
        } catch {
            hasCredentialError = true;
        }
    }
    return {
        projectDbtSourceUuid: row.project_dbt_source_uuid,
        name: row.name,
        isPrimary: row.is_primary,
        precedence: row.precedence,
        type: dbtConnection?.type ?? null,
        warehouseLocation: {
            database: row.warehouse_database,
            schema: row.warehouse_schema,
        },
        hasCredentialError,
        ...frozenLegacyGitIdentity(dbtConnection),
    };
};

const readFrozenLegacyResponseJson = async (
    projectUuid: string,
    projectModel: ProjectModel,
    encryptionUtil: EncryptionUtil,
) => {
    const legacyRows = await database<FrozenLegacyDbtSource>(
        'project_dbt_sources',
    )
        .select(
            'project_dbt_source_uuid',
            'project_uuid',
            'name',
            'is_primary',
            'precedence',
            'dbt_connection_type',
            'dbt_connection',
            'warehouse_database',
            'warehouse_schema',
            'created_at',
            'updated_at',
        )
        .where('project_uuid', projectUuid)
        .orderBy('precedence', 'asc')
        .orderBy('name', 'asc');
    const legacyProject = await projectModel.get(projectUuid);
    const identity = await projectModel.getDbtSourceIdentity(projectUuid);
    const primary: ProjectDbtSourceSummary = {
        projectDbtSourceUuid: identity.dbtSourceUuid,
        name: identity.dbtSourceName,
        isPrimary: true,
        precedence: 0,
        type: legacyProject.dbtConnection.type,
        warehouseLocation: legacyProject.warehouseConnection
            ? getWarehouseLocation(legacyProject.warehouseConnection)
            : EMPTY_WAREHOUSE_LOCATION,
        hasCredentialError: false,
        ...frozenLegacyGitIdentity(legacyProject.dbtConnection),
    };
    const legacySources = [
        primary,
        ...legacyRows.map((row) =>
            toFrozenLegacySourceSummary(row, encryptionUtil),
        ),
    ];
    return {
        sources: JSON.stringify({ status: 'ok', results: legacySources }),
        project: JSON.stringify({ status: 'ok', results: legacyProject }),
        sourceCount: legacySources.length,
    };
};

beforeAll(async () => {
    migrated = await createMigratedDatabase(undefined, { min: 0, max: 1 });
    database = migrated.database;
});

beforeEach(async () => {
    vi.stubEnv('LIGHTDASH_SECRET', undefined);
    vi.stubEnv('LIGHTDASH_SECRET_FALLBACKS', undefined);
    await down(database);
    [organization] = await database('organizations')
        .insert({ organization_name: 'Peer migration fixture' })
        .returning(['organization_id', 'organization_uuid']);
});

afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (organization)
        await database('organizations')
            .where('organization_id', organization.organization_id)
            .delete();
});

afterAll(async () => migrated?.destroy());

test('keeps no-source and main-only Git projects invisible to legacy source queries', async () => {
    const cli = await project();
    const git = await project('github', encrypt(gitConfig()));
    const before = await database('projects')
        .whereIn('project_uuid', [cli.project_uuid, git.project_uuid])
        .orderBy('project_uuid');
    await up(database);
    expect(await peers(cli.project_uuid)).toEqual([]);
    expect(await peers(git.project_uuid)).toEqual([]);
    expect(
        await database('projects')
            .whereIn('project_uuid', [cli.project_uuid, git.project_uuid])
            .orderBy('project_uuid'),
    ).toEqual(before);
});

test('matches the frozen legacy source response and admin project JSON after Step A with the peer flag off', async () => {
    const noSources = await project('none', encrypt({ type: 'none' }));
    const cli = await project(
        'dbt',
        encrypt({ type: 'dbt', project_dir: '/synthetic/dbt' }),
    );
    const git = await project('github', encrypt(gitConfig('Fixture/Main')));
    const duplicates = await project(
        'github',
        encrypt(gitConfig('Fixture/DuplicateMain')),
    );
    const extra = await source(git.project_uuid, {
        connection: encrypt(gitConfig()),
    });
    const duplicateA = await source(duplicates.project_uuid, {
        connection: encrypt(gitConfig()),
    });
    const duplicateB = await source(duplicates.project_uuid, {
        connection: encrypt(gitConfig()),
    });
    await catalog(git.project_uuid, extra, 'Known_Project');
    await catalog(
        duplicates.project_uuid,
        duplicates.dbt_source_uuid,
        'Duplicate_Project',
    );
    await catalog(duplicates.project_uuid, duplicateA, 'DUPLICATE_PROJECT');
    await catalog(duplicates.project_uuid, duplicateB, 'duplicate_project');

    const config = {
        ...lightdashConfigMock,
        lightdashSecret: ACTIVE_SECRET,
        lightdashSecrets: {
            active: ACTIVE_SECRET,
            fallbacks: [],
            all: [ACTIVE_SECRET],
        },
    };
    const encryptionUtil = new EncryptionUtil({ lightdashConfig: config });
    const featureFlagService = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: false,
        })),
    };
    const projectModel = new ProjectModel({
        database,
        lightdashConfig: config,
        encryptionUtil,
    });
    const ability = new Ability<PossibleAbilities>([
        {
            subject: 'Project',
            action: ['manage', 'view'],
            conditions: { organizationUuid: organization.organization_uuid },
        },
    ]);
    const account = fromSession(
        {
            ...defaultSessionUser,
            userUuid: randomUUID(),
            organizationUuid: organization.organization_uuid,
            ability,
        },
        'session-cookie',
    );
    const fixtures = [
        { name: 'no sources', project: noSources, sourceCount: 1 },
        { name: 'CLI main', project: cli, sourceCount: 1 },
        { name: 'Git main with extras', project: git, sourceCount: 2 },
        {
            name: 'duplicate project names',
            project: duplicates,
            sourceCount: 3,
        },
    ];
    expect(await database.schema.hasColumn('project_dbt_sources', 'role')).toBe(
        false,
    );
    const legacyBaseline = new Map<
        string,
        Awaited<ReturnType<typeof readFrozenLegacyResponseJson>>
    >();
    await inSequence(fixtures, async (fixture) => {
        const resource = subject('Project', {
            organizationUuid: organization.organization_uuid,
            projectUuid: fixture.project.project_uuid,
        });
        expect(ability.can('manage', resource)).toBe(true);
        expect(ability.can('view', resource)).toBe(true);
        const legacyResponse = await readFrozenLegacyResponseJson(
            fixture.project.project_uuid,
            projectModel,
            encryptionUtil,
        );
        expect(legacyResponse.sourceCount).toBe(fixture.sourceCount);
        legacyBaseline.set(fixture.project.project_uuid, legacyResponse);
    });

    await up(database);
    expect(await database.schema.hasColumn('project_dbt_sources', 'role')).toBe(
        true,
    );

    const sourceModel = new ProjectDbtSourcesModel({
        database,
        encryptionUtil,
    });
    const analytics = { track: vi.fn() };
    const service = new ProjectDbtSourcesService({
        lightdashConfig: config,
        analytics: analytics as never,
        projectModel,
        projectDbtSourcesModel: sourceModel,
        dbtSourceRefCatalogModel: {} as never,
        githubAppInstallationsModel: {} as never,
        featureFlagService,
        featureFlagModel: featureFlagService,
    });
    const stepAResponseJson = async (projectUuid: string) => {
        const sources = await service.getProjectDbtSources(
            account,
            projectUuid,
        );
        return {
            sources: JSON.stringify({ status: 'ok', results: sources }),
            project: JSON.stringify({
                status: 'ok',
                results: await projectModel.get(projectUuid),
            }),
            sourceCount: sources.length,
        };
    };

    await inSequence([extra, duplicateA, duplicateB], async (uuid) => {
        expect(await peer(uuid)).toMatchObject({
            dbt_project_name: null,
            dbt_project_name_conflict: null,
            dbt_repository_uuid: null,
            role: 'extra',
            repository_fill_state: 'pending',
            repository_fill_attempted_at: null,
            dbt_project_name_initialized_at: null,
        });
    });
    expect(await database('dbt_repositories')).toEqual([]);
    await inSequence(fixtures, async (fixture) => {
        expect(await stepAResponseJson(fixture.project.project_uuid)).toEqual(
            legacyBaseline.get(fixture.project.project_uuid),
        );
    });

    await database<PeerFixture>('project_dbt_sources')
        .whereIn('project_dbt_source_uuid', [extra, duplicateA, duplicateB])
        .update({
            membership_role: 'dependency_only',
            refresh_policy: 'ci_managed',
        });
    const [repository] = await database('dbt_repositories')
        .insert({
            organization_uuid: organization.organization_uuid,
            provider: 'github',
            host: 'git.example.test',
            owner: 'fixture',
            name: 'analytics',
            credential_source_uuid: extra,
            default_branch: 'MetadataBranch',
            dbt_project_name: 'registry_metadata',
            is_shared: true,
        })
        .returning('dbt_repository_uuid');
    await database<PeerFixture>('project_dbt_sources')
        .where('project_dbt_source_uuid', extra)
        .update({
            dbt_repository_uuid: repository.dbt_repository_uuid,
            dbt_project_name: 'registry_metadata',
            repository_fill_state: 'registered',
            repository_fill_attempted_at: new Date(),
            dbt_project_name_initialized_at: new Date(),
        });
    await inSequence(fixtures, async (fixture) => {
        expect(await stepAResponseJson(fixture.project.project_uuid)).toEqual(
            legacyBaseline.get(fixture.project.project_uuid),
        );
    });
    expect(featureFlagService.get).toHaveBeenCalledWith(
        expect.objectContaining({ featureFlagId: FeatureFlags.PeerDbtSources }),
    );
    expect(analytics.track).not.toHaveBeenCalled();
});

const pendingMetadata = {
    dbt_repository_uuid: null,
    dbt_project_name: null,
    dbt_project_name_conflict: null,
    membership_role: 'publish',
    refresh_policy: 'ci_managed',
    role: 'extra',
    repository_fill_state: 'pending',
    repository_fill_attempted_at: null,
    dbt_project_name_initialized_at: null,
};

test.each([undefined, 'invalid-json'])(
    'adds only schema without a secret and with fallback configuration %s',
    async (fallbacks) => {
        vi.stubEnv('LIGHTDASH_SECRET_FALLBACKS', fallbacks);
        const main = await project(
            'github',
            Buffer.from('synthetic-unreadable-main-connection'),
        );
        const first = await source(main.project_uuid);
        const second = await source(main.project_uuid, {
            type: 'none',
            connection: null,
        });
        await catalog(main.project_uuid, first, 'Known_Project');
        await explore(main.project_uuid, first, 'Known_Project');
        const beforeSources = await peers(main.project_uuid).orderBy(
            'project_dbt_source_uuid',
        );
        const beforeProject = await database('projects')
            .where('project_uuid', main.project_uuid)
            .first();
        const beforeCatalog = await database('dbt_source_ref_catalogs').where(
            'project_uuid',
            main.project_uuid,
        );
        const beforeExplores = await database('cached_explore').where(
            'project_uuid',
            main.project_uuid,
        );
        const statements: string[] = [];
        const capture = ({ sql }: { sql: string }) => statements.push(sql);
        database.on('query', capture);
        try {
            await up(database);
            await up(database);
        } finally {
            database.removeListener('query', capture);
        }
        expect(statements).toContain("SET lock_timeout = '5s'");
        expect(statements.join('\n')).not.toMatch(
            /dbt_source_ref_catalogs|cached_explore|\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/i,
        );
        expect(
            await peers(main.project_uuid).orderBy('project_dbt_source_uuid'),
        ).toEqual(beforeSources.map((row) => ({ ...row, ...pendingMetadata })));
        expect(await peer(first)).toMatchObject(pendingMetadata);
        expect(await peer(second)).toMatchObject(pendingMetadata);
        expect(await database('dbt_repositories')).toEqual([]);
        expect(
            await database('projects')
                .where('project_uuid', main.project_uuid)
                .first(),
        ).toEqual(beforeProject);
        expect(
            await database('dbt_source_ref_catalogs').where(
                'project_uuid',
                main.project_uuid,
            ),
        ).toEqual(beforeCatalog);
        expect(
            await database('cached_explore').where(
                'project_uuid',
                main.project_uuid,
            ),
        ).toEqual(beforeExplores);
    },
);

test('defaults existing and new sources to extra and pending without creating main rows', async () => {
    const main = await project();
    const existing = await source(main.project_uuid);
    await up(database);
    const added = await source(main.project_uuid);
    expect(await peers(main.project_uuid)).toHaveLength(2);
    expect(await peer(existing)).toMatchObject(pendingMetadata);
    expect(await peer(added)).toMatchObject(pendingMetadata);
    expect(await database('project_dbt_sources').where('role', 'main')).toEqual(
        [],
    );
    const columns = await database('information_schema.columns')
        .where({ table_schema: 'public', table_name: 'project_dbt_sources' })
        .whereIn('column_name', [
            'role',
            'repository_fill_state',
            'repository_fill_attempted_at',
            'dbt_project_name_initialized_at',
        ])
        .select('column_name', 'data_type', 'is_nullable', 'column_default');
    expect(columns).toEqual(
        expect.arrayContaining([
            {
                column_name: 'role',
                data_type: 'text',
                is_nullable: 'NO',
                column_default: "'extra'::text",
            },
            {
                column_name: 'repository_fill_state',
                data_type: 'text',
                is_nullable: 'NO',
                column_default: "'pending'::text",
            },
            {
                column_name: 'repository_fill_attempted_at',
                data_type: 'timestamp with time zone',
                is_nullable: 'YES',
                column_default: null,
            },
            {
                column_name: 'dbt_project_name_initialized_at',
                data_type: 'timestamp with time zone',
                is_nullable: 'YES',
                column_default: null,
            },
        ]),
    );
    await inSequence(
        ['main', 'extra'] as PeerFixture['role'][],
        async (role) => {
            await database<PeerFixture>('project_dbt_sources')
                .where('project_dbt_source_uuid', added)
                .update({ role });
            expect((await peer(added)).role).toBe(role);
        },
    );
    await inSequence(
        [
            'pending',
            'registered',
            'not_git',
            'cannot_decrypt',
            'cannot_parse',
            'failed',
        ] as PeerFixture['repository_fill_state'][],
        async (repositoryFillState) => {
            await database<PeerFixture>('project_dbt_sources')
                .where('project_dbt_source_uuid', added)
                .update({ repository_fill_state: repositoryFillState });
            expect((await peer(added)).repository_fill_state).toBe(
                repositoryFillState,
            );
        },
    );
    await inSequence(['role', 'repository_fill_state'], async (column) => {
        await expect(
            database('project_dbt_sources')
                .where('project_dbt_source_uuid', added)
                .update({ [column]: 'invalid' }),
        ).rejects.toMatchObject({ code: '23514' });
        await expect(
            database('project_dbt_sources')
                .where('project_dbt_source_uuid', added)
                .update({ [column]: null }),
        ).rejects.toMatchObject({ code: '23502' });
    });
});

test('preserves legacy sources through up/down/up and leaves runtime metadata unchanged on retry', async () => {
    const main = await project();
    const uuid = await source(main.project_uuid);
    const before = await peer(uuid);
    await up(database);
    const [repository] = await database('dbt_repositories')
        .insert({
            organization_uuid: organization.organization_uuid,
            provider: 'github',
            host: 'git.example.test',
            owner: 'fixture',
            name: 'runtime-repository',
            dbt_project_name: 'runtime_name',
            default_branch: 'runtime-branch',
            credential_source_uuid: uuid,
        })
        .returning('*');
    const initializedAt = new Date('2026-10-22T16:00:00.000Z');
    await database<PeerFixture>('project_dbt_sources')
        .where('project_dbt_source_uuid', uuid)
        .update({
            dbt_repository_uuid: repository.dbt_repository_uuid,
            dbt_project_name: 'runtime_name',
            membership_role: 'dependency_only',
            refresh_policy: 'git_refresh',
            repository_fill_state: 'cannot_decrypt',
            repository_fill_attempted_at: initializedAt,
            dbt_project_name_initialized_at: initializedAt,
        });
    const filled = await peer(uuid);
    await up(database);
    expect(await peer(uuid)).toEqual(filled);
    expect(await database('dbt_repositories')).toEqual([repository]);
    await down(database);
    await down(database);
    expect(await peer(uuid)).toEqual(before);
    expect(await database.schema.hasTable('dbt_repositories')).toBe(false);
    await inSequence(Object.keys(pendingMetadata), async (column) => {
        expect(
            await database.schema.hasColumn('project_dbt_sources', column),
        ).toBe(false);
    });
    await up(database);
    expect(await peer(uuid)).toEqual({ ...before, ...pendingMetadata });
});

test.each(['null connection', 'main role'])(
    'blocks rollback before dropping any schema when a source has %s',
    async (kind) => {
        const main = await project();
        const uuid = await source(main.project_uuid);
        await up(database);
        if (kind === 'null connection') {
            await database<PeerFixture>('project_dbt_sources')
                .where('project_dbt_source_uuid', uuid)
                .update({ dbt_connection: null });
        } else {
            await database<PeerFixture>('project_dbt_sources')
                .where('project_dbt_source_uuid', uuid)
                .update({ role: 'main' });
        }
        const before = await peer(uuid);
        await expect(down(database)).rejects.toThrow(/^irreversible:/);
        expect(await peer(uuid)).toEqual(before);
        expect(await database.schema.hasTable('dbt_repositories')).toBe(true);
        await inSequence(Object.keys(pendingMetadata), async (column) => {
            expect(
                await database.schema.hasColumn('project_dbt_sources', column),
            ).toBe(true);
        });
        await database<PeerFixture>('project_dbt_sources')
            .where('project_dbt_source_uuid', uuid)
            .update({
                role: 'extra',
                dbt_connection: Buffer.from('synthetic-connection'),
            });
        await down(database);
        expect(await database.schema.hasTable('dbt_repositories')).toBe(false);
    },
);

test('guards null connections even before the role column exists', async () => {
    const main = await project();
    const uuid = await source(main.project_uuid, { connection: null });
    await expect(down(database)).rejects.toThrow(/^irreversible:/);
    expect((await peer(uuid)).dbt_connection).toBeNull();
    expect(await database.schema.hasColumn('project_dbt_sources', 'role')).toBe(
        false,
    );
});

test('keeps peer names unique within a warehouse connection and permits names on different connections', async () => {
    const main = await project();
    const [connection] = await database('warehouse_connections')
        .insert({
            project_uuid: main.project_uuid,
            name: 'Fixture connection',
            is_original: false,
            warehouse_type: 'postgres',
            encrypted_credentials: Buffer.from('synthetic-warehouse-config'),
        })
        .returning('warehouse_connection_uuid');
    const original = await source(main.project_uuid);
    const extra = await source(main.project_uuid, {
        warehouseConnectionUuid: connection.warehouse_connection_uuid,
    });
    const duplicate = await source(main.project_uuid);
    await up(database);
    await database<PeerFixture>('project_dbt_sources')
        .whereIn('project_dbt_source_uuid', [original, extra])
        .update({ dbt_project_name: 'same' });
    expect((await peer(original)).dbt_project_name).toBe('same');
    expect((await peer(extra)).dbt_project_name).toBe('same');
    await expect(
        database<PeerFixture>('project_dbt_sources')
            .where('project_dbt_source_uuid', duplicate)
            .update({ dbt_project_name: 'same' }),
    ).rejects.toMatchObject({ code: '23505' });
});

test('indexes every repository foreign key and recovers an invalid concurrent unique index without filling rows', async () => {
    const main = await project();
    const first = await source(main.project_uuid);
    const second = await source(main.project_uuid);
    await up(database);
    const indexes = await database.raw(
        `SELECT indexdef FROM pg_indexes WHERE tablename IN ('dbt_repositories', 'project_dbt_sources')`,
    );
    const definitions = indexes.rows
        .map((row: { indexdef: string }) => row.indexdef)
        .join('\n');
    for (const column of [
        'organization_uuid',
        'credential_project_uuid',
        'credential_source_uuid',
        'created_by_project_uuid',
        'dbt_repository_uuid',
    ]) {
        expect(definitions).toContain(`(${column})`);
    }
    expect(definitions).toContain('COALESCE(warehouse_connection_uuid');
    await database.raw(
        'DROP INDEX project_dbt_sources_peer_name_connection_unique',
    );
    await database<PeerFixture>('project_dbt_sources')
        .whereIn('project_dbt_source_uuid', [first, second])
        .update({ dbt_project_name: 'duplicate' });
    await expect(
        database.raw(
            `CREATE UNIQUE INDEX CONCURRENTLY project_dbt_sources_peer_name_connection_unique ON project_dbt_sources (project_uuid, lower(dbt_project_name), COALESCE(warehouse_connection_uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE dbt_project_name IS NOT NULL`,
        ),
    ).rejects.toMatchObject({ code: '23505' });
    const validity = () =>
        database.raw(
            `SELECT indisvalid FROM pg_index WHERE indexrelid = 'project_dbt_sources_peer_name_connection_unique'::regclass`,
        );
    expect((await validity()).rows).toEqual([{ indisvalid: false }]);
    await expect(up(database)).rejects.toMatchObject({ code: '23505' });
    expect((await peer(first)).dbt_project_name).toBe('duplicate');
    expect((await peer(second)).dbt_project_name).toBe('duplicate');
    await database<PeerFixture>('project_dbt_sources')
        .where('project_dbt_source_uuid', second)
        .update({ dbt_project_name: null });
    await up(database);
    expect((await validity()).rows).toEqual([{ indisvalid: true }]);
    await expect(
        database<PeerFixture>('project_dbt_sources')
            .where('project_dbt_source_uuid', second)
            .update({ dbt_project_name: 'duplicate' }),
    ).rejects.toMatchObject({ code: '23505' });
    await down(database);
    await up(database);
    expect((await validity()).rows).toEqual([{ indisvalid: true }]);
    expect(await peer(first)).toMatchObject(pendingMetadata);
    expect(await peer(second)).toMatchObject(pendingMetadata);
});

test.each(['up', 'down'] as const)(
    'resumes %s after every completed statement and resets timeouts immediately after failure',
    async (direction) => {
        const main = await project();
        const uuid = await source(main.project_uuid);
        const before = await peer(uuid);
        const raw = database.raw.bind(database);
        const beforeStatement = await database.raw('SHOW statement_timeout');
        const beforeLock = await database.raw('SHOW lock_timeout');
        const migrate = direction === 'up' ? up : down;
        if (direction === 'down') await up(database);
        let statementCount = 0;
        const count = vi.spyOn(database, 'raw').mockImplementation(((
            sql: string,
            bindings: Knex.RawBinding[] = [],
        ) => {
            const query = raw(sql, bindings);
            if (!sql.startsWith('RESET ')) statementCount += 1;
            return query;
        }) as Knex['raw']);
        try {
            await migrate(database);
        } finally {
            count.mockRestore();
        }
        expect(statementCount).toBeGreaterThan(2);
        await inSequence(
            Array.from({ length: statementCount }, (_, index) => index + 1),
            async (failAt) => {
                await down(database);
                if (direction === 'down') await up(database);
                let completed = 0;
                const inject = vi.spyOn(database, 'raw').mockImplementation(((
                    sql: string,
                    bindings: Knex.RawBinding[] = [],
                ) => {
                    const query = raw(sql, bindings);
                    const originalConnection = query.connection.bind(query);
                    query.connection = ((connection: unknown) => {
                        const result = originalConnection(connection);
                        if (sql.startsWith('RESET ')) return result;
                        return Promise.resolve(result).then((value) => {
                            completed += 1;
                            if (completed === failAt)
                                throw new Error('fixture interruption');
                            return value;
                        });
                    }) as typeof query.connection;
                    return query;
                }) as Knex['raw']);
                try {
                    await expect(migrate(database)).rejects.toThrow(
                        'fixture interruption',
                    );
                } finally {
                    inject.mockRestore();
                }
                expect(
                    (await database.raw('SHOW statement_timeout')).rows,
                ).toEqual(beforeStatement.rows);
                expect((await database.raw('SHOW lock_timeout')).rows).toEqual(
                    beforeLock.rows,
                );
                await migrate(database);
                if (direction === 'down') {
                    expect(await peer(uuid)).toEqual(before);
                    expect(
                        await database.schema.hasTable('dbt_repositories'),
                    ).toBe(false);
                    await up(database);
                }
                expect(await peers(main.project_uuid)).toHaveLength(1);
                expect(await peer(uuid)).toEqual({
                    ...before,
                    ...pendingMetadata,
                });
                expect(await database('dbt_repositories')).toEqual([]);
            },
        );
    },
);
