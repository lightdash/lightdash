import { ConflictError, DbtProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import {
    PeerDbtSourcesModel,
    type DbPeerDbtSource,
} from '../../../models/PeerDbtSourcesModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { withPeerDbtSourcesOperation } from '../../../utils/peerDbtSourcesOperation';

type ProjectFixture = {
    project_uuid: string;
    organization_id: number;
    name: string;
    dbt_connection_type: DbtProjectType;
    dbt_connection: Buffer;
    connection_mode: string;
    project_peer_deletion_started_at: Date | null;
};

const secret = 'synthetic-project-deletion-secret';
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
                            new Error('Synthetic deletion did not progress'),
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
let projects: ProjectModel;
let peers: PeerDbtSourcesModel;
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
const createRepository = async (): Promise<string> => {
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
        })
        .returning('dbt_repository_uuid');
    return repository.dbt_repository_uuid;
};
const createConsumer = async (
    projectUuid: string,
    repositoryUuid: string,
): Promise<void> => {
    await database<DbPeerDbtSource>('project_dbt_sources').insert({
        project_uuid: projectUuid,
        name: `source_${randomUUID().replaceAll('-', '')}`,
        role: 'extra',
        is_primary: false,
        precedence: 1,
        dbt_connection_type: DbtProjectType.GITHUB,
        dbt_connection: null,
        dbt_repository_uuid: repositoryUuid,
        repository_fill_state: 'registered',
        repository_fill_attempted_at: new Date(),
        dbt_project_name_initialized_at: new Date(),
        warehouse_connection_uuid: null,
    });
};
const projectRow = async (projectUuid: string) => {
    const row = await database<ProjectFixture>('projects')
        .where('project_uuid', projectUuid)
        .first();
    if (!row) throw new Error('Missing synthetic project');
    return row;
};

beforeAll(async () => {
    migrated = await createMigratedDatabase(undefined, { min: 0, max: 8 });
    database = migrated.database;
});

beforeEach(async () => {
    projects = new ProjectModel({
        database,
        lightdashConfig: lightdashConfigMock,
        encryptionUtil,
    });
    peers = new PeerDbtSourcesModel({
        database,
        encryptionUtil,
        peerDbtSourcesEnabled: true,
    });
    const [organization] = await database('organizations')
        .insert({ organization_name: 'synthetic_wiring_organization' })
        .returning(['organization_id', 'organization_uuid']);
    organizationUuid = organization.organization_uuid;
    organizationId = organization.organization_id;
    owner = await createProject('owner');
    previewA = await createProject('preview_a');
    previewB = await createProject('preview_b');
});

afterEach(async () => {
    vi.restoreAllMocks();
    await database('organizations')
        .where('organization_uuid', organizationUuid)
        .delete();
});

afterAll(async () => migrated?.destroy());

