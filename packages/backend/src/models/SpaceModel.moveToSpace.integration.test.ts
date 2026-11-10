import { DefaultSupportedDbtVersion, ProjectType } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import { SpaceTableName } from '../database/entities/spaces';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../testing/migratedDatabase';
import { SpaceModel } from './SpaceModel';

vi.mock('../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

type SpaceRow = {
    space_uuid: string;
    path: string;
    parent_space_uuid: string | null;
};

describe('SpaceModel.moveToSpace (PostgreSQL)', () => {
    let migrated: MigratedDatabase;
    let model: SpaceModel;
    let projectId: number;
    let projectUuid: string;

    const createSpace = async (
        name: string,
        path: string,
        parentSpaceUuid: string | null,
        { deleted = false }: { deleted?: boolean } = {},
    ): Promise<string> => {
        const [space] = await migrated
            .database(SpaceTableName)
            .insert({
                name,
                project_id: projectId,
                slug: `${name.toLowerCase()}-${randomUUID()}`,
                parent_space_uuid: parentSpaceUuid,
                path,
                inherit_parent_permissions: true,
                is_default_user_space: false,
            })
            .returning('space_uuid');
        if (deleted) {
            await migrated
                .database(SpaceTableName)
                .where('space_uuid', space.space_uuid)
                .update({ deleted_at: new Date(), deleted_by_user_uuid: null });
        }
        return space.space_uuid;
    };

    const getSpace = async (spaceUuid: string): Promise<SpaceRow> => {
        const row = await migrated
            .database(SpaceTableName)
            .where('space_uuid', spaceUuid)
            .first<SpaceRow | undefined>(
                'space_uuid',
                migrated.database.raw('path::text as path'),
                'parent_space_uuid',
            );
        if (!row) throw new Error(`Space ${spaceUuid} missing`);
        return row;
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, { min: 0, max: 2 });
        model = new SpaceModel({ database: migrated.database });
        const [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: 'Test org' })
            .returning('organization_id');
        const [project] = await migrated
            .database('projects')
            .insert({
                name: 'Space move project',
                organization_id: organization.organization_id,
                project_type: ProjectType.DEFAULT,
                dbt_connection: null,
                dbt_connection_type: null,
                copied_from_project_uuid: null,
                dbt_version: DefaultSupportedDbtVersion,
                organization_warehouse_credentials_uuid: null,
                created_by_user_uuid: null,
            })
            .returning(['project_id', 'project_uuid']);
        projectId = project.project_id;
        projectUuid = project.project_uuid;
    });

    beforeEach(async () => {
        await migrated
            .database(SpaceTableName)
            .where('project_id', projectId)
            .delete();
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('moves a space and its descendants under the target', async () => {
        const product = await createSpace('Product', 'product', null);
        const marketing = await createSpace('Marketing', 'marketing', null);
        const charts = await createSpace('Charts', 'product.charts', product);
        const nested = await createSpace(
            'Nested',
            'product.charts.nested',
            charts,
        );

        await model.moveToSpace({
            projectUuid,
            itemUuid: charts,
            targetSpaceUuid: marketing,
        });

        expect(await getSpace(charts)).toEqual({
            space_uuid: charts,
            path: 'marketing.charts',
            parent_space_uuid: marketing,
        });
        expect(await getSpace(nested)).toEqual({
            space_uuid: nested,
            path: 'marketing.charts.nested',
            parent_space_uuid: charts,
        });
    });

    it('does not move another space that shares the moved space path', async () => {
        const product = await createSpace('Product', 'product', null);
        const marketing = await createSpace('Marketing', 'marketing', null);
        const moved = await createSpace('Charts', 'product.charts', product);
        const sibling = await createSpace('Charts', 'product.charts', product);
        const siblingChild = await createSpace(
            'Child',
            'product.charts.child',
            sibling,
        );
        const deletedSibling = await createSpace(
            'Charts',
            'product.charts',
            product,
            { deleted: true },
        );

        await model.moveToSpace({
            projectUuid,
            itemUuid: moved,
            targetSpaceUuid: marketing,
        });

        expect(await getSpace(moved)).toMatchObject({
            path: 'marketing.charts',
            parent_space_uuid: marketing,
        });
        expect(await getSpace(sibling)).toMatchObject({
            path: 'product.charts',
            parent_space_uuid: product,
        });
        expect(await getSpace(siblingChild)).toMatchObject({
            path: 'product.charts.child',
            parent_space_uuid: sibling,
        });
        expect(await getSpace(deletedSibling)).toMatchObject({
            path: 'product.charts',
            parent_space_uuid: product,
        });
    });

    it('allows moving into a space whose path is under the moved space but is not its descendant', async () => {
        const product = await createSpace('Product', 'product', null);
        const moved = await createSpace('Charts', 'product.charts', product);
        const sibling = await createSpace('Charts', 'product.charts', product);
        const target = await createSpace(
            'Target',
            'product.charts.target',
            sibling,
        );

        await model.moveToSpace({
            projectUuid,
            itemUuid: moved,
            targetSpaceUuid: target,
        });

        expect(await getSpace(moved)).toMatchObject({
            path: 'product.charts.target.charts',
            parent_space_uuid: target,
        });
    });

    it('rejects moving a space into its own descendant', async () => {
        const product = await createSpace('Product', 'product', null);
        const child = await createSpace('Child', 'product.child', product);

        await expect(
            model.moveToSpace({
                projectUuid,
                itemUuid: product,
                targetSpaceUuid: child,
            }),
        ).rejects.toThrow('You cannot move a space into one of its own');
    });

    it('moves a space to the root', async () => {
        const product = await createSpace('Product', 'product', null);
        const charts = await createSpace('Charts', 'product.charts', product);

        await model.moveToSpace({
            projectUuid,
            itemUuid: charts,
            targetSpaceUuid: null,
        });

        expect(await getSpace(charts)).toMatchObject({
            path: 'charts',
            parent_space_uuid: null,
        });
    });

    it('terminates when descendants have a parent cycle', async () => {
        const root = await createSpace('Root', 'root', null);
        const a = await createSpace('A', 'a', null);
        const b = await createSpace('B', 'a.b', a);
        await migrated.database.raw(
            `UPDATE ${SpaceTableName} SET parent_space_uuid = ? WHERE space_uuid = ?`,
            [b, a],
        );

        await model.moveToSpace({
            projectUuid,
            itemUuid: a,
            targetSpaceUuid: root,
        });

        expect(await getSpace(a)).toMatchObject({
            path: 'root.a',
            parent_space_uuid: root,
        });
        expect(await getSpace(b)).toMatchObject({ path: 'root.a.b' });
    });
});
