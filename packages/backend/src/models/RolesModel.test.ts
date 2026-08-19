import {
    AlreadyExistsError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { DatabaseError } from 'pg';
import { OrganizationMembershipCustomRolesTableName } from '../database/entities/organizationMembershipCustomRoles';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { ProjectMembershipCustomRolesTableName } from '../database/entities/projectMembershipCustomRoles';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { RolesTableName } from '../database/entities/roles';
import { RolesModel } from './RolesModel';

const databaseError = (code: string): DatabaseError => {
    const error = new DatabaseError(`database error ${code}`, 0, 'error');
    error.code = code;
    return error;
};

const uniqueViolation = () => databaseError('23505');

describe('RolesModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new RolesModel(database);
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('createRole', () => {
        const roleData = {
            name: 'Copy of: Editor',
            description: null,
            level: 'organization' as const,
            created_by: 'user-uuid',
        };

        it('translates a unique-name violation into AlreadyExistsError', async () => {
            tracker.on
                .insert(RolesTableName)
                .simulateErrorOnce(uniqueViolation());

            await expect(
                model.createRole('org-uuid', roleData),
            ).rejects.toThrow(AlreadyExistsError);
        });

        it('names the conflicting role in the error message', async () => {
            tracker.on
                .insert(RolesTableName)
                .simulateErrorOnce(uniqueViolation());

            await expect(
                model.createRole('org-uuid', roleData),
            ).rejects.toThrow('A role named "Copy of: Editor" already exists');
        });

        it('rethrows non-unique database errors unchanged', async () => {
            const foreignKeyViolation = databaseError('23503');
            tracker.on
                .insert(RolesTableName)
                .simulateErrorOnce(foreignKeyViolation);

            await expect(model.createRole('org-uuid', roleData)).rejects.toBe(
                foreignKeyViolation,
            );
        });
    });

    describe('updateRole', () => {
        it('translates a unique-name violation into AlreadyExistsError', async () => {
            tracker.on
                .update(RolesTableName)
                .simulateErrorOnce(uniqueViolation());

            await expect(
                model.updateRole('role-uuid', { name: 'Copy of: Editor' }),
            ).rejects.toThrow(AlreadyExistsError);
        });

        it('rethrows non-unique database errors unchanged', async () => {
            const foreignKeyViolation = databaseError('23503');
            tracker.on
                .update(RolesTableName)
                .simulateErrorOnce(foreignKeyViolation);

            await expect(
                model.updateRole('role-uuid', { name: 'Copy of: Editor' }),
            ).rejects.toBe(foreignKeyViolation);
        });

        it('throws NotFoundError when the role does not exist', async () => {
            tracker.on.update(RolesTableName).responseOnce([]);

            await expect(
                model.updateRole('missing-uuid', { description: 'x' }),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('getOrganizationUserRoleSet', () => {
        beforeEach(() => {
            tracker.on.select('users').response([{ user_id: 7 }]);
            tracker.on
                .select('organizations')
                .response([{ organization_id: 3 }]);
        });

        it('returns the system role plus extras when the slot has no custom role', async () => {
            tracker.on
                .select(OrganizationMembershipsTableName)
                .response([
                    { role: OrganizationMemberRole.EDITOR, role_uuid: null },
                ]);
            tracker.on
                .select(OrganizationMembershipCustomRolesTableName)
                .response([{ role_uuid: 'extra-1' }, { role_uuid: 'extra-2' }]);

            await expect(
                model.getOrganizationUserRoleSet('org-uuid', 'user-uuid'),
            ).resolves.toEqual({
                systemRole: OrganizationMemberRole.EDITOR,
                customRoleUuids: ['extra-1', 'extra-2'],
            });
        });

        it('never surfaces the member placeholder when the slot holds a custom role', async () => {
            tracker.on
                .select(OrganizationMembershipsTableName)
                .response([
                    { role: OrganizationMemberRole.MEMBER, role_uuid: 'slot' },
                ]);
            tracker.on
                .select(OrganizationMembershipCustomRolesTableName)
                .response([{ role_uuid: 'extra-1' }]);

            await expect(
                model.getOrganizationUserRoleSet('org-uuid', 'user-uuid'),
            ).resolves.toEqual({
                systemRole: null,
                customRoleUuids: ['slot', 'extra-1'],
            });
        });

        it('throws NotFoundError when the user is not a member', async () => {
            tracker.on.select(OrganizationMembershipsTableName).response([]);

            await expect(
                model.getOrganizationUserRoleSet('org-uuid', 'user-uuid'),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe('replaceOrganizationUserRoleSet', () => {
        it('rejects an empty set before touching the database', async () => {
            await expect(
                model.replaceOrganizationUserRoleSet('org-uuid', 'user-uuid', {
                    systemRole: null,
                    customRoleUuids: [],
                }),
            ).rejects.toThrow(ParameterError);
            expect(tracker.history.all).toHaveLength(0);
        });
    });

    describe('singular writers replace the whole role set', () => {
        beforeEach(() => {
            tracker.on.select('users').response([{ user_id: 7 }]);
            tracker.on
                .select('organizations')
                .response([{ organization_id: 3 }]);
            tracker.on.select('projects').response([{ project_id: 5 }]);
        });

        it('upsertOrganizationUserRoleAssignment clears org extras in the same transaction', async () => {
            tracker.on
                .select(OrganizationMembershipsTableName)
                .response([
                    { role: OrganizationMemberRole.EDITOR, role_uuid: null },
                ]);
            tracker.on.update(OrganizationMembershipsTableName).response(1);
            tracker.on
                .delete(OrganizationMembershipCustomRolesTableName)
                .response(0);

            await model.upsertOrganizationUserRoleAssignment(
                'org-uuid',
                'user-uuid',
                OrganizationMemberRole.EDITOR,
            );

            const [clear] = tracker.history.delete;
            expect(clear.sql).toContain(
                OrganizationMembershipCustomRolesTableName,
            );
            expect(clear.bindings).toEqual([3, 7]);
        });

        it('upsertSystemRoleProjectAccess clears project extras', async () => {
            tracker.on.insert(ProjectMembershipsTableName).response([]);
            tracker.on
                .delete(ProjectMembershipCustomRolesTableName)
                .response(0);

            await model.upsertSystemRoleProjectAccess(
                'project-uuid',
                'user-uuid',
                ProjectMemberRole.VIEWER,
            );

            const [clear] = tracker.history.delete;
            expect(clear.sql).toContain(ProjectMembershipCustomRolesTableName);
            expect(clear.bindings).toEqual([5, 7]);
        });
    });

    describe('replaceOrganizationUserRoleSet validation', () => {
        const ORG_ROLE = '11111111-1111-4111-a111-111111111111';

        it('rejects malformed custom role ids before querying roles', async () => {
            await expect(
                model.replaceOrganizationUserRoleSet('org-uuid', 'user-uuid', {
                    systemRole: null,
                    customRoleUuids: ['admin'],
                }),
            ).rejects.toThrow(ParameterError);
            expect(tracker.history.select).toHaveLength(0);
        });

        it('rejects a custom role that is missing or belongs to another organization', async () => {
            tracker.on.select(RolesTableName).response([]);

            await expect(
                model.replaceOrganizationUserRoleSet('org-uuid', 'user-uuid', {
                    systemRole: null,
                    customRoleUuids: [ORG_ROLE],
                }),
            ).rejects.toThrow(NotFoundError);
            expect(tracker.history.update).toHaveLength(0);
        });

        it('rejects a project-level custom role at organization level', async () => {
            tracker.on
                .select(RolesTableName)
                .response([{ role_uuid: ORG_ROLE, level: 'project' }]);

            await expect(
                model.replaceOrganizationUserRoleSet('org-uuid', 'user-uuid', {
                    systemRole: null,
                    customRoleUuids: [ORG_ROLE],
                }),
            ).rejects.toThrow(ParameterError);
            expect(tracker.history.update).toHaveLength(0);
        });

        it('throws NotFoundError when the user is not a member (no extras written)', async () => {
            tracker.on
                .select(RolesTableName)
                .response([{ role_uuid: ORG_ROLE, level: 'organization' }]);
            tracker.on.select('users').response([{ user_id: 7 }]);
            tracker.on
                .select('organizations')
                .response([{ organization_id: 3 }]);
            tracker.on.select(OrganizationMembershipsTableName).response([]);
            tracker.on.update(OrganizationMembershipsTableName).response(0);

            await expect(
                model.replaceOrganizationUserRoleSet('org-uuid', 'user-uuid', {
                    systemRole: OrganizationMemberRole.VIEWER,
                    customRoleUuids: [ORG_ROLE],
                }),
            ).rejects.toThrow(NotFoundError);
            expect(tracker.history.insert).toHaveLength(0);
        });

        it('writes slot then replaces extras for a custom-only set', async () => {
            const SECOND = '22222222-2222-4222-a222-222222222222';
            tracker.on.select(RolesTableName).response([
                { role_uuid: ORG_ROLE, level: 'organization' },
                { role_uuid: SECOND, level: 'organization' },
            ]);
            tracker.on.select('users').response([{ user_id: 7 }]);
            tracker.on
                .select('organizations')
                .response([{ organization_id: 3 }]);
            tracker.on.select(OrganizationMembershipsTableName).response([
                {
                    role: OrganizationMemberRole.MEMBER,
                    role_uuid: ORG_ROLE,
                },
            ]);
            tracker.on
                .select(OrganizationMembershipCustomRolesTableName)
                .response([{ role_uuid: SECOND }]);
            tracker.on.update(OrganizationMembershipsTableName).response(1);
            tracker.on
                .delete(OrganizationMembershipCustomRolesTableName)
                .response(0);
            tracker.on
                .insert(OrganizationMembershipCustomRolesTableName)
                .response([]);

            const result = await model.replaceOrganizationUserRoleSet(
                'org-uuid',
                'user-uuid',
                {
                    systemRole: null,
                    customRoleUuids: [ORG_ROLE, SECOND, ORG_ROLE],
                },
            );
            expect(result).toEqual({
                systemRole: null,
                customRoleUuids: [ORG_ROLE, SECOND],
            });

            const [slot] = tracker.history.update;
            // custom-only: first custom role in the slot with the member placeholder
            expect(slot.bindings).toEqual(
                expect.arrayContaining([
                    OrganizationMemberRole.MEMBER,
                    ORG_ROLE,
                ]),
            );
            expect(tracker.history.delete).toHaveLength(1);
            const [extras] = tracker.history.insert;
            expect(extras.bindings).toEqual(
                expect.arrayContaining([3, 7, SECOND]),
            );
            expect(extras.bindings).not.toContain(ORG_ROLE);
        });
    });

    describe('assertAnotherActiveAdmin', () => {
        beforeEach(() => {
            tracker.on
                .select(({ sql }) =>
                    sql.startsWith(
                        'select "organization_id" from "organizations"',
                    ),
                )
                .response([{ organization_id: 3 }]);
            tracker.on
                .select(({ sql }) =>
                    sql.startsWith('select "user_id" from "users"'),
                )
                .response([{ user_id: 7 }]);
        });

        it('locks admin rows and throws when the excluded user is the only active admin', async () => {
            tracker.on
                .select(({ sql }) => sql.includes('for update'))
                .response([{ user_id: 7 }]);

            await expect(
                database.transaction((trx) =>
                    model.assertAnotherActiveAdmin(
                        'org-uuid',
                        'only-admin',
                        trx,
                    ),
                ),
            ).rejects.toThrow('Organization must have at least one admin');
            const lockQuery = tracker.history.select.find(({ sql }) =>
                sql.includes('for update'),
            );
            expect(lockQuery?.sql).toContain(OrganizationMembershipsTableName);
        });

        it('passes when another active admin remains', async () => {
            tracker.on
                .select(({ sql }) => sql.includes('for update'))
                .response([{ user_id: 7 }, { user_id: 8 }]);

            await expect(
                database.transaction((trx) =>
                    model.assertAnotherActiveAdmin('org-uuid', 'a', trx),
                ),
            ).resolves.toBeUndefined();
        });
    });
});
