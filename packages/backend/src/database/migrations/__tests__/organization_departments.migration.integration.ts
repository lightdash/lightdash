import {
    AlreadyExistsError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    QueryExecutionContext,
    resolveDepartmentMembership,
    type CreateDepartment,
    type UpdateDepartment,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    DepartmentAnalyticsModel,
    type ActivityWindows,
} from '../../../models/DepartmentAnalyticsModel';
import {
    DepartmentModel,
    type DepartmentTreeLimits,
} from '../../../models/DepartmentModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261008120000_create_organization_departments';

const TABLES = [
    'organization_departments',
    'department_links',
    'department_members',
    'department_owners',
];
const LIMITS: DepartmentTreeLimits = { maxDepartments: 1000, maxDepth: 10 };
const DAY = 24 * 60 * 60 * 1000;

let migrated: MigratedDatabase;
let db: Knex;
let departments: DepartmentModel;
let analytics: DepartmentAnalyticsModel;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
    db = migrated.database;
    departments = new DepartmentModel({ database: db });
    analytics = new DepartmentAnalyticsModel({ database: db });
});
afterAll(async () => {
    await migrated?.destroy();
});

type Organization = {
    organizationId: number;
    organizationUuid: string;
    // Records who made each change; not a member, so never counted
    authorUuid: string;
    projectUuid: string;
    dashboardUuid: string;
    chartUuid: string;
};

type Person = { userId: number; userUuid: string };

// Seeds are plain SQL: the typed table map expects whole rows, and each seed sets only what a test needs
const insertReturning = async <T>(
    sql: string,
    bindings: readonly Knex.RawBinding[],
): Promise<T> => {
    const result = await db.raw<{ rows: T[] }>(sql, bindings);
    return result.rows[0];
};

// An organization with one project, space, dashboard and saved chart, on the real schema
const createOrganization = async (name: string): Promise<Organization> => {
    const author = await insertReturning<{ user_uuid: string }>(
        `INSERT INTO users (first_name, last_name) VALUES (?, 'Test') RETURNING user_uuid`,
        [`${name} author`],
    );
    const organization = await insertReturning<{
        organization_id: number;
        organization_uuid: string;
    }>(
        'INSERT INTO organizations (organization_name) VALUES (?) RETURNING organization_id, organization_uuid',
        [name],
    );
    const project = await insertReturning<{
        project_id: number;
        project_uuid: string;
    }>(
        'INSERT INTO projects (name, organization_id) VALUES (?, ?) RETURNING project_id, project_uuid',
        [`${name} project`, organization.organization_id],
    );
    const space = await insertReturning<{ space_id: number }>(
        'INSERT INTO spaces (name, project_id, slug) VALUES (?, ?, ?) RETURNING space_id',
        [`${name} space`, project.project_id, `space-${randomUUID()}`],
    );
    const dashboard = await insertReturning<{ dashboard_uuid: string }>(
        'INSERT INTO dashboards (space_id, name, slug, project_uuid) VALUES (?, ?, ?, ?) RETURNING dashboard_uuid',
        [
            space.space_id,
            `${name} dashboard`,
            `dashboard-${randomUUID()}`,
            project.project_uuid,
        ],
    );
    const chart = await insertReturning<{ saved_query_uuid: string }>(
        'INSERT INTO saved_queries (name, space_id, slug, project_uuid) VALUES (?, ?, ?, ?) RETURNING saved_query_uuid',
        [
            `${name} chart`,
            space.space_id,
            `chart-${randomUUID()}`,
            project.project_uuid,
        ],
    );
    return {
        organizationId: organization.organization_id,
        organizationUuid: organization.organization_uuid,
        authorUuid: author.user_uuid,
        projectUuid: project.project_uuid,
        dashboardUuid: dashboard.dashboard_uuid,
        chartUuid: chart.saved_query_uuid,
    };
};

