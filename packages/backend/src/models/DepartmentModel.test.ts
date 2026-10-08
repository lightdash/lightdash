// packages/backend/src/models/DepartmentModel.test.ts
import {
    AlreadyExistsError,
    ConflictError,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { DatabaseError } from 'pg';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    DepartmentLinkTableName,
    DepartmentMemberTableName,
    DepartmentOwnerTableName,
    DepartmentPrimaryMembershipTableName,
    DepartmentTableName,
} from '../database/entities/departments';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { DepartmentModel, notAnActiveMemberMessage } from './DepartmentModel';

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
// The organization's tree, read inside the write's transaction for the parent and cycle checks
const SELECT_TREE = new RegExp(
    `^select "department_uuid", "parent_department_uuid" from "${DepartmentTableName}"`,
);
const LOCK = /pg_advisory_xact_lock/;
const LOCK_TIMEOUT = /lock_timeout/;
// The department check before a primary is stored
const SELECT_PRIMARY_DEPARTMENT = new RegExp(
    `^select "department_uuid" from "${DepartmentTableName}" where`,
);
// Who counts as a member, the same text in the membership read and the primary check
const MEMBERS =
    /FROM organization_memberships om\s+JOIN org ON org\.organization_id = om\.organization_id\s+JOIN users u ON u\.user_id = om\.user_id\s+JOIN emails e ON e\.user_id = u\.user_id AND e\.is_primary = true\s+WHERE u\.is_internal = false\s+AND u\.is_active = true\s+AND \(\s+e\.is_verified = true\s+OR EXISTS \(SELECT 1 FROM password_logins pl WHERE pl\.user_id = u\.user_id\)\s+OR EXISTS \(SELECT 1 FROM openid_identities oi WHERE oi\.user_id = u\.user_id\)\s+\)/;
const LIMITS = { maxDepartments: 1000, maxDepth: 10 };

