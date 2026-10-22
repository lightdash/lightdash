import {
    ConflictError,
    DbtProjectType,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    PeerDbtSourcesModel,
    type DbPeerDbtSource,
} from '../../../models/PeerDbtSourcesModel';
import {
    PeerProjectDeletionModel,
    type PeerRepositoryOwnerRow,
} from '../../../models/PeerProjectDeletionModel';
import { ProjectDbtSourcesModel } from '../../../models/ProjectDbtSourcesModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { down, up } from '../20261022220000_add_peer_project_deletion_state';

type ProjectFixture = {
    project_uuid: string;
    organization_id: number;
    name: string;
    dbt_connection_type: DbtProjectType;
    dbt_connection: Buffer;
    connection_mode: string;
    project_peer_deletion_started_at: Date | null;
};

const secret = 'synthetic-peer-deletion-secret';
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: {
        lightdashSecret: secret,
        lightdashSecrets: { active: secret, fallbacks: [], all: [secret] },
    },
});
const connection = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'personal_access_token',
    repository: 'fixture/deletion_repository',
    branch: 'main',
    project_sub_path: '/',
    personal_access_token: 'synthetic-token',
};

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

const within = async <T>(operation: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            operation,
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () =>
                        reject(
                            new Error(
                                'Operation blocked during content cleanup',
                            ),
                        ),
                    1500,
                );
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
};

let migrated: MigratedDatabase;
let database: Knex;
let deletion: PeerProjectDeletionModel;
let peers: PeerDbtSourcesModel;
let sources: ProjectDbtSourcesModel;
let organizationUuid: string;
let organizationId: number;
let owner: string;
let previewA: string;
let previewB: string;

const createProject = async (name: string): Promise<string> => {
    const [project] = await database<ProjectFixture>('projects')
        .insert({
            organization_id: organizationId,
            name,
            dbt_connection_type: DbtProjectType.GITHUB,
            dbt_connection: encryptionUtil.encrypt(JSON.stringify(connection)),
            connection_mode: 'multi',
        })
        .returning('project_uuid');
    return project.project_uuid;
};

const createRepository = async (
    values: Partial<PeerRepositoryOwnerRow> = {},
): Promise<string> => {
    const [repository] = await database('dbt_repositories')
        .insert({
            organization_uuid: organizationUuid,
            provider: 'github',
            host: 'github.com',
            owner: 'fixture',
            name: `deletion_${randomUUID().replaceAll('-', '')}`,
            is_shared: true,
            created_by_project_uuid: owner,
            credential_project_uuid: owner,
            credential_source_uuid: null,
            ...values,
        })
        .returning('dbt_repository_uuid');
    return repository.dbt_repository_uuid;
};

const createSource = async (
    projectUuid: string,
    repositoryUuid: string | null,
    values: { role?: 'main' | 'extra'; ownsCredentials?: boolean } = {},
): Promise<string> => {
    const [source] = await database<DbPeerDbtSource>('project_dbt_sources')
        .insert({
            project_uuid: projectUuid,
            name: `source_${randomUUID().replaceAll('-', '')}`,
            role: values.role ?? 'extra',
            is_primary: false,
            precedence: 1,
            dbt_connection_type: DbtProjectType.GITHUB,
            dbt_connection: values.ownsCredentials
                ? encryptionUtil.encrypt(JSON.stringify(connection))
                : null,
            dbt_repository_uuid: repositoryUuid,
            repository_fill_state: 'registered',
            repository_fill_attempted_at: new Date(),
            dbt_project_name_initialized_at: new Date(),
            warehouse_connection_uuid: null,
        })
        .returning('project_dbt_source_uuid');
    return source.project_dbt_source_uuid;
};

const findProjectRow = (projectUuid: string) =>
    database<ProjectFixture>('projects')
        .where('project_uuid', projectUuid)
        .first();
const projectRow = async (projectUuid: string) => {
    const row = await findProjectRow(projectUuid);
    if (!row) throw new Error('Missing synthetic project');
    return row;
};
const repositoryRow = (repositoryUuid: string) =>
    database('dbt_repositories')
        .where('dbt_repository_uuid', repositoryUuid)
        .first();
