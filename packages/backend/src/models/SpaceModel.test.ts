import { NotFoundError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { SpaceTableName } from '../database/entities/spaces';
import { SpaceModel } from './SpaceModel';

describe('SpaceModel', () => {
    const model = new SpaceModel({
        database: knex({ client: MockClient, dialect: 'pg' }),
    });

    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    describe('getInheritanceChain', () => {
        const projectId = 1;

        test('should return only the space itself when inherit_parent_permissions is false', async () => {
            const spaceUuid = 'child-uuid';
            const spacePath = 'root.parent.child';

            // First query: get the space's path and project_id
            tracker.on
                .select(
                    ({ sql, bindings }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('path') &&
                        sql.includes('project_id') &&
                        bindings.includes(spaceUuid),
                )
                .responseOnce({ path: spacePath, project_id: projectId });

            // Second query: get all ancestors ordered by level DESC
            tracker.on
                .select(
                    ({ sql }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('space_uuid') &&
                        sql.includes('inherit_parent_permissions') &&
                        sql.includes('nlevel'),
                )
                .responseOnce([
                    {
                        space_uuid: 'child-uuid',
                        name: 'Child Space',
                        inherit_parent_permissions: false,
                        parent_space_uuid: 'parent-uuid',
                        path: 'root.parent.child',
                    },
                    {
                        space_uuid: 'parent-uuid',
                        name: 'Parent Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: 'root-uuid',
                        path: 'root.parent',
                    },
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: null,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            // Should stop at the first space since inherit_parent_permissions is false
            expect(result.chain).toHaveLength(1);
            expect(result.chain[0]).toEqual({
                spaceUuid: 'child-uuid',
                spaceName: 'Child Space',
                inheritParentPermissions: false,
            });
            // inherit_parent_permissions is false, so no project/org inheritance
            expect(result.inheritsFromOrgOrProject).toBe(false);
        });

        test('should return chain up to the first inherit=false ancestor', async () => {
            const spaceUuid = 'grandchild-uuid';
            const spacePath = 'root.parent.child.grandchild';

            // First query: get the space's path and project_id
            tracker.on
                .select(
                    ({ sql, bindings }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('path') &&
                        sql.includes('project_id') &&
                        bindings.includes(spaceUuid),
                )
                .responseOnce({ path: spacePath, project_id: projectId });

            // Second query: get all ancestors ordered by level DESC (leaf first)
            tracker.on
                .select(
                    ({ sql }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('space_uuid') &&
                        sql.includes('inherit_parent_permissions') &&
                        sql.includes('nlevel'),
                )
                .responseOnce([
                    {
                        space_uuid: 'grandchild-uuid',
                        name: 'GrandChild Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: 'child-uuid',
                        path: 'root.parent.child.grandchild',
                    },
                    {
                        space_uuid: 'child-uuid',
                        name: 'Child Space',
                        inherit_parent_permissions: false, // Stop here
                        parent_space_uuid: 'parent-uuid',
                        path: 'root.parent.child',
                    },
                    {
                        space_uuid: 'parent-uuid',
                        name: 'Parent Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: 'root-uuid',
                        path: 'root.parent',
                    },
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: null,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            // Should include grandchild (true) and child (false, but included), then stop
            expect(result.chain).toHaveLength(2);
            expect(result.chain[0]).toEqual({
                spaceUuid: 'grandchild-uuid',
                spaceName: 'GrandChild Space',
                inheritParentPermissions: true,
            });
            expect(result.chain[1]).toEqual({
                spaceUuid: 'child-uuid',
                spaceName: 'Child Space',
                inheritParentPermissions: false,
            });
            // Last space (child) has inherit=false, so no project/org inheritance
            expect(result.inheritsFromOrgOrProject).toBe(false);
        });

        test('should return full chain to root when all have inherit=true', async () => {
            const spaceUuid = 'child-uuid';
            const spacePath = 'root.parent.child';

            // First query: get the space's path and project_id
            tracker.on
                .select(
                    ({ sql, bindings }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('path') &&
                        sql.includes('project_id') &&
                        bindings.includes(spaceUuid),
                )
                .responseOnce({ path: spacePath, project_id: projectId });

            // Second query: get all ancestors ordered by level DESC (leaf first)
            tracker.on
                .select(
                    ({ sql }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('space_uuid') &&
                        sql.includes('inherit_parent_permissions') &&
                        sql.includes('nlevel'),
                )
                .responseOnce([
                    {
                        space_uuid: 'child-uuid',
                        name: 'Child Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: 'parent-uuid',
                        path: 'root.parent.child',
                    },
                    {
                        space_uuid: 'parent-uuid',
                        name: 'Parent Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: 'root-uuid',
                        path: 'root.parent',
                    },
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: null,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            // Should include all ancestors up to root
            expect(result.chain).toHaveLength(3);
            expect(result.chain.map((s) => s.spaceUuid)).toEqual([
                'child-uuid',
                'parent-uuid',
                'root-uuid',
            ]);
            // Root has inherit=true and no parent, so project/org inheritance applies
            expect(result.inheritsFromOrgOrProject).toBe(true);
        });

        test('should return only root when querying a root space', async () => {
            const spaceUuid = 'root-uuid';
            const spacePath = 'root';

            // First query: get the space's path and project_id
            tracker.on
                .select(
                    ({ sql, bindings }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('path') &&
                        sql.includes('project_id') &&
                        bindings.includes(spaceUuid),
                )
                .responseOnce({ path: spacePath, project_id: projectId });

            // Second query: get all ancestors (just root itself)
            tracker.on
                .select(
                    ({ sql }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('space_uuid') &&
                        sql.includes('inherit_parent_permissions') &&
                        sql.includes('nlevel'),
                )
                .responseOnce([
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: true,
                        parent_space_uuid: null,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            expect(result.chain).toHaveLength(1);
            expect(result.chain[0]).toEqual({
                spaceUuid: 'root-uuid',
                spaceName: 'Root Space',
                inheritParentPermissions: true,
            });
            // Root has inherit=true and no parent, so project/org inheritance applies
            expect(result.inheritsFromOrgOrProject).toBe(true);
        });

        test('should return inheritsFromOrgOrProject=false for root with inherit=false', async () => {
            const spaceUuid = 'root-uuid';
            const spacePath = 'root';

            // First query: get the space's path and project_id
            tracker.on
                .select(
                    ({ sql, bindings }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('path') &&
                        sql.includes('project_id') &&
                        bindings.includes(spaceUuid),
                )
                .responseOnce({ path: spacePath, project_id: projectId });

            // Second query: get all ancestors (just root itself with inherit=false)
            tracker.on
                .select(
                    ({ sql }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('space_uuid') &&
                        sql.includes('inherit_parent_permissions') &&
                        sql.includes('nlevel'),
                )
                .responseOnce([
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: false,
                        parent_space_uuid: null,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            expect(result.chain).toHaveLength(1);
            expect(result.chain[0]).toEqual({
                spaceUuid: 'root-uuid',
                spaceName: 'Root Space',
                inheritParentPermissions: false,
            });
            // Root has inherit=false, so no project/org inheritance
            expect(result.inheritsFromOrgOrProject).toBe(false);
        });

        test('should throw NotFoundError when space does not exist', async () => {
            const spaceUuid = 'non-existent-uuid';

            // First query: space not found
            tracker.on
                .select(
                    ({ sql, bindings }: RawQuery) =>
                        sql.includes(SpaceTableName) &&
                        sql.includes('path') &&
                        sql.includes('project_id') &&
                        bindings.includes(spaceUuid),
                )
                .responseOnce(undefined);

            await expect(
                model.getInheritanceChain(spaceUuid),
            ).rejects.toThrowError(NotFoundError);
        });
    });
});
