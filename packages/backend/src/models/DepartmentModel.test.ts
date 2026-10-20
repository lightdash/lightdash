// packages/backend/src/models/DepartmentModel.test.ts
import { AlreadyExistsError, ParameterError } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
    DepartmentLinkTableName,
    DepartmentMemberTableName,
    DepartmentOwnerTableName,
    DepartmentTableName,
} from '../database/entities/departments';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { DepartmentModel } from './DepartmentModel';

const departmentRow = (over: Record<string, unknown> = {}) => ({
    department_uuid: 'dep',
    organization_uuid: 'org',
    parent_department_uuid: null,
    name: 'Operations',
    headcount: null,
    headcount_note: null,
    target_active_users: null,
    target_date: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    updated_by_user_uuid: null,
    ...over,
});

// Plain builder selects on the departments table, not the recursive raw query
const SELECT_DEPARTMENTS = new RegExp(
    `^select .* from "${DepartmentTableName}"`,
);

describe('DepartmentModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new DepartmentModel({ database });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => {
        tracker.reset();
    });

    it('rejects a group link when the group is not in the org', async () => {
        tracker.on.select(GroupTableName).responseOnce([{ group_uuid: 'g1' }]);
        await expect(
            model.setGroupLinks('org', 'dep', ['g1', 'g2']),
        ).rejects.toThrow(
            new ParameterError('Group g2 is not in this organization'),
        );
    });

    it('rejects a member who is not in the org', async () => {
        tracker.on
            .select(OrganizationMembershipsTableName)
            .responseOnce([{ user_uuid: 'u1' }]);
        await expect(
            model.setMembers('org', 'dep', ['u1', 'u2']),
        ).rejects.toThrow(
            new ParameterError('User u2 is not in this organization'),
        );
    });

    it('excludes internal users from the membership check used by members and owners', async () => {
        tracker.on.select(OrganizationMembershipsTableName).response([]);
        await expect(
            model.setMembers('org', 'dep', ['internal-user']),
        ).rejects.toThrow(
            new ParameterError(
                'User internal-user is not in this organization',
            ),
        );
        await expect(
            model.setOwners('org', 'dep', [
                { type: 'user', uuid: 'internal-user' },
            ]),
        ).rejects.toThrow(
            new ParameterError(
                'User internal-user is not in this organization',
            ),
        );
        const selects = tracker.history.select.filter((q) =>
            q.sql.includes(OrganizationMembershipsTableName),
        );
        expect(selects).toHaveLength(2);
        selects.forEach((q) => {
            expect(q.sql).toContain('"users"."is_internal" = $');
            expect(q.bindings).toContain(false);
        });
    });

    it('rejects a user owner who is not in the org', async () => {
        tracker.on.select(OrganizationMembershipsTableName).responseOnce([]);
        await expect(
            model.setOwners('org', 'dep', [{ type: 'user', uuid: 'u9' }]),
        ).rejects.toThrow(
            new ParameterError('User u9 is not in this organization'),
        );
    });

    it('rejects a group owner that is not in the org', async () => {
        tracker.on.select(GroupTableName).responseOnce([]);
        await expect(
            model.setOwners('org', 'dep', [{ type: 'group', uuid: 'g9' }]),
        ).rejects.toThrow(
            new ParameterError('Group g9 is not in this organization'),
        );
    });

    it('rejects moving a department under its own descendant', async () => {
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        // The walk up from the new parent reaches the department being moved
        tracker.on
            .any(/with recursive/i)
            .response({ rows: [{ department_uuid: 'dep' }] });
        await expect(
            model.update(
                'org',
                'dep',
                { parentDepartmentUuid: 'grandchild' },
                'user',
            ),
        ).rejects.toThrow(
            new ParameterError(
                'A department cannot sit under itself or one of its sub-departments',
            ),
        );
        expect(tracker.history.update).toHaveLength(0);
    });

    it('rejects a parent that is not in the org', async () => {
        tracker.on.select(SELECT_DEPARTMENTS).responseOnce([departmentRow()]);
        tracker.on.select(SELECT_DEPARTMENTS).responseOnce([]);
        await expect(
            model.update('org', 'dep', { parentDepartmentUuid: 'p9' }, 'user'),
        ).rejects.toThrow(
            new ParameterError('Department p9 is not in this organization'),
        );
    });

    it('re-parents children to the deleted department parent before deleting', async () => {
        tracker.on
            .select(SELECT_DEPARTMENTS)
            .response([departmentRow({ parent_department_uuid: 'parent' })]);
        tracker.on.update(DepartmentTableName).response(2);
        tracker.on.delete(DepartmentTableName).response(1);

        await model.delete('org', 'dep');

        expect(tracker.history.update).toHaveLength(1);
        const [update] = tracker.history.update;
        expect(update.sql).toContain('"parent_department_uuid" = $1');
        expect(update.bindings).toEqual(
            expect.arrayContaining(['parent', 'dep', 'org']),
        );
        expect(tracker.history.delete).toHaveLength(1);
    });

    it('reads target_date as text so no timezone can shift the day', async () => {
        tracker.on
            .select(SELECT_DEPARTMENTS)
            .response([departmentRow({ target_date: '2026-03-31' })]);
        tracker.on.select(/from "department_links"/).response([]);
        tracker.on.select(/from "department_members"/).response([]);
        tracker.on.select(/from "department_owners"/).response([]);

        const [department] = await model.listByOrganization('org');

        expect(department.targetDate).toBe('2026-03-31');
        expect(tracker.history.select[0].sql).toContain(
            `to_char(target_date, 'YYYY-MM-DD') as target_date`,
        );
    });

    it('drops links and owners whose group or user no longer exists via inner joins', async () => {
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        tracker.on.select(/from "department_links"/).response([]);
        tracker.on.select(/from "department_members"/).response([]);
        tracker.on.select(/from "department_owners"/).response([]);

        await model.getByUuid('org', 'dep');

        const sqls = tracker.history.select.map((q) => q.sql);
        expect(
            sqls.find((s) => s.includes(`from "${DepartmentLinkTableName}"`)),
        ).toContain('inner join "groups"');
        const ownerSqls = sqls.filter((s) =>
            s.includes(`from "${DepartmentOwnerTableName}"`),
        );
        expect(ownerSqls).toHaveLength(2);
        expect(ownerSqls.some((s) => s.includes('inner join "users"'))).toBe(
            true,
        );
        expect(ownerSqls.some((s) => s.includes('inner join "groups"'))).toBe(
            true,
        );
    });

    it('orders hydrated owners by position across users and groups', async () => {
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        tracker.on.select(/from "department_links"/).response([]);
        tracker.on.select(/from "department_members"/).response([]);
        tracker.on.select(/inner join "users"/).response([
            {
                department_uuid: 'dep',
                principal_uuid: 'u1',
                position: 1,
                name: 'Ada Lovelace',
            },
        ]);
        tracker.on
            .select(/from "department_owners" inner join "groups"/)
            .response([
                {
                    department_uuid: 'dep',
                    principal_uuid: 'g1',
                    position: 0,
                    name: 'Finance',
                },
            ]);

        const department = await model.getByUuid('org', 'dep');

        expect(department.owners).toEqual([
            { type: 'group', uuid: 'g1', name: 'Finance' },
            { type: 'user', uuid: 'u1', name: 'Ada Lovelace' },
        ]);
    });

    it('rejects creating under a parent that is not in the org', async () => {
        tracker.on.select(SELECT_DEPARTMENTS).response([]);
        await expect(
            model.create(
                'org',
                {
                    name: 'Ops',
                    parentDepartmentUuid: 'p9',
                    headcount: null,
                    headcountNote: null,
                    targetActiveUsers: null,
                    targetDate: null,
                },
                'user',
            ),
        ).rejects.toThrow(
            new ParameterError('Department p9 is not in this organization'),
        );
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('maps a duplicate name to AlreadyExistsError', async () => {
        tracker.on
            .insert(DepartmentTableName)
            .simulateError(
                Object.assign(new Error('duplicate key'), { code: '23505' }),
            );
        await expect(
            model.create(
                'org',
                {
                    name: ' Operations ',
                    parentDepartmentUuid: null,
                    headcount: null,
                    headcountNote: null,
                    targetActiveUsers: null,
                    targetDate: '2026-03-31',
                },
                'user',
            ),
        ).rejects.toThrow(
            new AlreadyExistsError(
                'A department named "Operations" already exists',
            ),
        );
    });

    it('replaces group links, taking each group from any other department', async () => {
        tracker.on
            .select(/^select .* from "groups"/)
            .responseOnce([{ group_uuid: 'g1' }]);
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        tracker.on.select(/from "department_links"/).response([]);
        tracker.on.select(/from "department_members"/).response([]);
        tracker.on.select(/from "department_owners"/).response([]);
        tracker.on.delete(DepartmentLinkTableName).response(0);
        tracker.on.insert(DepartmentLinkTableName).response([]);

        await model.setGroupLinks('org', 'dep', ['g1', 'g1']);

        expect(tracker.history.delete).toHaveLength(2);
        expect(tracker.history.delete[0].bindings).toEqual(['group', 'g1']);
        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.insert[0].bindings).toEqual([
            'dep',
            'group',
            'g1',
        ]);
    });

    it('replaces members, clearing the user from other departments in the org', async () => {
        tracker.on
            .select(/inner join "organizations"/)
            .responseOnce([{ user_uuid: 'u1' }]);
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        tracker.on.select(/from "department_links"/).response([]);
        tracker.on.select(/from "department_members"/).response([]);
        tracker.on.select(/from "department_owners"/).response([]);
        tracker.on.delete(DepartmentMemberTableName).response(0);
        tracker.on.insert(DepartmentMemberTableName).response([]);

        await model.setMembers('org', 'dep', ['u1']);

        expect(tracker.history.delete).toHaveLength(2);
        expect(tracker.history.delete[0].sql).toContain(
            `"department_uuid" in (select "department_uuid" from "${DepartmentTableName}"`,
        );
        expect(tracker.history.insert[0].bindings).toEqual(['dep', 'u1']);
    });

    it('stores owners in the order given', async () => {
        tracker.on
            .select(/inner join "organizations"/)
            .response([{ user_uuid: 'u1' }, { group_uuid: 'g1' }]);
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        tracker.on.select(/from "department_links"/).response([]);
        tracker.on.select(/from "department_members"/).response([]);
        tracker.on.select(/from "department_owners"/).response([]);
        tracker.on.delete(DepartmentOwnerTableName).response(0);
        tracker.on.insert(DepartmentOwnerTableName).response([]);

        await model.setOwners('org', 'dep', [
            { type: 'group', uuid: 'g1' },
            { type: 'user', uuid: 'u1' },
        ]);

        // Columns bind alphabetically: department_uuid, position, principal_type, principal_uuid
        expect(tracker.history.insert[0].bindings).toEqual([
            'dep',
            0,
            'group',
            'g1',
            'dep',
            1,
            'user',
            'u1',
        ]);
    });

    it('maps resolved member rows and defaults missing group links to empty', async () => {
        tracker.on.any(/with org as/i).response({
            rows: [
                {
                    user_uuid: 'u1',
                    email: 'a@example.com',
                    first_name: 'Ada',
                    last_name: 'Lovelace',
                    role: 'editor',
                    explicit_department_uuid: 'dep',
                    group_links: null,
                },
                {
                    user_uuid: 'u2',
                    email: 'b@example.com',
                    first_name: 'Bo',
                    last_name: 'Smith',
                    role: 'viewer',
                    explicit_department_uuid: null,
                    group_links: [
                        {
                            departmentUuid: 'dep',
                            groupUuid: 'g1',
                            groupName: 'Finance',
                        },
                    ],
                },
            ],
        });

        const rows = await model.getResolvedMemberRows('org');

        expect(rows).toEqual([
            {
                userUuid: 'u1',
                email: 'a@example.com',
                firstName: 'Ada',
                lastName: 'Lovelace',
                role: 'editor',
                explicitDepartmentUuid: 'dep',
                groupLinks: [],
            },
            {
                userUuid: 'u2',
                email: 'b@example.com',
                firstName: 'Bo',
                lastName: 'Smith',
                role: 'viewer',
                explicitDepartmentUuid: null,
                groupLinks: [
                    {
                        departmentUuid: 'dep',
                        groupUuid: 'g1',
                        groupName: 'Finance',
                    },
                ],
            },
        ]);
    });
});