describe('ProjectModel tombstone wiring on the migrated schema', () => {
    test('checks external consumers before deleting any content', async () => {
        const repository = await createRepository();
        await createConsumer(previewA, repository);
        const batches = vi.spyOn(projects, 'deleteContentInBatches');
        await expect(
            withPeerDbtSourcesOperation(true, () => projects.delete(owner)),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(batches).not.toHaveBeenCalled();
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeNull();
        expect(
            await database<DbPeerDbtSource>('project_dbt_sources').where(
                'project_uuid',
                previewA,
            ),
        ).toHaveLength(1);
    });

    test('commits the marker and releases all project and registry locks before content, including after a content failure', async () => {
        const repository = await createRepository();
        const entered = deferred();
        const release = deferred();
        vi.spyOn(projects, 'deleteContentInBatches').mockImplementation(
            async () => {
                entered.resolve();
                await release.promise;
                throw new Error('Synthetic content failure');
            },
        );
        const deletion = withPeerDbtSourcesOperation(true, () =>
            projects.delete(owner),
        ).then(
            () => ({ error: null }),
            (error: unknown) => ({ error }),
        );
        try {
            await within(
                Promise.race([
                    entered.promise,
                    deletion.then(() => {
                        throw new Error('Deletion ended before content');
                    }),
                ]),
            );
            expect(
                (await projectRow(owner)).project_peer_deletion_started_at,
            ).toBeInstanceOf(Date);
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
            });
            await expect(
                within(
                    peers.setShared(organizationUuid, owner, repository, true),
                ),
            ).rejects.toBeInstanceOf(ConflictError);
            await expect(
                within(
                    peers.setShared(organizationUuid, owner, repository, false),
                ),
            ).rejects.toBeInstanceOf(ConflictError);
        } finally {
            release.resolve();
            await deletion;
        }
        expect((await deletion).error).toBeInstanceOf(Error);
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeInstanceOf(Date);
    });

    test('cleans two previews of the same foreign registry concurrently while the owner can still setShared', async () => {
        const repository = await createRepository();
        await createConsumer(previewA, repository);
        await createConsumer(previewB, repository);
        const entered = new Set<string>();
        const release = deferred();
        const deleteContent = projects.deleteContentInBatches.bind(projects);
        vi.spyOn(projects, 'deleteContentInBatches').mockImplementation(
            async (projectUuid) => {
                entered.add(projectUuid);
                await release.promise;
                await deleteContent(projectUuid);
            },
        );
        const deletions = [previewA, previewB].map((projectUuid) =>
            withPeerDbtSourcesOperation(true, () =>
                projects.delete(projectUuid),
            ),
        );
        const deletion = Promise.all(deletions).then(
            () => ({ error: null }),
            (error: unknown) => ({ error }),
        );
        try {
            await expect.poll(() => entered.size, { timeout: 1500 }).toBe(2);
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
            await Promise.allSettled(deletions);
        }
        expect((await deletion).error).toBeNull();
        expect(await projectRow(previewA)).toBeUndefined();
        expect(await projectRow(previewB)).toBeUndefined();
        expect(
            await database('dbt_repositories')
                .where('dbt_repository_uuid', repository)
                .first(),
        ).toMatchObject({
            is_shared: true,
            credential_project_uuid: owner,
        });
    });

    test('rechecks a consumer inserted between begin and final deletion and preserves the tombstone', async () => {
        const repository = await createRepository();
        const deleteContent = projects.deleteContentInBatches.bind(projects);
        vi.spyOn(projects, 'deleteContentInBatches').mockImplementation(
            async (projectUuid) => {
                await deleteContent(projectUuid);
                await createConsumer(previewA, repository);
            },
        );
        await expect(
            withPeerDbtSourcesOperation(true, () => projects.delete(owner)),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(
            (await projectRow(owner)).project_peer_deletion_started_at,
        ).toBeInstanceOf(Date);
        expect(
            await database('dbt_repositories')
                .where('dbt_repository_uuid', repository)
                .first(),
        ).toMatchObject({
            is_shared: true,
            credential_project_uuid: owner,
        });
    });

    test('uses the complete marked group and an explicit short final transaction without nesting', async () => {
        const repository = await createRepository();
        await createConsumer(previewA, repository);
        const group = [owner, previewA];
        await withPeerDbtSourcesOperation(true, async () => {
            await projects.beginDeletion(group);
            await Promise.all(
                group.map((projectUuid) =>
                    projects.deleteContentInBatches(projectUuid),
                ),
            );
            await database.transaction(async (trx) => {
                const transaction = vi.spyOn(database, 'transaction');
                try {
                    await projects.delete(owner, trx, group);
                    await projects.delete(previewA, trx, group);
                    expect(transaction).not.toHaveBeenCalled();
                    expect(trx.isCompleted()).toBe(false);
                } finally {
                    transaction.mockRestore();
                }
            });
        });
        expect(await projectRow(owner)).toBeUndefined();
        expect(await projectRow(previewA)).toBeUndefined();
    });
});