const createPerson = async (
    organization: Organization,
    firstName: string,
    {
        isActive = true,
        signedUp = true,
        isInternal = false,
    }: { isActive?: boolean; signedUp?: boolean; isInternal?: boolean } = {},
): Promise<Person> => {
    const user = await insertReturning<{ user_id: number; user_uuid: string }>(
        `INSERT INTO users (first_name, last_name, is_active, is_internal)
         VALUES (?, 'Test', ?, ?) RETURNING user_id, user_uuid`,
        [firstName, isActive, isInternal],
    );
    // Signed up means a verified primary email here; no password or identity is added
    await db.raw(
        'INSERT INTO emails (user_id, email, is_primary, is_verified) VALUES (?, ?, true, ?)',
        [user.user_id, `${randomUUID()}@example.com`, signedUp],
    );
    await db.raw(
        'INSERT INTO organization_memberships (organization_id, user_id, role) VALUES (?, ?, ?)',
        [
            organization.organizationId,
            user.user_id,
            OrganizationMemberRole.VIEWER,
        ],
    );
    return { userId: user.user_id, userUuid: user.user_uuid };
};

const createGroup = async (
    organization: Organization,
    name: string,
    people: Person[],
): Promise<string> => {
    const group = await insertReturning<{ group_uuid: string }>(
        'INSERT INTO groups (name, organization_id) VALUES (?, ?) RETURNING group_uuid',
        [name, organization.organizationId],
    );
    await db.raw(
        `INSERT INTO group_memberships (group_uuid, user_id, organization_id)
         SELECT ?, user_id, ? FROM unnest(?::int[]) AS user_id`,
        [
            group.group_uuid,
            organization.organizationId,
            people.map((person) => person.userId),
        ],
    );
    return group.group_uuid;
};

const addDashboardView = (dashboardUuid: string, person: Person, at: Date) =>
    db.raw(
        'INSERT INTO analytics_dashboard_views (dashboard_uuid, user_uuid, timestamp) VALUES (?, ?, ?)',
        [dashboardUuid, person.userUuid, at],
    );

const addChartView = (chartUuid: string, person: Person, at: Date) =>
    db.raw(
        'INSERT INTO analytics_chart_views (chart_uuid, user_uuid, timestamp) VALUES (?, ?, ?)',
        [chartUuid, person.userUuid, at],
    );

const addQuery = (
    organization: Organization,
    person: Person,
    context: QueryExecutionContext,
    at: Date,
) =>
    db.raw(
        `INSERT INTO query_history (organization_uuid, project_uuid, created_by_user_uuid, context,
             compiled_sql, metric_query, fields, request_parameters, cache_key, created_at)
         VALUES (?, ?, ?, ?, 'select 1', ?::jsonb, '{}', '{}', ?, ?)`,
        [
            organization.organizationUuid,
            organization.projectUuid,
            person.userUuid,
            context,
            JSON.stringify({ exploreName: 'orders' }),
            randomUUID(),
            at,
        ],
    );

const department = (
    name: string,
    parentDepartmentUuid: string | null = null,
): CreateDepartment => ({
    name,
    parentDepartmentUuid,
    headcount: null,
    headcountNote: null,
    targetActiveUsers: null,
    targetDate: null,
});

const create = async (
    organization: Organization,
    name: string,
    parentDepartmentUuid: string | null = null,
): Promise<string> =>
    (
        await departments.create(
            organization.organizationUuid,
            department(name, parentDepartmentUuid),
            organization.authorUuid,
            LIMITS,
        )
    ).departmentUuid;

const edit = (
    organization: Organization,
    departmentUuid: string,
    data: UpdateDepartment,
) =>
    departments.update(
        organization.organizationUuid,
        departmentUuid,
        data,
        organization.authorUuid,
        LIMITS,
    );

const parentOf = async (departmentUuid: string) =>
    (
        await db('organization_departments')
            .where('department_uuid', departmentUuid)
            .first('parent_department_uuid')
    )?.parent_department_uuid ?? null;

const windowsAt = (now: Date): ActivityWindows => ({
    activeSince: new Date(now.getTime() - 30 * DAY),
    lastActiveSince: new Date(now.getTime() - 90 * DAY),
});

