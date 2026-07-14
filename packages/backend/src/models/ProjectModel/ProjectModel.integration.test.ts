import {
    DimensionType,
    ExploreType,
    FieldType,
    isExploreError,
    MetricType,
    SEED_PROJECT,
    SupportedDbtAdapter,
    type Explore,
} from '@lightdash/common';
import knex, { type Knex } from 'knex';
import { omit } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import { parseConfig } from '../../config/parseConfig';
import {
    CachedExploresTableName,
    CachedExploreTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { ProjectModel } from './ProjectModel';

// These tests need only knex + ProjectModel, so they connect directly via
// PGCONNECTIONURI (pre-migrated dev/CI database) instead of booting the full
// app harness, which requires EE license validation.
let db: Knex;
let projectModel: ProjectModel;

beforeAll(() => {
    const connection = process.env.PGCONNECTIONURI;
    if (!connection) {
        throw new Error(
            'PGCONNECTIONURI environment variable is required for integration tests',
        );
    }
    db = knex({ client: 'pg', connection });
    const lightdashConfig = parseConfig();
    projectModel = new ProjectModel({
        database: db,
        lightdashConfig,
        encryptionUtil: new EncryptionUtil({ lightdashConfig }),
    });
});

afterAll(async () => {
    await db.destroy();
});

const createExplore = (name: string, type: ExploreType): Explore => ({
    name,
    label: name,
    tags: [],
    baseTable: name,
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    type,
    tables: {
        [name]: {
            name,
            label: name,
            database: 'analytics',
            schema: 'public',
            sqlTable: `"analytics"."public"."${name}"`,
            dimensions: {
                id: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'id',
                    label: 'Id',
                    table: name,
                    tableLabel: name,
                    sql: '${TABLE}."id"',
                    compiledSql: `"${name}"."id"`,
                    tablesReferences: [name],
                    hidden: false,
                },
            },
            metrics: {
                [`${name}_count`]: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                    name: `${name}_count`,
                    label: `${name} count`,
                    table: name,
                    tableLabel: name,
                    sql: `\${${name}.id}`,
                    compiledSql: `COUNT("${name}"."id")`,
                    compiledValueSql: `("${name}"."id")`,
                    tablesReferences: [name],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
});

describe('ProjectModel generated virtual explore persistence', () => {
    const projectUuid = uuidv4();

    beforeAll(async () => {
        const sourceProject = await db(ProjectTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .first();
        if (!sourceProject) throw new Error('Seed project was not found');
        const project = omit(sourceProject, ['project_id', 'project_uuid']);
        await db(ProjectTableName).insert({
            ...project,
            project_uuid: projectUuid,
            name: 'Semantic persistence integration project',
        } as never);
    });

    beforeEach(async () => {
        await db(CachedExploreTableName)
            .where('project_uuid', projectUuid)
            .delete();
        await db(CachedExploresTableName)
            .where('project_uuid', projectUuid)
            .delete();
    });

    afterAll(async () => {
        await db(ProjectTableName).where('project_uuid', projectUuid).delete();
    });

    it('preserves VIRTUAL generated explores across a deploy-path save and removes DEFAULT controls', async () => {
        const generatedVirtual = createExplore(
            'generated_virtual',
            ExploreType.VIRTUAL,
        );
        const generatedDefault = createExplore(
            'generated_default',
            ExploreType.DEFAULT,
        );
        const deployedExplore = createExplore(
            'deployed_explore',
            ExploreType.DEFAULT,
        );

        await projectModel.saveExploresToCache(projectUuid, [
            generatedVirtual,
            generatedDefault,
        ]);
        await projectModel.saveExploresToCache(projectUuid, [deployedExplore]);

        await expect(
            projectModel.getExploreFromCache(projectUuid, 'generated_virtual'),
        ).resolves.toMatchObject({ type: ExploreType.VIRTUAL });
        await expect(
            projectModel.getExploreFromCache(projectUuid, 'deployed_explore'),
        ).resolves.toMatchObject({ type: ExploreType.DEFAULT });
        await expect(
            projectModel.getExploreFromCache(projectUuid, 'generated_default'),
        ).rejects.toThrow('does not exist');
    });

    it('persists rename and hidden edits in both caches and across a deploy-path save', async () => {
        const generatedVirtual = createExplore(
            'editable_virtual',
            ExploreType.VIRTUAL,
        );
        const deployedExplore = createExplore(
            'deployed_explore',
            ExploreType.DEFAULT,
        );

        await projectModel.saveExploresToCache(projectUuid, [generatedVirtual]);
        await projectModel.updateCachedExploreField(
            projectUuid,
            generatedVirtual.name,
            'dimension',
            'id',
            { label: 'Order identifier', hidden: true },
        );

        const edited = await projectModel.getExploreFromCache(
            projectUuid,
            generatedVirtual.name,
        );
        expect(isExploreError(edited)).toBe(false);
        if (isExploreError(edited)) throw new Error('Expected a valid explore');
        expect(edited.tables.editable_virtual.dimensions.id).toMatchObject({
            label: 'Order identifier',
            hidden: true,
        });
        const aggregate = await db(CachedExploresTableName)
            .select<{ explores: Explore[] }>('explores')
            .where('project_uuid', projectUuid)
            .first();
        expect(
            aggregate?.explores.find(
                (explore) => explore.name === generatedVirtual.name,
            )?.tables.editable_virtual.dimensions.id,
        ).toMatchObject({ label: 'Order identifier', hidden: true });

        await projectModel.saveExploresToCache(projectUuid, [deployedExplore]);

        const preserved = await projectModel.getExploreFromCache(
            projectUuid,
            generatedVirtual.name,
        );
        expect(isExploreError(preserved)).toBe(false);
        if (isExploreError(preserved))
            throw new Error('Expected a valid explore');
        expect(preserved.tables.editable_virtual.dimensions.id).toMatchObject({
            label: 'Order identifier',
            hidden: true,
        });
    });

    it('deletes selected VIRTUAL explores from both caches', async () => {
        const removed = createExplore('removed_virtual', ExploreType.VIRTUAL);
        const survivor = createExplore(
            'surviving_virtual',
            ExploreType.VIRTUAL,
        );

        await projectModel.saveExploresToCache(projectUuid, [
            removed,
            survivor,
        ]);
        await projectModel.deleteCachedExploresByName(projectUuid, [
            removed.name,
        ]);

        const individualRows = await db(CachedExploreTableName)
            .select<{ name: string }[]>('name')
            .where('project_uuid', projectUuid);
        expect(individualRows.map(({ name }) => name)).toEqual([survivor.name]);
        const aggregate = await db(CachedExploresTableName)
            .select<{ explores: Explore[] }>('explores')
            .where('project_uuid', projectUuid)
            .first();
        expect(aggregate?.explores.map(({ name }) => name)).toEqual([
            survivor.name,
        ]);
        await expect(
            projectModel.getExploreFromCache(projectUuid, survivor.name),
        ).resolves.toMatchObject({ name: survivor.name });
    });

    it('replaces overlapping generated explores during regeneration', async () => {
        const generationA = {
            ...createExplore('overlapping_virtual', ExploreType.VIRTUAL),
            label: 'Generation A',
        };
        const staleGenerationA = createExplore(
            'stale_generation_a',
            ExploreType.VIRTUAL,
        );
        const generationB = {
            ...createExplore('overlapping_virtual', ExploreType.VIRTUAL),
            label: 'Generation B',
        };

        await projectModel.saveExploresToCache(projectUuid, [
            generationA,
            staleGenerationA,
        ]);
        await projectModel.deleteCachedExploresByName(projectUuid, [
            generationA.name,
            staleGenerationA.name,
        ]);
        await expect(
            projectModel.saveExploresToCache(projectUuid, [generationB]),
        ).resolves.toBeDefined();

        await expect(
            projectModel.getExploreFromCache(projectUuid, generationB.name),
        ).resolves.toMatchObject({ label: 'Generation B' });
        await expect(
            projectModel.getExploreFromCache(
                projectUuid,
                staleGenerationA.name,
            ),
        ).rejects.toThrow('does not exist');
        const aggregate = await db(CachedExploresTableName)
            .select<{ explores: Explore[] }>('explores')
            .where('project_uuid', projectUuid)
            .first();
        expect(aggregate?.explores).toEqual([
            expect.objectContaining({
                name: generationB.name,
                label: 'Generation B',
            }),
        ]);
    });
});
