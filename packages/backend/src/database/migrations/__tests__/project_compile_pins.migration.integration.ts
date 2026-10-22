import { ConflictError, DbtProjectType, ProjectType } from '@lightdash/common';
import { randomUUID } from 'crypto';
import {
    MAX_COMPILE_BINDINGS,
    MAX_COMPILE_METADATA_BYTES,
    ProjectCompileModel,
    type CompileBinding,
    type CompilePin,
    type CompileSlice,
} from '../../../models/ProjectCompileModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    ProjectCatalogueGenerationsTableName,
    ProjectCompilePinsTableName,
    ProjectSourceGenerationsTableName,
} from '../../entities/projectCompilePins';
import {
    down,
    up,
} from '../20261022161000_add_project_compile_pins_and_generations';

let migrated: MigratedDatabase;
let projectUuid: string;
let model: ProjectCompileModel;
const sources = [
    { sourceUuid: randomUUID(), sourceName: 'up_1' },
    { sourceUuid: randomUUID(), sourceName: 'up_2' },
];
const pin: CompilePin = {
    sourceUuid: sources[0].sourceUuid,
    commitSha: 'a'.repeat(40),
    dbtProjectName: 'project_a',
    capturedAt: '2026-10-22T12:00:00.000Z',
    deployMetadata: null,
};
const binding: CompileBinding = {
    consumerSourceUuid: sources[1].sourceUuid,
    consumerNodeId: 'model.project_b.model_x',
    refPackage: 'project_a',
    refName: 'model_x',
    requestedVersion: '2',
    providerSourceUuid: sources[0].sourceUuid,
    providerPackage: 'project_a',
    providerName: 'model_x',
    resolvedVersion: '2',
    providerCommitSha: pin.commitSha,
};

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    const [org] = await migrated
        .database('organizations')
        .insert({ organization_name: 'Compile fixture' })
        .returning('organization_id');
    const [project] = await migrated
        .database('projects')
        .insert({
            name: 'project_a',
            organization_id: org.organization_id,
            project_type: ProjectType.DEFAULT,
            dbt_connection_type: DbtProjectType.NONE,
            dbt_connection: null,
            copied_from_project_uuid: null,
            dbt_version: 'v1.9',
            created_by_user_uuid: null,
            organization_warehouse_credentials_uuid: null,
        })
        .returning('project_uuid');
    projectUuid = project.project_uuid;
    model = new ProjectCompileModel({ database: migrated.database });
});

afterAll(async () => migrated?.destroy());

beforeEach(async () => {
    await migrated.database(ProjectCompilePinsTableName).delete();
    await migrated.database(ProjectSourceGenerationsTableName).delete();
    await migrated.database(ProjectCatalogueGenerationsTableName).delete();
});

const publish = (
    slices: CompileSlice[],
    compileJobUuid = randomUUID(),
    pins: CompilePin[] = [pin],
    bindings: CompileBinding[] = [binding],
) =>
    migrated.database.transaction((trx) =>
        model.publish(trx, {
            projectUuid,
            compileJobUuid,
            slices,
            pins,
            bindings,
        }),
    );

test('capture is read-only and defaults each missing slice to zero', async () => {
    expect(await model.capture(projectUuid, sources)).toEqual(
        sources.map((source) => ({ ...source, generation: 0 })),
    );
    expect(await model.capture(projectUuid, [])).toEqual([]);
    expect(await migrated.database(ProjectSourceGenerationsTableName)).toEqual(
        [],
    );
    expect(
        await migrated.database(ProjectCatalogueGenerationsTableName),
    ).toEqual([]);
    expect(await migrated.database(ProjectCompilePinsTableName)).toEqual([]);
});

test('atomically advances generations and stores the complete pin and binding set', async () => {
    const slices = await model.capture(projectUuid, sources);
    const job = randomUUID();
    expect(await publish(slices, job)).toBe(1);
    expect(await model.capture(projectUuid, sources)).toEqual(
        sources.map((source) => ({ ...source, generation: 1 })),
    );
    expect(await model.get(projectUuid, job)).toMatchObject({
        generation: '1',
        pins: [pin],
        bindings: [binding],
        metadata_bytes:
            Buffer.byteLength(JSON.stringify([pin])) +
            Buffer.byteLength(JSON.stringify([binding])),
    });
    const next = await model.capture(projectUuid, [sources[0]]);
    expect(await publish(next)).toBe(2);
});

test('rejects a stale publish and rolls back other writes in the same transaction', async () => {
    const slices = await model.capture(projectUuid, sources);
    await publish(slices);
    const staleJob = randomUUID();
    await expect(
        migrated.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .update({ name: 'stale_write' });
            await model.publish(trx, {
                projectUuid,
                compileJobUuid: staleJob,
                slices,
                pins: [],
                bindings: [],
            });
        }),
    ).rejects.toThrow(ConflictError);
    expect(await model.get(projectUuid, staleJob)).toBeUndefined();
    expect(
        await migrated
            .database('projects')
            .where('project_uuid', projectUuid)
            .first('name'),
    ).toEqual({ name: 'project_a' });
    expect(
        await migrated.database(ProjectCatalogueGenerationsTableName),
    ).toEqual([{ project_uuid: projectUuid, generation: '1' }]);
});