describe('the departments migration', () => {
    test('reverses and reapplies on the real schema', async () => {
        await db.transaction(async (trx) => {
            await down(trx);
            const afterDown = await Promise.all(
                TABLES.map((table) => trx.schema.hasTable(table)),
            );
            expect(afterDown).toEqual([false, false, false, false]);
            await up(trx);
            const afterUp = await Promise.all(
                TABLES.map((table) => trx.schema.hasTable(table)),
            );
            expect(afterUp).toEqual([true, true, true, true]);
        });
        const index = await db.raw<{ rows: { indexdef: string }[] }>(
            `SELECT indexdef FROM pg_indexes
             WHERE indexname = 'organization_departments_organization_uuid_lower_name_unique'`,
        );
        expect(index.rows[0].indexdef).toContain(
            '(organization_uuid, lower(name))',
        );
    });

    test('covers every foreign key with a leading index and gives every table a primary key', async () => {
        const unindexed = await db.raw<{ rows: { name: string }[] }>(
            `SELECT con.conname AS name FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             WHERE con.contype = 'f' AND rel.relname = ANY(?)
               AND NOT EXISTS (SELECT 1 FROM pg_index idx
                   WHERE idx.indrelid = con.conrelid AND idx.indisvalid
                     AND idx.indkey[0] = con.conkey[1])`,
            [TABLES],
        );
        expect(unindexed.rows).toEqual([]);
        const primaryKeys = await db.raw<{ rows: { count: string }[] }>(
            `SELECT count(*) FROM pg_constraint con
             JOIN pg_class rel ON rel.oid = con.conrelid
             WHERE con.contype = 'p' AND rel.relname = ANY(?)`,
            [TABLES],
        );
        expect(primaryKeys.rows[0].count).toBe('4');
    });

    test('refuses a negative headcount and cascades an organization delete', async () => {
        const organization = await createOrganization('Constraints');
        await expect(
            db.raw(
                `INSERT INTO organization_departments (organization_uuid, name, headcount) VALUES (?, 'Negative', -1)`,
                [organization.organizationUuid],
            ),
        ).rejects.toMatchObject({ code: '23514' });
        const parent = await create(organization, 'Parent');
        await create(organization, 'Child', parent);
        await db('organizations')
            .where('organization_uuid', organization.organizationUuid)
            .delete();
        expect(
            await db('organization_departments').where(
                'organization_uuid',
                organization.organizationUuid,
            ),
        ).toHaveLength(0);
    });
});

