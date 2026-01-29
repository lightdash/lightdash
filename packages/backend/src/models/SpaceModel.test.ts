import { NotFoundError, type AnyType } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, RawQuery, Tracker } from 'knex-mock-client';
import { SpaceTableName } from '../database/entities/spaces';
import * as SpaceModelModule from './SpaceModel';

describe('SpaceModel', () => {
    const model = new SpaceModelModule.SpaceModel({
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
                        path: 'root.parent.child',
                    },
                    {
                        space_uuid: 'parent-uuid',
                        name: 'Parent Space',
                        inherit_parent_permissions: true,
                        path: 'root.parent',
                    },
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: true,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            // Should stop at the first space since inherit_parent_permissions is false
            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                spaceUuid: 'child-uuid',
                spaceName: 'Child Space',
                inheritParentPermissions: false,
            });
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
                        path: 'root.parent.child.grandchild',
                    },
                    {
                        space_uuid: 'child-uuid',
                        name: 'Child Space',
                        inherit_parent_permissions: false, // Stop here
                        path: 'root.parent.child',
                    },
                    {
                        space_uuid: 'parent-uuid',
                        name: 'Parent Space',
                        inherit_parent_permissions: true,
                        path: 'root.parent',
                    },
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: true,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            // Should include grandchild (true) and child (false, but included), then stop
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                spaceUuid: 'grandchild-uuid',
                spaceName: 'GrandChild Space',
                inheritParentPermissions: true,
            });
            expect(result[1]).toEqual({
                spaceUuid: 'child-uuid',
                spaceName: 'Child Space',
                inheritParentPermissions: false,
            });
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
                        path: 'root.parent.child',
                    },
                    {
                        space_uuid: 'parent-uuid',
                        name: 'Parent Space',
                        inherit_parent_permissions: true,
                        path: 'root.parent',
                    },
                    {
                        space_uuid: 'root-uuid',
                        name: 'Root Space',
                        inherit_parent_permissions: true,
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            // Should include all ancestors up to root
            expect(result).toHaveLength(3);
            expect(result.map((s) => s.spaceUuid)).toEqual([
                'child-uuid',
                'parent-uuid',
                'root-uuid',
            ]);
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
                        path: 'root',
                    },
                ]);

            const result = await model.getInheritanceChain(spaceUuid);

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                spaceUuid: 'root-uuid',
                spaceName: 'Root Space',
                inheritParentPermissions: true,
            });
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

    describe('update - isPrivate and inheritParentPermissions sync', () => {
        const mockSpace = (parentSpaceUuid: string | null) => ({
            organizationUuid: 'org-uuid',
            name: 'Test Space',
            uuid: 'test-space-uuid',
            isPrivate: false,
            projectUuid: 'project-uuid',
            pinnedListUuid: null,
            pinnedListOrder: null,
            slug: 'test-space',
            parentSpaceUuid,
            path: parentSpaceUuid ? 'root.test' : 'test',
            inheritParentPermissions: true,
        });

        const mockFullSpace = (parentSpaceUuid: string | null) => ({
            ...mockSpace(parentSpaceUuid),
            queries: [],
            dashboards: [],
            childSpaces: [],
            access: [],
            groupsAccess: [],
            breadcrumbs: [],
        });

        // Create mock knex chain to capture update argument
        const createMockDatabase = () => {
            const mockWhere = jest.fn().mockResolvedValue(1);
            const mockUpdate = jest.fn().mockReturnValue({ where: mockWhere });
            const mockDatabase = jest.fn().mockReturnValue({
                update: mockUpdate,
            });
            return { mockDatabase: mockDatabase as AnyType, mockUpdate };
        };

        describe('root space (parentSpaceUuid = null)', () => {
            test('isPrivate=true should derive inheritParentPermissions=false', async () => {
                const spaceUuid = 'root-space-uuid';
                const { mockDatabase, mockUpdate } = createMockDatabase();

                const testModel = new SpaceModelModule.SpaceModel({
                    database: mockDatabase,
                });

                jest.spyOn(testModel, 'get').mockResolvedValueOnce(
                    mockSpace(null),
                );
                jest.spyOn(testModel, 'getFullSpace').mockResolvedValueOnce(
                    mockFullSpace(null),
                );

                await testModel.update(spaceUuid, { isPrivate: true });

                expect(mockUpdate).toHaveBeenCalledWith({
                    name: undefined,
                    is_private: true,
                    inherit_parent_permissions: false,
                });
            });

            test('isPrivate=false should derive inheritParentPermissions=true', async () => {
                const spaceUuid = 'root-space-uuid';
                const { mockDatabase, mockUpdate } = createMockDatabase();

                const testModel = new SpaceModelModule.SpaceModel({
                    database: mockDatabase,
                });

                jest.spyOn(testModel, 'get').mockResolvedValueOnce(
                    mockSpace(null),
                );
                jest.spyOn(testModel, 'getFullSpace').mockResolvedValueOnce(
                    mockFullSpace(null),
                );

                await testModel.update(spaceUuid, { isPrivate: false });

                expect(mockUpdate).toHaveBeenCalledWith({
                    name: undefined,
                    is_private: false,
                    inherit_parent_permissions: true,
                });
            });

            test('inheritParentPermissions=true should derive isPrivate=false', async () => {
                const spaceUuid = 'root-space-uuid';
                const { mockDatabase, mockUpdate } = createMockDatabase();

                const testModel = new SpaceModelModule.SpaceModel({
                    database: mockDatabase,
                });

                jest.spyOn(testModel, 'get').mockResolvedValueOnce(
                    mockSpace(null),
                );
                jest.spyOn(testModel, 'getFullSpace').mockResolvedValueOnce(
                    mockFullSpace(null),
                );

                await testModel.update(spaceUuid, {
                    inheritParentPermissions: true,
                });

                expect(mockUpdate).toHaveBeenCalledWith({
                    name: undefined,
                    is_private: false,
                    inherit_parent_permissions: true,
                });
            });

            test('inheritParentPermissions=false should derive isPrivate=true', async () => {
                const spaceUuid = 'root-space-uuid';
                const { mockDatabase, mockUpdate } = createMockDatabase();

                const testModel = new SpaceModelModule.SpaceModel({
                    database: mockDatabase,
                });

                jest.spyOn(testModel, 'get').mockResolvedValueOnce(
                    mockSpace(null),
                );
                jest.spyOn(testModel, 'getFullSpace').mockResolvedValueOnce(
                    mockFullSpace(null),
                );

                await testModel.update(spaceUuid, {
                    inheritParentPermissions: false,
                });

                expect(mockUpdate).toHaveBeenCalledWith({
                    name: undefined,
                    is_private: true,
                    inherit_parent_permissions: false,
                });
            });
        });

        describe('child space (parentSpaceUuid != null)', () => {
            test('isPrivate=true should always derive inheritParentPermissions=true', async () => {
                const spaceUuid = 'child-space-uuid';
                const { mockDatabase, mockUpdate } = createMockDatabase();

                const testModel = new SpaceModelModule.SpaceModel({
                    database: mockDatabase,
                });

                jest.spyOn(testModel, 'get').mockResolvedValueOnce(
                    mockSpace('parent-uuid'),
                );
                jest.spyOn(testModel, 'getFullSpace').mockResolvedValueOnce(
                    mockFullSpace('parent-uuid'),
                );

                await testModel.update(spaceUuid, { isPrivate: true });

                expect(mockUpdate).toHaveBeenCalledWith({
                    name: undefined,
                    is_private: true,
                    inherit_parent_permissions: true, // child spaces always inherit
                });
            });

            test('inheritParentPermissions should not change isPrivate for child spaces', async () => {
                const spaceUuid = 'child-space-uuid';
                const { mockDatabase, mockUpdate } = createMockDatabase();

                const testModel = new SpaceModelModule.SpaceModel({
                    database: mockDatabase,
                });

                jest.spyOn(testModel, 'get').mockResolvedValueOnce(
                    mockSpace('parent-uuid'),
                );
                jest.spyOn(testModel, 'getFullSpace').mockResolvedValueOnce(
                    mockFullSpace('parent-uuid'),
                );

                await testModel.update(spaceUuid, {
                    inheritParentPermissions: true,
                });

                expect(mockUpdate).toHaveBeenCalledWith({
                    name: undefined,
                    is_private: undefined, // not changed for child spaces
                    inherit_parent_permissions: true,
                });
            });
        });
    });
});