describe('DepartmentModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new DepartmentModel({ database });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    beforeEach(() => {
        tracker.on.any(LOCK_TIMEOUT).response([]);
        tracker.on.any(LOCK).response([]);
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
        // dep ── child ── grandchild
        tracker.on.select(SELECT_TREE).response([
            { department_uuid: 'dep', parent_department_uuid: null },
            { department_uuid: 'child', parent_department_uuid: 'dep' },
            { department_uuid: 'grandchild', parent_department_uuid: 'child' },
        ]);
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        await expect(
            model.update(
                'org',
                'dep',
                { parentDepartmentUuid: 'grandchild' },
                'user',
                LIMITS,
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
            model.update(
                'org',
                'dep',
                { parentDepartmentUuid: 'p9' },
                'user',
                LIMITS,
            ),
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

    it('hydrates 1,000 departments with 5,000 rows of each kind in under 100 ms, keeping the order read', async () => {
        const DEPARTMENTS = 1000;
        const ROWS = 5000;
        const departmentUuid = (i: number) =>
            `dep-${String(i % DEPARTMENTS).padStart(4, '0')}`;
        tracker.on.select(SELECT_DEPARTMENTS).response(
            Array.from({ length: DEPARTMENTS }, (_, i) =>
                departmentRow({
                    department_uuid: departmentUuid(i),
                    name: `D${i}`,
                }),
            ),
        );
        // Row n belongs to department n mod 1,000, so each department's rows are spread through the result
        tracker.on.select(/from "department_links"/).response(
            Array.from({ length: ROWS }, (_, n) => ({
                department_uuid: departmentUuid(n),
                group_uuid: `g${n}`,
                name: `Group ${n}`,
            })),
        );
        tracker.on.select(/from "department_members"/).response(
            Array.from({ length: ROWS }, (_, n) => ({
                department_uuid: departmentUuid(n),
                user_uuid: `u${n}`,
            })),
        );
        tracker.on.select(/inner join "users"/).response(
            Array.from({ length: ROWS }, (_, n) => ({
                department_uuid: departmentUuid(n),
                principal_uuid: `ou${n}`,
                position: 2 * Math.floor(n / DEPARTMENTS) + 1,
                name: `Owner ${n}`,
            })),
        );
        tracker.on
            .select(/from "department_owners" inner join "groups"/)
            .response(
                Array.from({ length: ROWS }, (_, n) => ({
                    department_uuid: departmentUuid(n),
                    principal_uuid: `og${n}`,
                    position: 2 * Math.floor(n / DEPARTMENTS),
                    name: `Owner group ${n}`,
                })),
            );

        // The fastest of five runs after a warm-up, so a busy machine does not fail it
        let departments = await model.listByOrganization('org');
        let fastest = Number.POSITIVE_INFINITY;
        for (let run = 0; run < 5; run += 1) {
            const started = performance.now();
            // eslint-disable-next-line no-await-in-loop
            departments = await model.listByOrganization('org');
            fastest = Math.min(fastest, performance.now() - started);
        }

        expect(fastest).toBeLessThan(100);
        expect(departments).toHaveLength(DEPARTMENTS);
        departments.forEach((department, i) => {
            const own = [0, 1, 2, 3, 4].map((k) => i + k * DEPARTMENTS);
            expect(department.departmentUuid).toBe(departmentUuid(i));
            expect(department.linkedGroups).toEqual(
                own.map((n) => ({ groupUuid: `g${n}`, name: `Group ${n}` })),
            );
            expect(department.explicitMemberUuids).toEqual(
                own.map((n) => `u${n}`),
            );
            // Users at odd positions and groups at even ones, merged by position
            expect(department.owners).toEqual(
                own.flatMap((n) => [
                    { type: 'group', uuid: `og${n}`, name: `Owner group ${n}` },
                    { type: 'user', uuid: `ou${n}`, name: `Owner ${n}` },
                ]),
            );
        });
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
                LIMITS,
            ),
        ).rejects.toThrow(
            new ParameterError('Department p9 is not in this organization'),
        );
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('maps a duplicate name to AlreadyExistsError', async () => {
        tracker.on.select(SELECT_TREE).response([]);
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
                LIMITS,
            ),
        ).rejects.toThrow(
            new AlreadyExistsError(
                'A department named "Operations" already exists',
            ),
        );
    });

    describe('a name that differs only by case', () => {
        // What Postgres raises when the unique index on (organization_uuid, lower(name)) is violated
        const caseOnlyDuplicate = Object.assign(
            new Error('duplicate key value violates unique constraint'),
            {
                code: '23505',
                constraint:
                    'organization_departments_organization_uuid_lower_name_unique',
            },
        );

        it('is rejected on create with AlreadyExistsError', async () => {
            tracker.on.select(SELECT_TREE).response([]);
            tracker.on
                .insert(DepartmentTableName)
                .simulateError(caseOnlyDuplicate);
            await expect(
                model.create(
                    'org',
                    {
                        name: 'operations',
                        parentDepartmentUuid: null,
                        headcount: null,
                        headcountNote: null,
                        targetActiveUsers: null,
                        targetDate: null,
                    },
                    'user',
                    LIMITS,
                ),
            ).rejects.toThrow(
                new AlreadyExistsError(
                    'A department named "operations" already exists',
                ),
            );
        });

        it('is rejected on rename with AlreadyExistsError', async () => {
            tracker.on
                .select(SELECT_DEPARTMENTS)
                .response([departmentRow({ name: 'Finance' })]);
            tracker.on
                .update(DepartmentTableName)
                .simulateError(caseOnlyDuplicate);
            await expect(
                model.update(
                    'org',
                    'dep',
                    { name: 'OPERATIONS' },
                    'user',
                    LIMITS,
                ),
            ).rejects.toThrow(
                new AlreadyExistsError(
                    'A department named "OPERATIONS" already exists',
                ),
            );
        });
    });

    it("replaces only this department's group links, leaving each group linked to its other departments", async () => {
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

        expect(tracker.history.delete).toHaveLength(1);
        expect(tracker.history.delete[0].sql).toBe(
            `delete from "${DepartmentLinkTableName}" where "department_uuid" = $1 and "link_type" = $2`,
        );
        expect(tracker.history.delete[0].bindings).toEqual(['dep', 'group']);
        expect(tracker.history.insert).toHaveLength(1);
        expect(tracker.history.insert[0].bindings).toEqual([
            'dep',
            'group',
            'g1',
        ]);
    });

    it("replaces only this department's members, keeping the person in their other departments", async () => {
        tracker.on
            .select(/inner join "organizations"/)
            .responseOnce([{ user_uuid: 'u1' }]);
        tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
        tracker.on.select(/from "department_links"/).response([]);
        tracker.on.select(/from "department_members"/).response([]);
        tracker.on.select(/from "department_owners"/).response([]);
        tracker.on.delete(DepartmentMemberTableName).response(0);
        tracker.on.insert(DepartmentMemberTableName).response([]);
        tracker.on
            .any(/is_active = true/)
            .response({ rows: [{ user_uuid: 'u1' }] });

        await model.setMembers('org', 'dep', ['u1']);

        expect(tracker.history.delete).toHaveLength(1);
        expect(tracker.history.delete[0].sql).toBe(
            `delete from "${DepartmentMemberTableName}" where "department_uuid" = $1`,
        );
        expect(tracker.history.delete[0].bindings).toEqual(['dep']);
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
        tracker.on
            .any(/is_active = true/)
            .response({ rows: [{ user_uuid: 'u1' }] });

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

    it('counts only active users who have completed sign-up', async () => {
        tracker.on.any(/with org as/i).response({ rows: [] });
        await model.getResolvedMemberRows('org');
        const [query] = tracker.history.all;
        expect(query.bindings).toEqual(['org']);
        expect(query.sql).toMatch(
            /WHERE u\.is_internal = false\s+AND u\.is_active = true\s+AND \(/,
        );
        // Signed up means a verified primary email, a password or a single sign-on identity
        expect(query.sql).toMatch(
            /e\.is_verified = true\s+OR EXISTS \(SELECT 1 FROM password_logins pl WHERE pl\.user_id = u\.user_id\)\s+OR EXISTS \(SELECT 1 FROM openid_identities oi WHERE oi\.user_id = u\.user_id\)/,
        );
    });

    describe('who can be newly assigned or made an owner', () => {
        const ON_LIGHTDASH = /is_active = true/;
        const respondToMemberWrite = (listed: string[]) => {
            tracker.on
                .select(OrganizationMembershipsTableName)
                .response([
                    { user_uuid: 'pending' },
                    { user_uuid: 'u1' },
                    { user_uuid: 'quiet' },
                ]);
            tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
            tracker.on
                .select(/^select "user_uuid" from "department_members"/)
                .response(listed.map((user_uuid) => ({ user_uuid })));
            tracker.on
                .select(/^select "principal_uuid" from "department_owners"/)
                .response(listed.map((principal_uuid) => ({ principal_uuid })));
            tracker.on.select(/from "department_/).response([]);
            tracker.on.delete(/.*/).response(0);
            tracker.on.insert(/.*/).response([]);
        };

        it('refuses a person who is deactivated or has not finished signing up', async () => {
            respondToMemberWrite([]);
            tracker.on.any(ON_LIGHTDASH).response({ rows: [] });
            await expect(
                model.setMembers('org', 'dep', ['pending']),
            ).rejects.toThrow(
                new ParameterError(
                    'User pending must be an active member of this organization',
                ),
            );
            expect(tracker.history.insert).toHaveLength(0);
            const check = tracker.history.all.find((q) =>
                ON_LIGHTDASH.test(q.sql),
            );
            // The same definition of on Lightdash as the membership read
            expect(check?.sql).toMatch(
                /u\.is_active = true\s+AND \(\s+e\.is_verified = true\s+OR EXISTS \(SELECT 1 FROM password_logins pl WHERE pl\.user_id = u\.user_id\)\s+OR EXISTS \(SELECT 1 FROM openid_identities oi WHERE oi\.user_id = u\.user_id\)/,
            );
            expect(check?.sql).toContain('e.is_primary = true');
            expect(check?.bindings).toEqual([['pending']]);
        });
        it('refuses a new user owner who is not on Lightdash', async () => {
            respondToMemberWrite([]);
            tracker.on.any(ON_LIGHTDASH).response({ rows: [] });
            await expect(
                model.setOwners('org', 'dep', [
                    { type: 'user', uuid: 'pending' },
                ]),
            ).rejects.toThrow(
                new ParameterError(
                    'User pending must be an active member of this organization',
                ),
            );
            expect(tracker.history.insert).toHaveLength(0);
        });
        it('keeps people already in the list, checking only the newcomers', async () => {
            respondToMemberWrite(['quiet']);
            tracker.on
                .any(ON_LIGHTDASH)
                .response({ rows: [{ user_uuid: 'u1' }] });
            await model.setMembers('org', 'dep', ['quiet', 'u1']);
            await model.setOwners('org', 'dep', [
                { type: 'user', uuid: 'quiet' },
                { type: 'user', uuid: 'u1' },
            ]);
            const checks = tracker.history.all.filter((q) =>
                ON_LIGHTDASH.test(q.sql),
            );
            expect(checks.map((q) => q.bindings)).toEqual([[['u1']], [['u1']]]);
            expect(tracker.history.insert).toHaveLength(2);
        });
        it('does not check anyone when nobody new is added', async () => {
            respondToMemberWrite(['quiet']);
            await model.setMembers('org', 'dep', ['quiet']);
            expect(
                tracker.history.all.some((q) => ON_LIGHTDASH.test(q.sql)),
            ).toBe(false);
        });
    });

    describe('organization scoping', () => {
        // The department lookup every read and write starts from
        const LOOKUP = /to_char\(target_date/;

        it.each([
            ['get', () => model.getByUuid('org', 'dep')],
            [
                'update',
                () => model.update('org', 'dep', { name: 'x' }, 'user', LIMITS),
            ],
            ['delete', () => model.delete('org', 'dep')],
            ['set groups', () => model.setGroupLinks('org', 'dep', ['g1'])],
            ['set members', () => model.setMembers('org', 'dep', ['u1'])],
            [
                'set owners',
                () =>
                    model.setOwners('org', 'dep', [
                        { type: 'group', uuid: 'g1' },
                        { type: 'user', uuid: 'u1' },
                    ]),
            ],
        ])(
            '%s looks the department up within the organization, and a department it does not find is NotFoundError',
            async (_name, call) => {
                // Another organization's department is simply not returned
                tracker.on.select(LOOKUP).response([]);
                tracker.on
                    .select(/^select "groups"."group_uuid"/)
                    .response([{ group_uuid: 'g1' }]);
                tracker.on
                    .select(OrganizationMembershipsTableName)
                    .response([{ user_uuid: 'u1' }]);

                await expect(call()).rejects.toThrow(
                    new NotFoundError('Department dep not found'),
                );

                const lookup = tracker.history.select.find((q) =>
                    LOOKUP.test(q.sql),
                );
                expect(lookup?.sql).toMatch(
                    /from "organization_departments" where "organization_uuid" = \$1 and "department_uuid" = \$2/,
                );
                expect(lookup?.bindings).toEqual(['org', 'dep']);
                expect(tracker.history.insert).toHaveLength(0);
                expect(tracker.history.update).toHaveLength(0);
                expect(tracker.history.delete).toHaveLength(0);
            },
        );

        it("lists only the organization's departments", async () => {
            tracker.on.select(SELECT_DEPARTMENTS).response([]);
            await model.listByOrganization('org');
            const [list] = tracker.history.select;
            expect(list.sql).toMatch(/where "organization_uuid" = \$1/);
            expect(list.bindings).toEqual(['org']);
        });

        it('checks groups and people against the organization', async () => {
            tracker.on
                .select(/^select "groups"."group_uuid"/)
                .response([{ group_uuid: 'g1' }]);
            tracker.on
                .select(OrganizationMembershipsTableName)
                .response([{ user_uuid: 'u1' }]);
            tracker.on.select(LOOKUP).response([]);
            await model
                .setOwners('org', 'dep', [
                    { type: 'group', uuid: 'g1' },
                    { type: 'user', uuid: 'u1' },
                ])
                .catch(() => undefined);
            const groupCheck = tracker.history.select.find((q) =>
                q.sql.startsWith('select "groups"."group_uuid"'),
            );
            const userCheck = tracker.history.select.find((q) =>
                q.sql.includes(`from "${OrganizationMembershipsTableName}"`),
            );
            expect(groupCheck?.sql).toContain(
                '"organizations"."organization_uuid" = $1',
            );
            expect(groupCheck?.bindings[0]).toBe('org');
            expect(userCheck?.sql).toContain(
                '"organizations"."organization_uuid" = $1',
            );
            expect(userCheck?.bindings[0]).toBe('org');
        });

        it("reads each person's explicit departments and primary through the organization", async () => {
            tracker.on.any(/with org as/i).response({ rows: [] });
            await model.getResolvedMemberRows('org');
            const [query] = tracker.history.all;
            // The organization is bound once and every part of the read joins it
            expect(query.bindings).toEqual(['org']);
            expect(query.sql).toMatch(
                /FROM department_members dm\s+JOIN organization_departments d ON d\.department_uuid = dm\.department_uuid\s+JOIN org ON org\.organization_uuid = d\.organization_uuid/,
            );
            expect(query.sql).toMatch(
                /FROM department_primary_memberships pm\s+JOIN org ON org\.organization_uuid = pm\.organization_uuid/,
            );
        });

        it('checks the person and the department against the organization when setting a primary', async () => {
            tracker.on
                .any(/is_active = true/)
                .response({ rows: [{ user_uuid: 'u1' }] });
            tracker.on.select(SELECT_PRIMARY_DEPARTMENT).response([]);
            await expect(
                model.setPrimaryDepartment('org', 'u1', 'theirs'),
            ).rejects.toThrow(
                new ParameterError(
                    'Department theirs is not in this organization',
                ),
            );
            const memberCheck = tracker.history.all.find((q) =>
                /is_active = true/.test(q.sql),
            );
            expect(memberCheck?.sql).toMatch(
                /WITH org AS \(\s+SELECT organization_id FROM organizations WHERE organization_uuid = \$1\s+\)/,
            );
            expect(memberCheck?.sql).toMatch(/AND u\.user_uuid = \$2\s*$/);
            expect(memberCheck?.bindings).toEqual(['org', 'u1']);
            const departmentCheck = tracker.history.select.find((q) =>
                SELECT_PRIMARY_DEPARTMENT.test(q.sql),
            );
            expect(departmentCheck?.sql).toMatch(
                /where "organization_uuid" = \$1 and "department_uuid" = \$2/,
            );
            expect(departmentCheck?.bindings).toEqual(['org', 'theirs', 1]);
            expect(tracker.history.insert).toHaveLength(0);
        });

        it("clears only the organization's primary for the person", async () => {
            tracker.on
                .any(/is_active = true/)
                .response({ rows: [{ user_uuid: 'u1' }] });
            tracker.on.delete(DepartmentPrimaryMembershipTableName).response(1);
            await model.setPrimaryDepartment('org', 'u1', null);
            const [cleared] = tracker.history.delete;
            expect(cleared.sql).toBe(
                `delete from "${DepartmentPrimaryMembershipTableName}" where "organization_uuid" = $1 and "user_uuid" = $2`,
            );
            expect(cleared.bindings).toEqual(['org', 'u1']);
        });
    });

    describe('the department a person counts in', () => {
        const ON_LIGHTDASH = /is_active = true/;

        it('stores it for the person in the organization, replacing any earlier one, after checking both inside the lock', async () => {
            tracker.on
                .any(ON_LIGHTDASH)
                .response({ rows: [{ user_uuid: 'u1' }] });
            tracker.on
                .select(SELECT_PRIMARY_DEPARTMENT)
                .response([{ department_uuid: 'dep' }]);
            tracker.on
                .insert(DepartmentPrimaryMembershipTableName)
                .response([]);

            await model.setPrimaryDepartment('org', 'u1', 'dep');

            const [upsert] = tracker.history.insert;
            expect(upsert.sql).toBe(
                `insert into "${DepartmentPrimaryMembershipTableName}" ("department_uuid", "organization_uuid", "user_uuid") values ($1, $2, $3) on conflict ("organization_uuid", "user_uuid") do update set "department_uuid" = excluded."department_uuid"`,
            );
            expect(upsert.bindings).toEqual(['dep', 'org', 'u1']);
            const [transaction] = tracker.history.transactions;
            expect(transaction.state).toBe('committed');
            expect(
                transaction.queries.map((q) => {
                    if (LOCK_TIMEOUT.test(q.sql)) return 'timeout';
                    if (LOCK.test(q.sql)) return 'lock';
                    if (ON_LIGHTDASH.test(q.sql)) return 'person';
                    if (SELECT_PRIMARY_DEPARTMENT.test(q.sql))
                        return 'department';
                    return q.method;
                }),
            ).toEqual(['timeout', 'lock', 'person', 'department', 'insert']);
        });

        it('clears it with null, without looking a department up', async () => {
            tracker.on
                .any(ON_LIGHTDASH)
                .response({ rows: [{ user_uuid: 'u1' }] });
            tracker.on.delete(DepartmentPrimaryMembershipTableName).response(1);

            await model.setPrimaryDepartment('org', 'u1', null);

            expect(tracker.history.delete).toHaveLength(1);
            expect(tracker.history.select).toHaveLength(0);
            expect(tracker.history.insert).toHaveLength(0);
        });

        it('refuses a person who is not an active member of the organization, before reading or writing anything else', async () => {
            tracker.on.any(ON_LIGHTDASH).response({ rows: [] });

            await expect(
                model.setPrimaryDepartment('org', 'gone', 'dep'),
            ).rejects.toThrow(
                new NotFoundError(
                    'User gone is not an active member of this organization',
                ),
            );
            // The text the service also answers with when it finds no such member
            expect(notAnActiveMemberMessage('gone')).toBe(
                'User gone is not an active member of this organization',
            );

            const check = tracker.history.all.find((q) =>
                ON_LIGHTDASH.test(q.sql),
            );
            // The same people the membership read counts: in the organization, not internal, active and signed up
            expect(check?.sql).toMatch(MEMBERS);
            expect(check?.bindings).toEqual(['org', 'gone']);
            expect(tracker.history.select).toHaveLength(0);
            expect(tracker.history.insert).toHaveLength(0);
            expect(tracker.history.delete).toHaveLength(0);
            const [transaction] = tracker.history.transactions;
            expect(transaction.state).toBe('rolled back');
        });

        it('defines a member with the same text as the membership read', async () => {
            tracker.on.any(/with org as/i).response({ rows: [] });
            await model.getResolvedMemberRows('org');
            await model
                .setPrimaryDepartment('org', 'u1', null)
                .catch(() => undefined);
            const [read, check] = tracker.history.all
                .filter((q) => !LOCK_TIMEOUT.test(q.sql) && !LOCK.test(q.sql))
                .map((q) => q.sql.match(MEMBERS)?.[0]);
            expect(read).toEqual(expect.any(String));
            expect(check).toBe(read);
        });

        it('refuses a department that is not in the organization and writes nothing', async () => {
            tracker.on
                .any(ON_LIGHTDASH)
                .response({ rows: [{ user_uuid: 'u1' }] });
            tracker.on.select(SELECT_PRIMARY_DEPARTMENT).response([]);

            await expect(
                model.setPrimaryDepartment('org', 'u1', 'dep9'),
            ).rejects.toThrow(
                new ParameterError(
                    'Department dep9 is not in this organization',
                ),
            );

            expect(tracker.history.insert).toHaveLength(0);
            const [transaction] = tracker.history.transactions;
            expect(transaction.state).toBe('rolled back');
        });
    });

    describe('department and depth limits', () => {
        // d1 at the top, each next one under the previous: d<n> sits at depth n
        const chain = (length: number) =>
            Array.from({ length }, (_, i) => ({
                department_uuid: `d${i + 1}`,
                parent_department_uuid: i === 0 ? null : `d${i}`,
            }));
        const create = (parentDepartmentUuid: string | null) =>
            model.create(
                'org',
                {
                    name: 'New',
                    parentDepartmentUuid,
                    headcount: null,
                    headcountNote: null,
                    targetActiveUsers: null,
                    targetDate: null,
                },
                'user',
                LIMITS,
            );
        const respondToReadBack = () => {
            tracker.on
                .insert(DepartmentTableName)
                .response([{ department_uuid: 'new' }]);
            tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
            tracker.on.select(/from "department_/).response([]);
        };

        it('refuses a department past the organization limit, inside the lock', async () => {
            tracker.on.select(SELECT_TREE).response(
                Array.from({ length: 1000 }, (_, i) => ({
                    department_uuid: `x${i}`,
                    parent_department_uuid: null,
                })),
            );
            await expect(create(null)).rejects.toThrow(
                new ParameterError(
                    'An organization can have at most 1,000 departments',
                ),
            );
            expect(tracker.history.insert).toHaveLength(0);
            const [transaction] = tracker.history.transactions;
            expect(transaction.state).toBe('rolled back');
            expect(
                transaction.queries.some((q) => SELECT_TREE.test(q.sql)),
            ).toBe(true);
        });
        it('allows the 1,000th department', async () => {
            tracker.on.select(SELECT_TREE).response(
                Array.from({ length: 999 }, (_, i) => ({
                    department_uuid: `x${i}`,
                    parent_department_uuid: null,
                })),
            );
            respondToReadBack();
            await create(null);
            expect(tracker.history.insert).toHaveLength(1);
        });
        it('allows a department at depth 10 and refuses one at depth 11', async () => {
            tracker.on.select(SELECT_TREE).response(chain(10));
            respondToReadBack();
            await create('d9');
            await expect(create('d10')).rejects.toThrow(
                new ParameterError(
                    'Departments can be nested at most 10 levels deep',
                ),
            );
            expect(tracker.history.insert).toHaveLength(1);
        });
        it('counts the whole branch when a department moves', async () => {
            // b1 ── b2 ── b3 is a branch three levels high; d7 sits at depth 7, d8 at depth 8
            tracker.on
                .select(SELECT_TREE)
                .response([
                    ...chain(8),
                    { department_uuid: 'b1', parent_department_uuid: null },
                    { department_uuid: 'b2', parent_department_uuid: 'b1' },
                    { department_uuid: 'b3', parent_department_uuid: 'b2' },
                ]);
            tracker.on
                .select(SELECT_DEPARTMENTS)
                .response([departmentRow({ department_uuid: 'b1' })]);
            tracker.on.select(/from "department_/).response([]);
            tracker.on.update(DepartmentTableName).response(1);
            await expect(
                model.update(
                    'org',
                    'b1',
                    { parentDepartmentUuid: 'd8' },
                    'user',
                    LIMITS,
                ),
            ).rejects.toThrow(
                new ParameterError(
                    'Departments can be nested at most 10 levels deep',
                ),
            );
            expect(tracker.history.update).toHaveLength(0);
            await model.update(
                'org',
                'b1',
                { parentDepartmentUuid: 'd7' },
                'user',
                LIMITS,
            );
            expect(tracker.history.update).toHaveLength(1);
        });
    });

    describe('the per-organization lock', () => {
        const PARENT = 'parent';
        const respondToEveryRead = () => {
            tracker.on.select(SELECT_TREE).response([
                { department_uuid: 'dep', parent_department_uuid: null },
                { department_uuid: PARENT, parent_department_uuid: null },
            ]);
            tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
            tracker.on
                .select(/^select "groups"."group_uuid"/)
                .response([{ group_uuid: 'g1' }]);
            tracker.on
                .select(OrganizationMembershipsTableName)
                .response([{ user_uuid: 'u1' }]);
            tracker.on.select(/from "department_/).response([]);
            tracker.on.insert(/.*/).response([{ department_uuid: 'dep' }]);
            tracker.on.update(/.*/).response(1);
            tracker.on.delete(/.*/).response(1);
            tracker.on
                .any(/is_active = true/)
                .response({ rows: [{ user_uuid: 'u1' }] });
        };
        const newDepartment = {
            name: 'Ops',
            parentDepartmentUuid: PARENT,
            headcount: null,
            headcountNote: null,
            targetActiveUsers: null,
            targetDate: null,
        };

        const writes: Array<[string, () => Promise<unknown>]> = [
            [
                'create',
                () => model.create('org', newDepartment, 'user', LIMITS),
            ],
            [
                'update',
                () =>
                    model.update(
                        'org',
                        'dep',
                        { parentDepartmentUuid: PARENT },
                        'user',
                        LIMITS,
                    ),
            ],
            ['delete', () => model.delete('org', 'dep')],
            ['setGroupLinks', () => model.setGroupLinks('org', 'dep', ['g1'])],
            ['setMembers', () => model.setMembers('org', 'dep', ['u1'])],
            [
                'setOwners',
                () =>
                    model.setOwners('org', 'dep', [
                        { type: 'user', uuid: 'u1' },
                        { type: 'group', uuid: 'g1' },
                    ]),
            ],
            [
                'setPrimaryDepartment',
                () => model.setPrimaryDepartment('org', 'u1', 'dep'),
            ],
            [
                'setPrimaryDepartment to null',
                () => model.setPrimaryDepartment('org', 'u1', null),
            ],
        ];
        const databaseError = (code: string, message: string) =>
            Object.assign(new DatabaseError(message, 0, 'error'), { code });

        it.each(writes)(
            '%s sets a lock timeout, takes the organization lock, then checks and writes in the same transaction',
            async (_name, write) => {
                respondToEveryRead();
                await write();

                expect(tracker.history.transactions).toHaveLength(1);
                const [transaction] = tracker.history.transactions;
                expect(transaction.state).toBe('committed');
                const [timeout, lock, ...rest] = transaction.queries;
                // SET LOCAL, so the timeout ends with this transaction and never stays on the pooled connection
                expect(timeout.sql).toBe("SET LOCAL lock_timeout = '5s'");
                expect(lock.sql).toBe(
                    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
                );
                expect(lock.bindings).toEqual(['organization-departments:org']);
                // Nothing is written outside the locked transaction
                [
                    ...tracker.history.insert,
                    ...tracker.history.update,
                    ...tracker.history.delete,
                ].forEach((query) => expect(rest).toContain(query));
                expect(rest.length).toBeGreaterThan(0);
            },
        );

        it('reads the tree for the parent and cycle checks inside the lock', async () => {
            respondToEveryRead();
            await model.update(
                'org',
                'dep',
                { parentDepartmentUuid: PARENT },
                'user',
                LIMITS,
            );
            const [transaction] = tracker.history.transactions;
            const treeIndex = transaction.queries.findIndex((q) =>
                SELECT_TREE.test(q.sql),
            );
            expect(treeIndex).toBeGreaterThan(0);
            expect(transaction.queries[treeIndex].bindings).toEqual(['org']);
        });

        it('rolls back without writing when a check inside the lock fails', async () => {
            tracker.on.select(SELECT_TREE).response([
                { department_uuid: 'dep', parent_department_uuid: null },
                { department_uuid: 'child', parent_department_uuid: 'dep' },
            ]);
            tracker.on.select(SELECT_DEPARTMENTS).response([departmentRow()]);
            await expect(
                model.update(
                    'org',
                    'dep',
                    { parentDepartmentUuid: 'child' },
                    'user',
                    LIMITS,
                ),
            ).rejects.toThrow(ParameterError);
            const [transaction] = tracker.history.transactions;
            expect(transaction.state).toBe('rolled back');
            expect(LOCK_TIMEOUT.test(transaction.queries[0].sql)).toBe(true);
            expect(LOCK.test(transaction.queries[1].sql)).toBe(true);
            expect(tracker.history.update).toHaveLength(0);
        });

        it.each(writes)(
            '%s answers ConflictError and writes nothing when the wait for the lock times out (55P03)',
            async (_name, write) => {
                tracker.resetHandlers();
                tracker.on.any(LOCK_TIMEOUT).response([]);
                tracker.on
                    .any(LOCK)
                    .simulateError(
                        databaseError(
                            '55P03',
                            'canceling statement due to lock timeout',
                        ),
                    );

                const error = await write().catch((e: unknown) => e);

                expect(error).toBeInstanceOf(ConflictError);
                expect(error).toMatchObject({
                    statusCode: 409,
                    message:
                        'Another change to departments is being saved. Try again in a moment',
                });
                const [transaction] = tracker.history.transactions;
                expect(transaction.state).toBe('rolled back');
                expect([
                    ...tracker.history.insert,
                    ...tracker.history.update,
                    ...tracker.history.delete,
                ]).toHaveLength(0);
            },
        );

        it('passes any other database error through unchanged', async () => {
            const deadlock = databaseError('40P01', 'deadlock detected');
            tracker.resetHandlers();
            tracker.on.any(LOCK_TIMEOUT).response([]);
            tracker.on.any(LOCK).simulateError(deadlock);
            await expect(model.delete('org', 'dep')).rejects.toBe(deadlock);
        });
    });

    it('reads every explicit department of a person, not one of them', async () => {
        tracker.on.any(/with org as/i).response({ rows: [] });
        await model.getResolvedMemberRows('org');
        const [query] = tracker.history.all;
        expect(query.sql).toContain(
            'array_agg(dm.department_uuid ORDER BY dm.department_uuid)',
        );
        expect(query.sql).not.toMatch(/\bMIN\(/i);
    });

    it('maps resolved member rows and defaults missing explicit departments and group links to empty', async () => {
        tracker.on.any(/with org as/i).response({
            rows: [
                {
                    user_uuid: 'u1',
                    email: 'a@example.com',
                    first_name: 'Ada',
                    last_name: 'Lovelace',
                    role: 'editor',
                    explicit_department_uuids: ['dep', 'dep2'],
                    group_links: null,
                    primary_department_uuid: 'dep2',
                },
                {
                    user_uuid: 'u2',
                    email: 'b@example.com',
                    first_name: 'Bo',
                    last_name: 'Smith',
                    role: 'viewer',
                    explicit_department_uuids: null,
                    group_links: [
                        {
                            departmentUuid: 'dep',
                            groupUuid: 'g1',
                            groupName: 'Finance',
                        },
                    ],
                    primary_department_uuid: null,
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
                explicitDepartmentUuids: ['dep', 'dep2'],
                groupLinks: [],
                primaryDepartmentUuid: 'dep2',
            },
            {
                userUuid: 'u2',
                email: 'b@example.com',
                firstName: 'Bo',
                lastName: 'Smith',
                role: 'viewer',
                explicitDepartmentUuids: [],
                groupLinks: [
                    {
                        departmentUuid: 'dep',
                        groupUuid: 'g1',
                        groupName: 'Finance',
                    },
                ],
                primaryDepartmentUuid: null,
            },
        ]);
    });
});