describe('DepartmentModel on the real schema', () => {
    test('resolves membership: explicit first, then the most specific linked group, else a conflict', async () => {
        const organization = await createOrganization('Membership');
        const ann = await createPerson(organization, 'Ann');
        const bob = await createPerson(organization, 'Bob');
        const cara = await createPerson(organization, 'Cara');
        const dan = await createPerson(organization, 'Dan');
        const gone = await createPerson(organization, 'Gone', {
            isActive: false,
        });
        const invited = await createPerson(organization, 'Invited', {
            signedUp: false,
        });
        const robot = await createPerson(organization, 'Robot', {
            isInternal: true,
        });
        const opsGroup = await createGroup(organization, 'Ops staff', [
            ann,
            cara,
            gone,
            invited,
        ]);
        const storesGroup = await createGroup(organization, 'Store staff', [
            ann,
            bob,
        ]);
        const financeGroup = await createGroup(organization, 'Finance staff', [
            bob,
        ]);
        const ops = await create(organization, 'Ops');
        const stores = await create(organization, 'Stores', ops);
        const finance = await create(organization, 'Finance');
        await departments.setGroupLinks(organization.organizationUuid, ops, [
            opsGroup,
        ]);
        await departments.setGroupLinks(organization.organizationUuid, stores, [
            storesGroup,
        ]);
        await departments.setGroupLinks(
            organization.organizationUuid,
            finance,
            [financeGroup],
        );
        await departments.setMembers(organization.organizationUuid, finance, [
            cara.userUuid,
        ]);

        const rows = await departments.getResolvedMemberRows(
            organization.organizationUuid,
        );
        const resolved = new Map(
            resolveDepartmentMembership(
                rows,
                await departments.listByOrganization(
                    organization.organizationUuid,
                ),
            ).map((m) => [m.userUuid, m.resolution]),
        );
        // A child department beats its parent
        expect(resolved.get(ann.userUuid)).toMatchObject({
            kind: 'assigned',
            departmentUuid: stores,
            source: 'group',
            sourceGroupName: 'Store staff',
        });
        expect(resolved.get(bob.userUuid)).toEqual({
            kind: 'conflict',
            departmentUuids: [finance, stores].sort(),
        });
        // An explicit assignment wins over groups
        expect(resolved.get(cara.userUuid)).toMatchObject({
            kind: 'assigned',
            departmentUuid: finance,
            source: 'explicit',
        });
        expect(resolved.get(dan.userUuid)).toEqual({ kind: 'unassigned' });
        // Deactivated, not signed up and internal users are not on Lightdash
        [gone, invited, robot].forEach((person) =>
            expect(resolved.has(person.userUuid)).toBe(false),
        );
    });

    test('assigns only people on Lightdash, and keeps someone already assigned after they are deactivated', async () => {
        const organization = await createOrganization('Assignment');
        const ann = await createPerson(organization, 'Ann');
        const invited = await createPerson(organization, 'Invited', {
            signedUp: false,
        });
        const gone = await createPerson(organization, 'Gone', {
            isActive: false,
        });
        const team = await create(organization, 'Team');
        await expect(
            departments.setMembers(organization.organizationUuid, team, [
                invited.userUuid,
            ]),
        ).rejects.toThrow(ParameterError);
        await expect(
            departments.setOwners(organization.organizationUuid, team, [
                { type: 'user', uuid: gone.userUuid },
            ]),
        ).rejects.toThrow(ParameterError);

        await departments.setMembers(organization.organizationUuid, team, [
            ann.userUuid,
        ]);
        await db('users')
            .where('user_uuid', ann.userUuid)
            .update({ is_active: false });
        const saved = await departments.setMembers(
            organization.organizationUuid,
            team,
            [ann.userUuid],
        );
        expect(saved.explicitMemberUuids).toEqual([ann.userUuid]);
    });

    test('refuses a cycle and moves children up when their department is deleted', async () => {
        const organization = await createOrganization('Tree');
        const ops = await create(organization, 'Ops');
        const stores = await create(organization, 'Stores', ops);
        const north = await create(organization, 'North', stores);
        await expect(
            edit(organization, ops, { parentDepartmentUuid: north }),
        ).rejects.toThrow(
            new ParameterError(
                'A department cannot sit under itself or one of its sub-departments',
            ),
        );
        await expect(
            edit(organization, ops, { parentDepartmentUuid: ops }),
        ).rejects.toThrow(ParameterError);
        await departments.delete(organization.organizationUuid, stores);
        expect(await parentOf(north)).toBe(ops);
    });

    test('serializes concurrent moves, so two opposite moves cannot store a cycle', async () => {
        const organization = await createOrganization('Concurrency');
        const attempts = Array.from({ length: 5 }, (_, i) => i);
        await attempts.reduce(
            (previous, attempt) =>
                previous.then(async () => {
                    const a = await create(organization, `A${attempt}`);
                    const b = await create(organization, `B${attempt}`);
                    const results = await Promise.allSettled([
                        edit(organization, a, { parentDepartmentUuid: b }),
                        edit(organization, b, { parentDepartmentUuid: a }),
                    ]);
                    expect(
                        results.filter((r) => r.status === 'fulfilled'),
                    ).toHaveLength(1);
                    const [refused] = results.filter(
                        (r): r is PromiseRejectedResult =>
                            r.status === 'rejected',
                    );
                    expect(refused.reason).toBeInstanceOf(ParameterError);
                    const parents = [await parentOf(a), await parentOf(b)];
                    expect(parents.filter((p) => p === null)).toHaveLength(1);
                }),
            Promise.resolve(),
        );
    });

    test('keeps one explicit assignment per person when two departments assign them at once', async () => {
        const organization = await createOrganization('Assign race');
        const ann = await createPerson(organization, 'Ann');
        const first = await create(organization, 'First');
        const second = await create(organization, 'Second');
        await Promise.all([
            departments.setMembers(organization.organizationUuid, first, [
                ann.userUuid,
            ]),
            departments.setMembers(organization.organizationUuid, second, [
                ann.userUuid,
            ]),
        ]);
        expect(
            await db('department_members').where('user_uuid', ann.userUuid),
        ).toHaveLength(1);
    });

    test('refuses a name that differs only by case, in the same organization only', async () => {
        const organization = await createOrganization('Names');
        const other = await createOrganization('Other names');
        await create(organization, 'Finance');
        await expect(create(organization, 'finance')).rejects.toThrow(
            AlreadyExistsError,
        );
        const sales = await create(organization, 'Sales');
        await expect(
            edit(organization, sales, { name: 'FINANCE' }),
        ).rejects.toThrow(AlreadyExistsError);
        await expect(create(other, 'finance')).resolves.toEqual(
            expect.any(String),
        );
    });

    test('caps an organization at 1,000 departments', async () => {
        const organization = await createOrganization('Count cap');
        await db.raw(
            `INSERT INTO organization_departments (organization_uuid, name)
             SELECT ?, 'Department ' || n FROM generate_series(1, 999) AS n`,
            [organization.organizationUuid],
        );
        await create(organization, 'The thousandth');
        await expect(create(organization, 'One too many')).rejects.toThrow(
            new ParameterError(
                'An organization can have at most 1,000 departments',
            ),
        );
        expect(
            await db('organization_departments').where(
                'organization_uuid',
                organization.organizationUuid,
            ),
        ).toHaveLength(1000);
    });

    test('caps the tree at 10 levels, counting the whole branch on a move', async () => {
        const organization = await createOrganization('Depth cap');
        const levels = await Array.from({ length: 10 }, (_, i) => i).reduce<
            Promise<string[]>
        >(async (previous, level) => {
            const chain = await previous;
            const parent = chain.length > 0 ? chain[chain.length - 1] : null;
            return [
                ...chain,
                await create(organization, `Level ${level + 1}`, parent),
            ];
        }, Promise.resolve([]));
        await expect(
            create(organization, 'Level 11', levels[9]),
        ).rejects.toThrow(
            new ParameterError(
                'Departments can be nested at most 10 levels deep',
            ),
        );
        // A two-level branch fits under level 8 but not under level 9
        const branch = await create(organization, 'Branch');
        await create(organization, 'Branch child', branch);
        await expect(
            edit(organization, branch, { parentDepartmentUuid: levels[8] }),
        ).rejects.toThrow(ParameterError);
        await edit(organization, branch, { parentDepartmentUuid: levels[7] });
        expect(await parentOf(branch)).toBe(levels[7]);
    });
});