test('allows simultaneous publishes of independent slices from the same snapshot', async () => {
    const [first, second] = await model.capture(projectUuid, sources);
    const generations = await Promise.all([
        publish([first]),
        publish([second]),
    ]);
    expect(generations.sort()).toEqual([1, 2]);
    expect(await migrated.database(ProjectCompilePinsTableName)).toHaveLength(
        2,
    );
    expect(await model.capture(projectUuid, sources)).toEqual(
        sources.map((source) => ({ ...source, generation: 1 })),
    );
});

test('permits one winner when two publishers race on the same new slice', async () => {
    const slices = await model.capture(projectUuid, [sources[0]]);
    const results = await Promise.allSettled([
        publish(slices),
        publish(slices),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
        1,
    );
    const rejected = results.find(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({
        status: 'rejected',
        reason: {
            message: `A newer deploy or refresh of source ${sources[0].sourceName} was published while this one ran, so nothing was changed. Run it again if you still need it.`,
        },
    });
    expect(await migrated.database(ProjectCompilePinsTableName)).toHaveLength(
        1,
    );
});

test('rejects a full refresh after a slice deploy without advancing untouched slices', async () => {
    const slices = await model.capture(projectUuid, sources);
    const sorted = [...slices].sort((left, right) =>
        left.sourceUuid.localeCompare(right.sourceUuid),
    );
    await publish([sorted[1]]);
    await expect(publish(slices)).rejects.toThrow(ConflictError);
    expect(await model.capture(projectUuid, sources)).toEqual(
        sources.map((source) => ({
            ...source,
            generation: source.sourceUuid === sorted[1].sourceUuid ? 1 : 0,
        })),
    );
    expect(await migrated.database(ProjectCompilePinsTableName)).toHaveLength(
        1,
    );
});

test('rejects a slice deploy after a full refresh', async () => {
    const slices = await model.capture(projectUuid, sources);
    await publish(slices);
    await expect(publish([slices[0]])).rejects.toThrow(ConflictError);
    expect(await migrated.database(ProjectCompilePinsTableName)).toHaveLength(
        1,
    );
});

test('rejects oversized binding sets before any generation write', async () => {
    const slices = await model.capture(projectUuid, sources);
    await expect(
        publish(
            slices,
            randomUUID(),
            [],
            Array(MAX_COMPILE_BINDINGS + 1).fill(binding),
        ),
    ).rejects.toThrow('Compile metadata exceeds the limit');
    expect(await migrated.database(ProjectSourceGenerationsTableName)).toEqual(
        [],
    );
    expect(await migrated.database(ProjectCompilePinsTableName)).toEqual([]);
});

test('rejects oversized metadata without truncating it', async () => {
    const slices = await model.capture(projectUuid, sources);
    await expect(
        publish(
            slices,
            randomUUID(),
            [
                {
                    ...pin,
                    dbtProjectName: 'x'.repeat(MAX_COMPILE_METADATA_BYTES),
                },
            ],
            [],
        ),
    ).rejects.toThrow('Compile metadata exceeds the limit');
    expect(
        await migrated.database(ProjectCatalogueGenerationsTableName),
    ).toEqual([]);
    expect(await migrated.database(ProjectCompilePinsTableName)).toEqual([]);
});

test('stores CLI metadata with a null commit and retains latest-ref bindings', async () => {
    const job = randomUUID();
    const cliPin: CompilePin = {
        ...pin,
        commitSha: null,
        deployMetadata: {
            userUuid: randomUUID(),
            requestMethod: 'cli',
            compilationSource: 'cli',
        },
    };
    const latest: CompileBinding = {
        ...binding,
        refPackage: null,
        requestedVersion: null,
        providerCommitSha: null,
    };
    await publish(
        await model.capture(projectUuid, sources),
        job,
        [cliPin],
        [latest],
    );
    expect(await model.get(projectUuid, job)).toMatchObject({
        pins: [cliPin],
        bindings: [latest],
    });
});

test('reverses all additive schema changes and can apply them again', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        expect(await trx.schema.hasTable(ProjectCompilePinsTableName)).toBe(
            false,
        );
        expect(
            await trx.schema.hasTable(ProjectSourceGenerationsTableName),
        ).toBe(false);
        expect(
            await trx.schema.hasTable(ProjectCatalogueGenerationsTableName),
        ).toBe(false);
        expect(
            await trx.schema.hasColumn(
                'deploy_sessions',
                'peer_compile_slices',
            ),
        ).toBe(false);
        await up(trx);
        expect(await trx.schema.hasTable(ProjectCompilePinsTableName)).toBe(
            true,
        );
        expect(
            await trx.schema.hasColumn(
                'deploy_sessions',
                'peer_compile_slices',
            ),
        ).toBe(true);
    });
});