const finalDelete = (projectUuid: string, trx: Knex.Transaction) =>
    trx('projects').where('project_uuid', projectUuid).delete();
const sharedInput = (repositoryUuid: string) => ({
    dbtRepositoryUuid: repositoryUuid,
    name: 'shared_source',
    warehouseConnectionUuid: null,
    membershipRole: 'publish' as const,
    refreshPolicy: 'ci_managed' as const,
});

const assertOwnersAvailable = (repositoryUuid: string) =>
    database.transaction(async (trx) => {
        await trx.raw("SET LOCAL lock_timeout = '2s'");
        const repositories = await trx('dbt_repositories')
            .where('dbt_repository_uuid', repositoryUuid)
            .forUpdate();
        await PeerProjectDeletionModel.assertRepositoryOwnersAvailable(
            trx,
            repositories,
        );
    });

beforeAll(async () => {
    migrated = await createMigratedDatabase(undefined, { min: 0, max: 8 });
    database = migrated.database;
});

beforeEach(async () => {
    deletion = new PeerProjectDeletionModel({ database });
    peers = new PeerDbtSourcesModel({
        database,
        encryptionUtil,
        peerDbtSourcesEnabled: true,
    });
    sources = new ProjectDbtSourcesModel({
        database,
        encryptionUtil,
        peerDbtSourcesEnabled: true,
    });
    const [organization] = await database('organizations')
        .insert({ organization_name: 'synthetic_deletion_organization' })
        .returning(['organization_id', 'organization_uuid']);
    organizationUuid = organization.organization_uuid;
    organizationId = organization.organization_id;
    owner = await createProject('owner');
    previewA = await createProject('preview_a');
    previewB = await createProject('preview_b');
});

afterEach(async () => {
    await database('organizations')
        .where('organization_uuid', organizationUuid)
        .delete();
});

afterAll(async () => migrated?.destroy());