describe('two organizations on the real schema', () => {
    test('never let reads or writes cross from one organization to the other', async () => {
        const mine = await createOrganization('Mine');
        const theirs = await createOrganization('Theirs');
        const me = await createPerson(mine, 'Me');
        const them = await createPerson(theirs, 'Them');
        const theirGroup = await createGroup(theirs, 'Their group', [them]);
        const myDepartment = await create(mine, 'Shared name');
        const theirDepartment = await create(theirs, 'Shared name');

        expect(
            (await departments.listByOrganization(mine.organizationUuid)).map(
                (d) => d.departmentUuid,
            ),
        ).toEqual([myDepartment]);
        await expect(
            departments.getByUuid(mine.organizationUuid, theirDepartment),
        ).rejects.toThrow(NotFoundError);
        await expect(
            edit(mine, theirDepartment, { name: 'Taken over' }),
        ).rejects.toThrow(NotFoundError);
        await expect(
            departments.delete(mine.organizationUuid, theirDepartment),
        ).rejects.toThrow(NotFoundError);
        await expect(
            departments.create(
                mine.organizationUuid,
                department('Under theirs', theirDepartment),
                mine.authorUuid,
                LIMITS,
            ),
        ).rejects.toThrow(ParameterError);
        await expect(
            departments.setMembers(mine.organizationUuid, myDepartment, [
                them.userUuid,
            ]),
        ).rejects.toThrow(ParameterError);
        await expect(
            departments.setGroupLinks(mine.organizationUuid, myDepartment, [
                theirGroup,
            ]),
        ).rejects.toThrow(ParameterError);
        expect(
            (
                await departments.getResolvedMemberRows(mine.organizationUuid)
            ).map((r) => r.userUuid),
        ).toEqual([me.userUuid]);
        expect(
            await db('organization_departments')
                .where('department_uuid', theirDepartment)
                .first('name'),
        ).toEqual({ name: 'Shared name' });
    });

    test("attribute a person's activity to them and list only the organization's own content", async () => {
        const mine = await createOrganization('Activity mine');
        const theirs = await createOrganization('Activity theirs');
        const me = await createPerson(mine, 'Me');
        const them = await createPerson(theirs, 'Them');
        const now = new Date();
        const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
        // My only activity is a view of their dashboard and a query in their organization;
        // theirs is on their own content
        const myView = daysAgo(1);
        await addDashboardView(theirs.dashboardUuid, me, myView);
        await addDashboardView(theirs.dashboardUuid, them, daysAgo(1));
        await addQuery(theirs, me, QueryExecutionContext.EXPLORE, daysAgo(1));
        const windows = windowsAt(now);

        // Views are read by the organization's member set, so the view counts for me and
        // nothing of theirs appears; the query carries their organization and does not count
        const activity = await analytics.getActivity(
            mine.organizationUuid,
            [me.userUuid],
            windows,
        );
        expect(activity.lastActiveAt).toEqual(new Map([[me.userUuid, myView]]));
        expect(activity.weeklyActivity).toHaveLength(1);
        expect(activity.weeklyActivity[0]?.userUuid).toBe(me.userUuid);
        expect(
            await analytics.getMemberActivity(
                mine.organizationUuid,
                [me.userUuid],
                windows.activeSince,
                windows.lastActiveSince,
            ),
        ).toEqual([
            {
                userUuid: me.userUuid,
                lastActiveAt: myView,
                isActive30d: true,
                queries30d: 0,
                dashboardViews30d: 1,
            },
        ]);
        expect(
            await analytics.getTopContent(
                mine.organizationUuid,
                [me.userUuid],
                windows.activeSince,
                5,
            ),
        ).toEqual({ dashboards: [], explores: [], aiAgents: [] });

        const theirActivity = await analytics.getActivity(
            theirs.organizationUuid,
            [them.userUuid],
            windows,
        );
        expect([...theirActivity.lastActiveAt.keys()]).toEqual([them.userUuid]);
        const theirContent = await analytics.getTopContent(
            theirs.organizationUuid,
            [them.userUuid],
            windows.activeSince,
            5,
        );
        expect(theirContent.dashboards.map((d) => d.id)).toEqual([
            theirs.dashboardUuid,
        ]);
    });

    test('bound the active flag to 30 days and the last activity to 90 days', async () => {
        const organization = await createOrganization('Windows');
        const now = new Date();
        const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);
        const recent = await createPerson(organization, 'Recent');
        const lapsed = await createPerson(organization, 'Lapsed');
        const old = await createPerson(organization, 'Old');
        const ancient = await createPerson(organization, 'Ancient');
        const querier = await createPerson(organization, 'Querier');
        const scheduled = await createPerson(organization, 'Scheduled');
        await addDashboardView(organization.dashboardUuid, recent, daysAgo(29));
        await addDashboardView(organization.dashboardUuid, lapsed, daysAgo(31));
        await addDashboardView(
            organization.dashboardUuid,
            ancient,
            daysAgo(100),
        );
        await addChartView(organization.chartUuid, old, daysAgo(89));
        await addChartView(organization.chartUuid, ancient, daysAgo(91));
        await addQuery(
            organization,
            querier,
            QueryExecutionContext.EXPLORE,
            daysAgo(10),
        );
        // A scheduled delivery is not something the person did
        await addQuery(
            organization,
            scheduled,
            QueryExecutionContext.SCHEDULED_DELIVERY,
            daysAgo(10),
        );
        const people = [recent, lapsed, old, ancient, querier, scheduled];
        const windows = windowsAt(now);

        const activity = await analytics.getActivity(
            organization.organizationUuid,
            people.map((p) => p.userUuid),
            windows,
        );
        // Everyone with any activity in the last 90 days, at their latest; nobody older, nothing scheduled
        expect(
            new Map(
                [...activity.lastActiveAt].map(([userUuid, at]) => [
                    userUuid,
                    Math.round((now.getTime() - at.getTime()) / DAY),
                ]),
            ),
        ).toEqual(
            new Map([
                [recent.userUuid, 29],
                [lapsed.userUuid, 31],
                [old.userUuid, 89],
                [querier.userUuid, 10],
            ]),
        );

        const members = new Map(
            (
                await analytics.getMemberActivity(
                    organization.organizationUuid,
                    people.map((p) => p.userUuid),
                    windows.activeSince,
                    windows.lastActiveSince,
                )
            ).map((m) => [m.userUuid, m]),
        );
        expect(members.get(recent.userUuid)).toMatchObject({
            isActive30d: true,
            dashboardViews30d: 1,
        });
        expect(members.get(lapsed.userUuid)).toMatchObject({
            isActive30d: false,
            dashboardViews30d: 0,
        });
        expect(members.get(lapsed.userUuid)?.lastActiveAt).not.toBeNull();
        expect(members.get(old.userUuid)?.lastActiveAt).not.toBeNull();
        // Nothing in the last 90 days, so no last activity at all
        expect(members.get(ancient.userUuid)?.lastActiveAt).toBeNull();
        expect(members.get(querier.userUuid)).toMatchObject({
            isActive30d: true,
            queries30d: 1,
        });
        expect(members.get(scheduled.userUuid)).toMatchObject({
            isActive30d: false,
            queries30d: 0,
            lastActiveAt: null,
        });
    });
});
