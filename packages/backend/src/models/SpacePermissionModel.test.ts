import { SpaceMemberRole } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import {
    SpaceGroupAccessTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import { SpacePermissionModel } from './SpacePermissionModel';

describe('SpacePermissionModel', () => {
    describe('getRawDirectAccess', () => {
        const database = knex({ client: MockClient, dialect: 'pg' });
        const model = new SpacePermissionModel(database);
        let tracker: Tracker;

        beforeAll(() => {
            tracker = getTracker();
        });

        afterEach(() => {
            tracker.reset();
        });

        it('does not query access tables for an empty space list', async () => {
            await expect(model.getRawDirectAccess([])).resolves.toEqual({});
            expect(tracker.history.select).toHaveLength(0);
        });

        it('returns persisted users and groups without expanding access', async () => {
            tracker.on.select(SpaceUserAccessTableName).responseOnce([
                {
                    spaceUuid: 'space-uuid',
                    userUuid: 'user-uuid',
                    email: 'user@example.com',
                    organizationMemberUserId: 1,
                    isInternal: false,
                    role: SpaceMemberRole.ADMIN,
                },
                {
                    spaceUuid: 'space-uuid',
                    userUuid: 'former-member-uuid',
                    email: 'former@example.com',
                    organizationMemberUserId: null,
                    isInternal: false,
                    role: SpaceMemberRole.VIEWER,
                },
            ]);
            tracker.on.select(SpaceGroupAccessTableName).responseOnce([
                {
                    spaceUuid: 'space-uuid',
                    groupUuid: 'group-uuid',
                    name: 'Finance',
                    role: SpaceMemberRole.EDITOR,
                },
            ]);

            await expect(
                model.getRawDirectAccess(['space-uuid', 'empty-space-uuid']),
            ).resolves.toEqual({
                'space-uuid': {
                    users: [
                        {
                            userUuid: 'user-uuid',
                            email: 'user@example.com',
                            isInternal: false,
                            role: SpaceMemberRole.ADMIN,
                        },
                        {
                            userUuid: 'former-member-uuid',
                            email: null,
                            isInternal: false,
                            role: SpaceMemberRole.VIEWER,
                        },
                    ],
                    groups: [
                        {
                            groupUuid: 'group-uuid',
                            name: 'Finance',
                            role: SpaceMemberRole.EDITOR,
                        },
                    ],
                },
                'empty-space-uuid': { users: [], groups: [] },
            });

            const userQuery = tracker.history.select.find(({ sql }) =>
                sql.includes(`"${SpaceUserAccessTableName}"`),
            );
            const groupQuery = tracker.history.select.find(({ sql }) =>
                sql.includes(`"${SpaceGroupAccessTableName}"`),
            );
            expect(userQuery?.sql).toContain('"organization_memberships"');
            expect(userQuery?.sql).toContain('"projects"."organization_id"');
            expect(groupQuery?.sql).toContain(
                '"groups"."organization_id" = "projects"."organization_id"',
            );
        });
    });

    describe('getInheritanceChains', () => {
        // Regression guard: the inheritance chain query MUST use a recursive CTE
        // that walks parent_space_uuid FK pointers, NOT ltree path @> joins.
        //
        // Why: getLtreePathFromSlug() is lossy (dashes become underscores), so
        // distinct slugs like "expert-unit" and "expert_unit" produce identical
        // ltree paths. An @> join matches both spaces, causing one space's
        // inherit_parent_permissions=false to incorrectly break another space's
        // chain — hiding 100+ users from "Who has access".
        //
        // If this test fails, someone has reintroduced ltree @> joins. Use the
        // parent_space_uuid recursive CTE instead.
        it('should use recursive CTE on parent_space_uuid, not ltree @> joins', async () => {
            let capturedSql = '';
            const mockRaw = vi.fn(async (sql: string) => {
                capturedSql = sql;
                return { rows: [] };
            });
            const mockDatabase = { raw: mockRaw } as unknown as Knex;
            const model = new SpacePermissionModel(mockDatabase);

            await model.getInheritanceChains(['some-space-uuid']);

            expect(mockRaw).toHaveBeenCalledTimes(1);
            expect(capturedSql).toContain('WITH RECURSIVE');
            expect(capturedSql).toContain('parent_space_uuid');
            expect(capturedSql).not.toContain('@>');
        });
    });

    describe('transaction executor', () => {
        let tracker: Tracker;

        beforeAll(() => {
            tracker = getTracker();
        });

        afterEach(() => {
            tracker.reset();
        });

        it('uses the provided transaction for every access-context query', async () => {
            const databaseQuery = vi.fn(() => {
                throw new Error('base database executor was used');
            });
            const databaseRaw = vi.fn(() => {
                throw new Error('base database raw executor was used');
            });
            const database = Object.assign(databaseQuery, {
                raw: databaseRaw,
            }) as unknown as Knex;
            const trx = knex({ client: MockClient, dialect: 'pg' });
            tracker = getTracker();
            tracker.reset();
            const model = new SpacePermissionModel(database);
            tracker.on
                .any(/.*/)
                .response(({ sql }) =>
                    sql.includes('WITH RECURSIVE') ? { rows: [] } : [],
                );

            await expect(
                model.getDirectSpaceAccess(['space-uuid'], undefined, { trx }),
            ).resolves.toEqual({});
            await expect(
                model.getProjectSpaceAccess(['space-uuid'], undefined, {
                    trx,
                }),
            ).resolves.toEqual({});
            await expect(
                model.getOrganizationSpaceAccess(['space-uuid'], undefined, {
                    trx,
                }),
            ).resolves.toEqual({});
            await expect(
                model.getSpaceInfo(['space-uuid'], { trx }),
            ).resolves.toEqual({});
            await expect(
                model.getInheritanceChains(['space-uuid'], { trx }),
            ).resolves.toEqual({});

            expect(databaseQuery).not.toHaveBeenCalled();
            expect(databaseRaw).not.toHaveBeenCalled();
        });
    });
});
