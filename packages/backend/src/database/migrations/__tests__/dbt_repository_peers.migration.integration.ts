import { Ability, subject } from '@casl/ability';
import {
    FeatureFlags,
    type DbtProjectType,
    type PossibleAbilities,
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
};

const inSequence = <T>(items: T[], step: (item: T) => Promise<void>) =>
    items.reduce<Promise<void>>(
        (previous, item) => previous.then(() => step(item)),
        Promise.resolve(),
    );

const ACTIVE_SECRET = 'peer-migration-active-fixture-secret';
const PREVIOUS_SECRET = 'peer-migration-previous-fixture-secret';
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
                ? encrypt(gitConfig())
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

beforeAll(async () => {
    migrated = await createMigratedDatabase(undefined, { min: 0, max: 1 });
    database = migrated.database;
});

beforeEach(async () => {
    vi.stubEnv('LIGHTDASH_SECRET', ACTIVE_SECRET);
    vi.stubEnv('LIGHTDASH_SECRET_FALLBACKS', JSON.stringify([PREVIOUS_SECRET]));
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

test('keeps source and admin project response JSON identical with the peer flag off', async () => {
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
    const extra = await source(git.project_uuid);
    const duplicateA = await source(duplicates.project_uuid);
    const duplicateB = await source(duplicates.project_uuid);
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
    const featureFlagModel = { get: vi.fn(async () => ({ enabled: false })) };
    const featureFlagService = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: false,
        })),
    };
    const sourceModel = new ProjectDbtSourcesModel({
        database,
        encryptionUtil,
        featureFlagModel: featureFlagModel as never,
    });
    const projectModel = new ProjectModel({
        database,
        lightdashConfig: config,
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
    const responseJson = async (projectUuid: string) => {
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
    const before = new Map<string, Awaited<ReturnType<typeof responseJson>>>();
    await inSequence(fixtures, async (fixture) => {
        const resource = subject('Project', {
            organizationUuid: organization.organization_uuid,
            projectUuid: fixture.project.project_uuid,
        });
        expect(ability.can('manage', resource)).toBe(true);
        expect(ability.can('view', resource)).toBe(true);
        const response = await responseJson(fixture.project.project_uuid);
        expect(response.sourceCount).toBe(fixture.sourceCount);
        before.set(fixture.project.project_uuid, response);
    });

    await up(database);

    expect(await peer(extra)).toMatchObject({
        dbt_project_name: 'known_project',
        dbt_repository_uuid: expect.any(String),
    });
    expect(await peer(duplicateA)).toMatchObject({
        dbt_project_name: null,
        dbt_project_name_conflict: 'duplicate_project',
    });
    expect(await peer(duplicateB)).toMatchObject({
        dbt_project_name: null,
        dbt_project_name_conflict: 'duplicate_project',
    });
    await inSequence(fixtures, async (fixture) => {
        expect(await responseJson(fixture.project.project_uuid)).toEqual(
            before.get(fixture.project.project_uuid),
        );
    });

    await database<PeerFixture>('project_dbt_sources')
        .whereIn('project_dbt_source_uuid', [extra, duplicateA, duplicateB])
        .update({
            membership_role: 'dependency_only',
            refresh_policy: 'ci_managed',
        });
    await database('dbt_repositories')
        .where('organization_uuid', organization.organization_uuid)
        .update({
            default_branch: 'MetadataBranch',
            dbt_project_name: 'registry_metadata',
            is_shared: true,
        });
    await inSequence(fixtures, async (fixture) => {
        expect(await responseJson(fixture.project.project_uuid)).toEqual(
            before.get(fixture.project.project_uuid),
        );
    });
    expect(featureFlagModel.get).toHaveBeenCalledWith(
        expect.objectContaining({ featureFlagId: FeatureFlags.PeerDbtSources }),
    );
    await expect(sourceModel.peers.isEnabled(git.project_uuid)).resolves.toBe(
        false,
    );
    expect(analytics.track).not.toHaveBeenCalled();
});

test('backfills Git extras and preserves CLI main and existing source fields through up/down/up', async () => {
    const main = await project();
    const extra = await source(main.project_uuid);
    await catalog(main.project_uuid, extra, ' Marketing ');
    const before = await peer(extra);
    await up(database);
    expect(await peer(extra)).toMatchObject({
        ...before,
        dbt_project_name: 'marketing',
        dbt_project_name_conflict: null,
        membership_role: 'publish',
        refresh_policy: 'git_refresh',
    });
    const row = await peer(extra);
    expect(row.dbt_repository_uuid).toEqual(expect.any(String));
    expect(
        await database('dbt_repositories')
            .where('dbt_repository_uuid', row.dbt_repository_uuid)
            .first(),
    ).toMatchObject({
        organization_uuid: organization.organization_uuid,
        provider: 'github',
        host: 'git.example.test',
        owner: 'fixture',
        name: 'analytics',
        default_branch: 'Main',
        dbt_project_name: 'marketing',
        credential_source_uuid: extra,
        credential_project_uuid: null,
        created_by_project_uuid: main.project_uuid,
        is_shared: false,
    });
    await up(database);
    expect((await peer(extra)).dbt_repository_uuid).toBe(
        row.dbt_repository_uuid,
    );
    await down(database);
    await down(database);
    expect(await peer(extra)).toEqual(before);
    expect(await database.schema.hasTable('dbt_repositories')).toBe(false);
    await up(database);
    expect(await peers(main.project_uuid)).toHaveLength(1);
    expect(await peer(extra)).toMatchObject({
        dbt_project_name: 'marketing',
        precedence: 7,
        is_primary: false,
    });
});

test('canonicalizes mixed-case repositories with rotated encryption secrets', async () => {
    const main = await project('github', encrypt(gitConfig()));
    const first = await source(main.project_uuid, {
        connection: encrypt(
            gitConfig('Fixture/Analytics.git', 'GIT.EXAMPLE.TEST.'),
        ),
    });
    const second = await source(main.project_uuid, {
        connection: encrypt(
            gitConfig('fixture/analytics', 'git.example.test'),
            PREVIOUS_SECRET,
        ),
    });
    await up(database);
    expect((await peer(first)).dbt_repository_uuid).toBe(
        (await peer(second)).dbt_repository_uuid,
    );
    expect(
        await database('dbt_repositories').where(
            'organization_uuid',
            organization.organization_uuid,
        ),
    ).toHaveLength(1);
    expect(await peers(main.project_uuid)).toHaveLength(2);
    const otherOrg = await database('organizations')
        .insert({ organization_name: 'Isolated peer fixture' })
        .returning('organization_uuid');
    try {
        const repository = await database('dbt_repositories')
            .where('organization_uuid', organization.organization_uuid)
            .first();
        await database('dbt_repositories').insert({
            organization_uuid: otherOrg[0].organization_uuid,
            provider: repository.provider,
            host: repository.host,
            owner: repository.owner,
            name: repository.name,
        });
        await expect(
            database('dbt_repositories').insert({
                organization_uuid: organization.organization_uuid,
                provider: 'github',
                host: 'GIT.EXAMPLE.TEST',
                owner: 'fixture',
                name: 'analytics',
            }),
        ).rejects.toMatchObject({ code: '23514' });
    } finally {
        await database('organizations')
            .where('organization_uuid', otherOrg[0].organization_uuid)
            .delete();
    }
});

test('matches HTTPS and SSH repository forms without storing URL credentials', async () => {
    const main = await project();
    const path = await source(main.project_uuid, {
        connection: encrypt(gitConfig('Fixture/Analytics.git')),
    });
    const https = await source(main.project_uuid, {
        connection: encrypt(
            gitConfig(
                'https://synthetic-user:synthetic-token@GIT.EXAMPLE.TEST/fixture/analytics.git',
            ),
        ),
    });
    const ssh = await source(main.project_uuid, {
        connection: encrypt(
            gitConfig('git@Git.Example.Test:FIXTURE/ANALYTICS.git'),
        ),
    });
    const port = await source(main.project_uuid, {
        connection: encrypt(
            gitConfig('Fixture/Analytics', 'git.example.test:8443'),
        ),
    });
    await up(database);
    expect((await peer(path)).dbt_repository_uuid).toBe(
        (await peer(https)).dbt_repository_uuid,
    );
    expect((await peer(path)).dbt_repository_uuid).toBe(
        (await peer(ssh)).dbt_repository_uuid,
    );
    expect((await peer(port)).dbt_repository_uuid).not.toBe(
        (await peer(path)).dbt_repository_uuid,
    );
    const repositories = await database('dbt_repositories').where(
        'organization_uuid',
        organization.organization_uuid,
    );
    expect(repositories).toHaveLength(2);
    expect(JSON.stringify(repositories)).not.toContain('synthetic-token');
    expect(JSON.stringify(repositories)).not.toContain('synthetic-user');
});

test('uses only unambiguous per-source name evidence and marks all same-connection duplicates', async () => {
    const main = await project();
    const first = await source(main.project_uuid);
    const second = await source(main.project_uuid);
    const ambiguous = await source(main.project_uuid);
    const unstamped = await source(main.project_uuid);
    const cached = await source(main.project_uuid);
    await catalog(main.project_uuid, main.dbt_source_uuid, ' Shared ');
    await catalog(main.project_uuid, first, 'SHARED');
    await explore(main.project_uuid, second, 'shared');
    await catalog(main.project_uuid, ambiguous, 'one');
    await explore(main.project_uuid, ambiguous, 'two');
    await explore(main.project_uuid, null, 'unowned');
    await explore(main.project_uuid, cached, 'Cache_Name');
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await up(database);
    await inSequence([first, second], async (uuid) => {
        expect(await peer(uuid)).toMatchObject({
            dbt_project_name: null,
            dbt_project_name_conflict: 'shared',
        });
    });
    await inSequence([ambiguous, unstamped], async (uuid) => {
        expect(await peer(uuid)).toMatchObject({
            dbt_project_name: null,
            dbt_project_name_conflict: null,
        });
    });
    expect(await peer(cached)).toMatchObject({
        dbt_project_name: 'cache_name',
        dbt_project_name_conflict: null,
    });
    expect(warnings).toHaveBeenCalledWith(
        JSON.stringify({
            event: 'dbt_peer_name_conflicts',
            projectUuid: main.project_uuid,
            conflictCount: 3,
            sourceUuids: [main.dbt_source_uuid, first, second].sort(),
        }),
    );
    expect(
        (
            await database('dbt_repositories')
                .where('organization_uuid', organization.organization_uuid)
                .first()
        ).dbt_project_name,
    ).toBeNull();
    const collision = await source(main.project_uuid);
    await expect(
        database<PeerFixture>('project_dbt_sources')
            .where('project_dbt_source_uuid', collision)
            .update({ dbt_project_name: 'cache_name' }),
    ).rejects.toMatchObject({ code: '23505' });
});

test('does not learn a registry name when one source has conflicting evidence', async () => {
    const main = await project();
    const first = await source(main.project_uuid);
    const second = await source(main.project_uuid);
    await catalog(main.project_uuid, first, 'one');
    await catalog(main.project_uuid, second, 'one');
    await explore(main.project_uuid, second, 'two');
    await up(database);
    expect(await peer(first)).toMatchObject({ dbt_project_name: 'one' });
    expect(await peer(second)).toMatchObject({ dbt_project_name: null });
    expect(
        (
            await database('dbt_repositories')
                .where('organization_uuid', organization.organization_uuid)
                .first()
        ).dbt_project_name,
    ).toBeNull();
});

test('allows the same learned name on two warehouse connections', async () => {
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
    await catalog(main.project_uuid, original, 'SAME');
    await catalog(main.project_uuid, extra, 'same');
    await up(database);
    expect(await peers(main.project_uuid)).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                project_dbt_source_uuid: original,
                dbt_project_name: 'same',
                dbt_project_name_conflict: null,
            }),
            expect.objectContaining({
                project_dbt_source_uuid: extra,
                dbt_project_name: 'same',
                dbt_project_name_conflict: null,
            }),
        ]),
    );
    const duplicate = await source(main.project_uuid);
    await expect(
        database<PeerFixture>('project_dbt_sources')
            .where('project_dbt_source_uuid', duplicate)
            .update({ dbt_project_name: 'same' }),
    ).rejects.toMatchObject({ code: '23505' });
});