describe('PeerProjectDeletionModel on the migrated schema', () => {
    test('adds only nullable timestamptz state and reverses it without removing peer metadata', async () => {
        const column = await database('information_schema.columns')
            .where({
                table_schema: 'public',
                table_name: 'projects',
                column_name: 'project_peer_deletion_started_at',
            })
            .first();
        expect(column).toMatchObject({
            data_type: 'timestamp with time zone',
            is_nullable: 'YES',
            column_default: null,
        });
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeNull();
        await down(database);
        try {
            expect(
                await database.schema.hasColumn(
                    'projects',
                    'project_peer_deletion_started_at',
                ),
            ).toBe(false);
            expect(await database.schema.hasTable('dbt_repositories')).toBe(
                true,
            );
            expect(
                await database.schema.hasColumn('project_dbt_sources', 'role'),
            ).toBe(true);
        } finally {
            await up(database);
        }
    });

    test('refuses rollback while any project has an active tombstone', async () => {
        await deletion.begin([owner]);
        await expect(down(database)).rejects.toThrow(/^irreversible:/);
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeInstanceOf(Date);
        expect(
            await database.schema.hasColumn(
                'project_dbt_sources',
                'dbt_repository_uuid',
            ),
        ).toBe(true);
    });

    test('refuses an external consumer before any member of the deletion group is marked', async () => {
        const repository = await createRepository();
        await createSource(previewA, repository);
        await createSource(previewA, repository);
        await expect(deletion.begin([previewB, owner, owner])).rejects.toThrow(
            /1 other project/,
        );
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeNull();
        expect(
            (await projectRow(previewB)).project_peer_deletion_started_at,
        ).toBeNull();
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: true,
            credential_project_uuid: owner,
        });
    });

    test('checks credential-source ownership even when another project created the registry', async () => {
        const credentialSource = await createSource(owner, null, {
            ownsCredentials: true,
        });
        const repository = await createRepository({
            created_by_project_uuid: previewB,
            credential_project_uuid: null,
            credential_source_uuid: credentialSource,
        });
        await createSource(previewA, repository);
        await expect(deletion.begin([owner])).rejects.toBeInstanceOf(
            ConflictError,
        );
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeNull();
    });

    test('excludes the whole deletion group and supports a caller-owned final transaction', async () => {
        const repository = await createRepository();
        await createSource(previewA, repository);
        const group = [previewA, owner];
        await deletion.begin(group);
        await database.transaction(async (trx) => {
            const transactionSpy = vi.spyOn(database, 'transaction');
            try {
                await deletion.withFinalDeletion(
                    owner,
                    (inner) => {
                        expect(inner).toBe(trx);
                        return finalDelete(owner, inner);
                    },
                    trx,
                    group,
                );
                expect(transactionSpy).not.toHaveBeenCalled();
                await deletion.withFinalDeletion(
                    previewA,
                    (inner) => finalDelete(previewA, inner),
                    trx,
                    group,
                );
            } finally {
                transactionSpy.mockRestore();
            }
        });
        expect(await findProjectRow(owner)).toBeUndefined();
        expect(await findProjectRow(previewA)).toBeUndefined();
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: false,
            credential_project_uuid: null,
            created_by_project_uuid: null,
        });
    });

    test('retains the tombstone after content failure and permits a retry without changing its time', async () => {
        const repository = await createRepository();
        const cleanup = vi.fn(async () => {
            throw new Error('Synthetic content failure');
        });
        await deletion.begin([owner]);
        const startedAt = (await projectRow(owner))
            .project_peer_deletion_started_at;
        await expect(cleanup()).rejects.toThrow('Synthetic content failure');
        await expect(assertOwnersAvailable(repository)).rejects.toBeInstanceOf(
            ConflictError,
        );
        await deletion.begin([owner]);
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toEqual(startedAt);
        await deletion.withFinalDeletion(owner, (trx) =>
            finalDelete(owner, trx),
        );
        expect(await findProjectRow(owner)).toBeUndefined();
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: false,
        });
    });

    test('rolls back final changes on failure and preserves the previously committed tombstone', async () => {
        const repository = await createRepository();
        await deletion.begin([owner]);
        const startedAt = (await projectRow(owner))
            .project_peer_deletion_started_at;
        await expect(
            deletion.withFinalDeletion(owner, async (trx) => {
                await finalDelete(owner, trx);
                throw new Error('Synthetic final failure');
            }),
        ).rejects.toThrow('Synthetic final failure');
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toEqual(startedAt);
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: true,
            credential_project_uuid: owner,
        });
        await deletion.begin([owner]);
        await deletion.withFinalDeletion(owner, (trx) =>
            finalDelete(owner, trx),
        );
    });

    test('refuses a direct database consumer inserted after begin before invoking the final callback', async () => {
        const repository = await createRepository();
        await deletion.begin([owner]);
        const consumer = await createSource(previewA, repository);
        const finalize = vi.fn((trx: Knex.Transaction) =>
            finalDelete(owner, trx),
        );
        await expect(
            deletion.withFinalDeletion(owner, finalize),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(finalize).not.toHaveBeenCalled();
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeInstanceOf(Date);
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: true,
        });
        await database<DbPeerDbtSource>('project_dbt_sources')
            .where('project_dbt_source_uuid', consumer)
            .delete();
        await deletion.withFinalDeletion(owner, finalize);
        expect(finalize).toHaveBeenCalledOnce();
    });

    test('requires begin for every existing project excluded from the final consumer check', async () => {
        const repository = await createRepository();
        await deletion.begin([owner]);
        await createSource(previewA, repository);
        const finalize = vi.fn((trx: Knex.Transaction) =>
            finalDelete(owner, trx),
        );
        await expect(
            deletion.withFinalDeletion(owner, finalize, undefined, [
                owner,
                previewA,
            ]),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(finalize).not.toHaveBeenCalled();
    });

    test('ignores main consumer rows and main credential-source ownership', async () => {
        const repository = await createRepository();
        await createSource(previewA, repository, { role: 'main' });
        await deletion.begin([owner]);
        const mainSource = await createSource(owner, null, {
            role: 'main',
            ownsCredentials: true,
        });
        const foreignRepository = await createRepository({
            created_by_project_uuid: previewB,
            credential_project_uuid: null,
            credential_source_uuid: mainSource,
        });
        await createSource(previewA, foreignRepository);
        await expect(
            assertOwnersAvailable(foreignRepository),
        ).resolves.toBeUndefined();
        await deletion.begin([owner]);
        const finalize = vi.fn(async () => undefined);
        await deletion.withFinalDeletion(owner, finalize);
        expect(finalize).toHaveBeenCalledOnce();
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: false,
        });
        expect(await repositoryRow(foreignRepository)).toMatchObject({
            is_shared: true,
        });
    });

    test('releases project and registry locks before slow content cleanup', async () => {
        const repository = await createRepository();
        const entered = deferred();
        const release = deferred();
        const operation = (async () => {
            await deletion.begin([owner]);
            entered.resolve();
            await release.promise;
            await deletion.withFinalDeletion(owner, (trx) =>
                finalDelete(owner, trx),
            );
        })();
        try {
            await within(Promise.race([entered.promise, operation]));
            await database.transaction(async (trx) => {
                await trx.raw("SET LOCAL lock_timeout = '500ms'");
                await trx('projects')
                    .where('project_uuid', owner)
                    .forUpdate()
                    .noWait();
                await trx('dbt_repositories')
                    .where('dbt_repository_uuid', repository)
                    .forUpdate()
                    .noWait();
                const { rows } = await trx.raw<{ rows: { count: string }[] }>(
                    "SELECT count(*) FROM pg_locks WHERE pid <> pg_backend_pid() AND database = (SELECT oid FROM pg_database WHERE datname = current_database()) AND locktype IN ('advisory', 'tuple') AND granted",
                );
                expect(Number(rows[0].count)).toBe(0);
            });
        } finally {
            release.resolve();
            await operation;
        }
    });

    test('does not lock a consumed foreign registry at either deletion phase', async () => {
        const repository = await createRepository();
        await createSource(previewA, repository);
        const blocker = await database.transaction();
        let operation: Promise<void> | undefined;
        try {
            await blocker.raw("SET LOCAL lock_timeout = '2s'");
            await blocker('dbt_repositories')
                .where('dbt_repository_uuid', repository)
                .forUpdate();
            operation = (async () => {
                await deletion.begin([previewA]);
                await deletion.withFinalDeletion(previewA, (trx) =>
                    finalDelete(previewA, trx),
                );
            })();
            await within(operation);
            expect(await findProjectRow(previewA)).toBeUndefined();
        } finally {
            await blocker.rollback();
            await operation;
        }
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: true,
            credential_project_uuid: owner,
        });
    });

    test('allows two previews of the same owner to clean content concurrently and keeps setShared nonblocking', async () => {
        const repository = await createRepository();
        await createSource(previewA, repository);
        await createSource(previewB, repository);
        const enteredA = deferred();
        const enteredB = deferred();
        const release = deferred();
        const deletePreview = async (
            projectUuid: string,
            entered: ReturnType<typeof deferred>,
        ) => {
            await deletion.begin([projectUuid]);
            entered.resolve();
            await release.promise;
            return deletion.withFinalDeletion(projectUuid, (trx) =>
                finalDelete(projectUuid, trx),
            );
        };
        const pendingDeletes = [
            deletePreview(previewA, enteredA),
            deletePreview(previewB, enteredB),
        ];
        const operations = Promise.all(pendingDeletes);
        try {
            await within(
                Promise.race([
                    Promise.all([enteredA.promise, enteredB.promise]),
                    operations,
                ]),
            );
            await within(
                peers.setShared(organizationUuid, owner, repository, true),
            );
            expect(
                (await projectRow(previewA)).project_peer_deletion_started_at,
            ).toBeInstanceOf(Date);
            expect(
                (await projectRow(previewB)).project_peer_deletion_started_at,
            ).toBeInstanceOf(Date);
        } finally {
            release.resolve();
            await Promise.allSettled(pendingDeletes);
        }
        await operations;
        expect(await findProjectRow(previewA)).toBeUndefined();
        expect(await findProjectRow(previewB)).toBeUndefined();
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: true,
        });
    });

    test('serializes overlapping begin groups in sorted order without a deadlock', async () => {
        await within(
            Promise.all([
                deletion.begin([previewA, owner]),
                deletion.begin([owner, previewA, owner]),
            ]),
        );
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeInstanceOf(Date);
        expect(
            (await projectRow(previewA)).project_peer_deletion_started_at,
        ).toBeInstanceOf(Date);
    });

    test.each(['project', 'repository'] as const)(
        'bounds a blocked %s lock with lock_timeout',
        async (kind) => {
            const repository = await createRepository();
            const blocker = await database.transaction();
            try {
                await blocker.raw("SET LOCAL lock_timeout = '2s'");
                if (kind === 'project')
                    await blocker('projects')
                        .where('project_uuid', owner)
                        .forUpdate();
                else
                    await blocker('dbt_repositories')
                        .where('dbt_repository_uuid', repository)
                        .forUpdate();
                await expect(deletion.begin([owner])).rejects.toMatchObject({
                    code: '55P03',
                });
            } finally {
                await blocker.rollback();
            }
            expect(
                (await projectRow(owner)).project_peer_deletion_started_at,
            ).toBeNull();
        },
    );

    test('rejects an outer begin transaction so its locks cannot escape into content cleanup', async () => {
        await database.transaction(async (trx) => {
            await expect(
                new PeerProjectDeletionModel({ database: trx }).begin([owner]),
            ).rejects.toBeInstanceOf(ParameterError);
        });
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeNull();
    });

    test('refuses an implicit final savepoint and accepts an explicit short final transaction', async () => {
        await deletion.begin([owner]);
        await database.transaction(async (trx) => {
            const bound = new PeerProjectDeletionModel({ database: trx });
            const finalize = vi.fn(async () => undefined);
            await expect(
                bound.withFinalDeletion(owner, finalize),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(finalize).not.toHaveBeenCalled();
            await expect(
                bound.withFinalDeletion(owner, finalize, trx),
            ).resolves.toBeUndefined();
            expect(finalize).toHaveBeenCalledExactlyOnceWith(trx);
        });
    });

    test('does not partially mark a group that contains a missing project', async () => {
        await expect(
            deletion.begin([owner, randomUUID()]),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeNull();
    });

    test.each(['creator', 'project', 'source'] as const)(
        'refuses a marked repository %s owner after the registry lock',
        async (kind) => {
            const credentialSource =
                kind === 'source'
                    ? await createSource(owner, null, { ownsCredentials: true })
                    : null;
            const repository = await createRepository({
                created_by_project_uuid: kind === 'creator' ? owner : previewB,
                credential_project_uuid: kind === 'project' ? owner : null,
                credential_source_uuid: credentialSource,
            });
            await deletion.begin([owner]);
            await expect(
                assertOwnersAvailable(repository),
            ).rejects.toBeInstanceOf(ConflictError);
        },
    );

    test('owner checks read without waiting for an owner-project row lock', async () => {
        const repository = await createRepository();
        const blocker = await database.transaction();
        let operation: Promise<void> | undefined;
        try {
            await blocker.raw("SET LOCAL lock_timeout = '2s'");
            await blocker('projects').where('project_uuid', owner).forUpdate();
            operation = assertOwnersAvailable(repository);
            await within(operation);
        } finally {
            await blocker.rollback();
            await operation;
        }
    });

    test('addShared and setShared refuse a tombstoned owner without creating memberships', async () => {
        const repository = await createRepository();
        await deletion.begin([owner]);
        await expect(
            peers.addShared(
                organizationUuid,
                previewA,
                sharedInput(repository),
            ),
        ).rejects.toBeInstanceOf(ConflictError);
        await expect(
            peers.setShared(organizationUuid, owner, repository, true),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(
            await database<DbPeerDbtSource>('project_dbt_sources').where(
                'project_uuid',
                previewA,
            ),
        ).toEqual([]);
        expect(await repositoryRow(repository)).toMatchObject({
            is_shared: true,
        });
    });

    test.each(['copySources', 'copySourcesWithConnectionMap'] as const)(
        '%s refuses memberships from a marked owner',
        async (method) => {
            const repository = await createRepository();
            await deletion.begin([owner]);
            await createSource(previewA, repository);
            const operation =
                method === 'copySources'
                    ? sources.copySources(previewA, previewB)
                    : sources.copySourcesWithConnectionMap(
                          previewA,
                          previewB,
                          new Map(),
                      );
            await expect(operation).rejects.toBeInstanceOf(ConflictError);
            expect(
                await database<DbPeerDbtSource>('project_dbt_sources').where(
                    'project_uuid',
                    previewB,
                ),
            ).toEqual([]);
        },
    );
});