test('preserves unreadable configs and logs only structured source identifiers', async () => {
    const main = await project();
    const unreadable = await source(main.project_uuid, {
        connection: encrypt(gitConfig(), 'unavailable-fixture-secret'),
    });
    const invalid = await source(main.project_uuid, {
        connection: encrypt({ repository: 'invalid' }),
    });
    const missing = await source(main.project_uuid, { connection: null });
    const cli = await source(main.project_uuid, {
        type: 'none',
        connection: null,
    });
    const before = await peers(main.project_uuid).orderBy(
        'project_dbt_source_uuid',
    );
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await up(database);
    await inSequence(before, async (row) => {
        expect(await peer(row.project_dbt_source_uuid)).toMatchObject({
            ...row,
            dbt_repository_uuid: null,
        });
    });
    expect(await peer(cli)).toMatchObject({ refresh_policy: 'ci_managed' });
    const output = warnings.mock.calls.map(([value]) =>
        JSON.parse(String(value)),
    );
    expect(output).toContainEqual({
        event: 'dbt_peer_repository_backfill_skipped',
        projectUuid: main.project_uuid,
        sourceCount: 3,
        sourceUuids: [unreadable, invalid, missing].sort(),
    });
    expect(JSON.stringify(output)).not.toMatch(
        /synthetic-token|unavailable-fixture-secret|git.example.test|Fixture\/Analytics/,
    );
});

test('supports Gitlab nested groups, Bitbucket and Azure registry identities', async () => {
    const main = await project();
    const gitlab = await source(main.project_uuid, {
        type: 'gitlab',
        connection: encrypt({
            ...gitConfig('Group/SubGroup/Repo'),
            type: 'gitlab',
        }),
    });
    const bitbucket = await source(main.project_uuid, {
        type: 'bitbucket',
        connection: encrypt({
            ...gitConfig('Workspace/Repo'),
            type: 'bitbucket',
        }),
    });
    const azure = await source(main.project_uuid, {
        type: 'azure_devops',
        connection: encrypt({
            type: 'azure_devops',
            organization: 'FixtureOrg',
            project: 'FixtureProject',
            repository: 'Repo',
            branch: 'Release',
        }),
    });
    await up(database);
    const rows = await database('dbt_repositories').where(
        'organization_uuid',
        organization.organization_uuid,
    );
    expect(rows).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                provider: 'gitlab',
                owner: 'group/subgroup',
                name: 'repo',
                credential_source_uuid: gitlab,
            }),
            expect.objectContaining({
                provider: 'bitbucket',
                owner: 'workspace',
                name: 'repo',
                credential_source_uuid: bitbucket,
            }),
            expect.objectContaining({
                provider: 'azure_devops',
                host: 'dev.azure.com',
                owner: 'fixtureorg/fixtureproject',
                name: 'repo',
                default_branch: 'Release',
                credential_source_uuid: azure,
            }),
        ]),
    );
});

test('indexes every new foreign key and recovers an invalid concurrent unique index', async () => {
    const main = await project();
    await source(main.project_uuid);
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
    const first = await source(main.project_uuid);
    const second = await source(main.project_uuid);
    await database<PeerFixture>('project_dbt_sources')
        .whereIn('project_dbt_source_uuid', [first, second])
        .update({ dbt_project_name: 'duplicate' });
    await expect(
        database.raw(
            `CREATE UNIQUE INDEX CONCURRENTLY project_dbt_sources_peer_name_connection_unique ON project_dbt_sources (project_uuid, lower(dbt_project_name), COALESCE(warehouse_connection_uuid, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE dbt_project_name IS NOT NULL`,
        ),
    ).rejects.toMatchObject({ code: '23505' });
    await up(database);
    const valid = await database.raw(
        `SELECT indisvalid FROM pg_index WHERE indexrelid = 'project_dbt_sources_peer_name_connection_unique'::regclass`,
    );
    expect(valid.rows).toEqual([{ indisvalid: true }]);
});

test('resumes after each completed migration statement and resets session timeouts on failure', async () => {
    const main = await project();
    const uuid = await source(main.project_uuid);
    await catalog(main.project_uuid, uuid, 'fixture');
    const raw = database.raw.bind(database);
    const beforeStatement = await database.raw('SHOW statement_timeout');
    const beforeLock = await database.raw('SHOW lock_timeout');
    let statementCount = 0;
    const count = vi.spyOn(database, 'raw').mockImplementation(((
        sql: string,
        bindings: Knex.RawBinding[] = [],
    ) => {
        const query = raw(sql, bindings);
        if (!sql.startsWith('RESET ')) statementCount += 1;
        return query;
    }) as Knex['raw']);
    await up(database);
    count.mockRestore();
    await inSequence(
        Array.from({ length: statementCount }, (_, index) => index + 1),
        async (failAt) => {
            await down(database);
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
            await expect(up(database)).rejects.toThrow('fixture interruption');
            inject.mockRestore();
            await up(database);
            expect(await peers(main.project_uuid)).toHaveLength(1);
            expect(await peer(uuid)).toMatchObject({
                dbt_project_name: 'fixture',
            });
            expect(
                await database('dbt_repositories').where(
                    'organization_uuid',
                    organization.organization_uuid,
                ),
            ).toHaveLength(1);
        },
    );
    const connection = await database.client.acquireConnection();
    try {
        const statement = await database
            .raw('SHOW statement_timeout')
            .connection(connection);
        const lock = await database
            .raw('SHOW lock_timeout')
            .connection(connection);
        expect(statement.rows).toEqual(beforeStatement.rows);
        expect(lock.rows).toEqual(beforeLock.rows);
    } finally {
        await database.client.releaseConnection(connection);
    }
});
