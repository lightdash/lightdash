import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    type Account,
    type CreateDepartment,
    type MemberAbility,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    DepartmentService,
    getActivityWindows,
    validateDepartmentInput,
} from './DepartmentService';

const ORG = 'org-1';
const DEP = '11111111-1111-4111-8111-111111111111';
const GRP = '22222222-2222-4222-8222-222222222222';
const USR = '33333333-3333-4333-8333-333333333333';

const buildAccount = (ability: MemberAbility): Account =>
    ({
        authentication: { type: 'session', source: 'session-cookie' },
        organization: {
            organizationUuid: ORG,
            name: 'Org',
            createdAt: new Date(),
        },
        user: {
            id: 'user-uuid',
            userUuid: 'user-uuid',
            userId: 1,
            email: 'user@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
            type: 'registered',
            isActive: true,
            ability,
            abilityRules: ability.rules,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            timezone: null,
        },
        isAnonymousUser: () => false,
        isAuthenticated: () => true,
        isJwtUser: () => false,
        isOauthUser: () => false,
        isPatUser: () => false,
        isRegisteredUser: () => true,
        isServiceAccount: () => false,
        isSessionUser: () => true,
    }) as Account;

const abilityWith = (
    ...grants: Array<['view' | 'manage', string]>
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    grants.forEach(([action, organizationUuid]) =>
        builder.can(action, 'OrganizationAdoption', { organizationUuid }),
    );
    return builder.build();
};

const newDepartment: CreateDepartment = {
    name: 'Finance',
    parentDepartmentUuid: null,
    headcount: null,
    headcountNote: null,
    targetActiveUsers: null,
    targetDate: null,
};

const departmentFixture = (
    departmentUuid: string,
    parentDepartmentUuid: string | null,
    headcount: number | null,
) => ({
    ...newDepartment,
    departmentUuid,
    parentDepartmentUuid,
    name: departmentUuid,
    headcount,
    owners: [],
    linkedGroups: [],
    explicitMemberUuids: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
});

const buildService = (opts: {
    flag: boolean;
    rows?: unknown[];
    departments?: unknown[];
}) => {
    const departmentModel = {
        listByOrganization: vi.fn().mockResolvedValue(opts.departments ?? []),
        getResolvedMemberRows: vi.fn().mockResolvedValue(opts.rows ?? []),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
        setGroupLinks: vi.fn().mockResolvedValue({}),
        setMembers: vi.fn().mockResolvedValue({}),
        setOwners: vi.fn().mockResolvedValue({}),
    };
    const departmentAnalyticsModel = {
        getActivity: vi
            .fn()
            .mockResolvedValue({ activeUserUuids: [], weeklyActivity: [] }),
        getMemberActivity: vi.fn().mockResolvedValue([]),
        getTopContent: vi
            .fn()
            .mockResolvedValue({ dashboards: [], explores: [], aiAgents: [] }),
    };
    const service = new DepartmentService({
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: opts.flag }),
        },
        departmentModel: departmentModel as never,
        departmentAnalyticsModel: departmentAnalyticsModel as never,
    });
    return { service, departmentModel, departmentAnalyticsModel };
};

describe('DepartmentService gating', () => {
    it('throws NotFoundError when the flag is off, even for an admin', async () => {
        const { service, departmentModel } = buildService({ flag: false });
        await expect(
            service.getSummary(buildAccount(abilityWith(['view', ORG]))),
        ).rejects.toThrow(NotFoundError);
        expect(departmentModel.listByOrganization).not.toHaveBeenCalled();
    });
    it('throws ForbiddenError without the view scope', async () => {
        const { service } = buildService({ flag: true });
        await expect(
            service.getSummary(buildAccount(abilityWith())),
        ).rejects.toThrow(ForbiddenError);
    });
    it('throws ForbiddenError when only another org is granted', async () => {
        const { service } = buildService({ flag: true });
        await expect(
            service.getSummary(buildAccount(abilityWith(['view', 'other']))),
        ).rejects.toThrow(ForbiddenError);
    });
    it('throws NotFoundError for a write when the flag is off, without touching the model', async () => {
        const { service, departmentModel } = buildService({ flag: false });
        await expect(
            service.create(
                buildAccount(abilityWith(['view', ORG], ['manage', ORG])),
                newDepartment,
            ),
        ).rejects.toThrow(NotFoundError);
        expect(departmentModel.create).not.toHaveBeenCalled();
    });
    it.each([
        [
            'create',
            (s: DepartmentService, a: Account) => s.create(a, newDepartment),
            'create',
        ],
        [
            'update',
            (s: DepartmentService, a: Account) =>
                s.update(a, DEP, { name: 'x' }),
            'update',
        ],
        [
            'delete',
            (s: DepartmentService, a: Account) => s.delete(a, DEP),
            'delete',
        ],
        [
            'setGroups',
            (s: DepartmentService, a: Account) => s.setGroups(a, DEP, []),
            'setGroupLinks',
        ],
        [
            'setMembers',
            (s: DepartmentService, a: Account) => s.setMembers(a, DEP, []),
            'setMembers',
        ],
        [
            'setOwners',
            (s: DepartmentService, a: Account) => s.setOwners(a, DEP, []),
            'setOwners',
        ],
    ])('%s needs manage, not just view', async (_name, call, modelMethod) => {
        const { service, departmentModel } = buildService({ flag: true });
        await expect(
            call(service, buildAccount(abilityWith(['view', ORG]))),
        ).rejects.toThrow(ForbiddenError);
        expect(
            departmentModel[modelMethod as keyof typeof departmentModel],
        ).not.toHaveBeenCalled();
    });
    it('passes the account organization to the model on every write', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        const account = buildAccount(
            abilityWith(['view', ORG], ['manage', ORG]),
        );
        await service.create(account, newDepartment);
        await service.update(account, DEP, { name: 'x' });
        await service.setOwners(account, DEP, [{ type: 'group', uuid: GRP }]);
        expect(departmentModel.create).toHaveBeenCalledWith(
            ORG,
            newDepartment,
            'user-uuid',
        );
        expect(departmentModel.update).toHaveBeenCalledWith(
            ORG,
            DEP,
            { name: 'x' },
            'user-uuid',
        );
        expect(departmentModel.setOwners).toHaveBeenCalledWith(ORG, DEP, [
            { type: 'group', uuid: GRP },
        ]);
    });
});

describe('DepartmentService.getMembership', () => {
    it('throws NotFoundError when the flag is off', async () => {
        const { service } = buildService({ flag: false });
        await expect(
            service.getMembership(buildAccount(abilityWith(['view', ORG]))),
        ).rejects.toThrow(NotFoundError);
    });
    it('throws ForbiddenError without the view scope', async () => {
        const { service } = buildService({ flag: true });
        await expect(
            service.getMembership(buildAccount(abilityWith())),
        ).rejects.toThrow(ForbiddenError);
    });
    it('returns the resolved membership', async () => {
        const { service } = buildService({
            flag: true,
            rows: [
                {
                    userUuid: 'u1',
                    email: 'u1@example.com',
                    firstName: 'U',
                    lastName: 'One',
                    role: OrganizationMemberRole.MEMBER,
                    explicitDepartmentUuid: null,
                    groupLinks: [],
                },
            ],
        });
        const result = await service.getMembership(
            buildAccount(abilityWith(['view', ORG])),
        );
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            userUuid: 'u1',
            resolution: { kind: 'unassigned' },
        });
    });
});

describe('DepartmentService input validation', () => {
    const manager = () =>
        buildAccount(abilityWith(['view', ORG], ['manage', ORG]));
    it('create rejects invalid input without calling the model', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        await expect(
            service.create(manager(), { ...newDepartment, name: '  ' }),
        ).rejects.toThrow(ParameterError);
        expect(departmentModel.create).not.toHaveBeenCalled();
    });
    it('update rejects invalid input without calling the model', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        await expect(
            service.update(manager(), DEP, { headcount: -1 }),
        ).rejects.toThrow(ParameterError);
        expect(departmentModel.update).not.toHaveBeenCalled();
    });
    it.each([
        [
            'malformed department uuid on update',
            (s: DepartmentService, a: Account) =>
                s.update(a, 'nope', { name: 'x' }),
        ],
        [
            'malformed department uuid on delete',
            (s: DepartmentService, a: Account) => s.delete(a, 'nope'),
        ],
        [
            'malformed department uuid on setGroups',
            (s: DepartmentService, a: Account) => s.setGroups(a, 'nope', []),
        ],
        [
            'malformed department uuid on setMembers',
            (s: DepartmentService, a: Account) => s.setMembers(a, 'nope', []),
        ],
        [
            'malformed department uuid on setOwners',
            (s: DepartmentService, a: Account) => s.setOwners(a, 'nope', []),
        ],
        [
            'malformed parent uuid on create',
            (s: DepartmentService, a: Account) =>
                s.create(a, { ...newDepartment, parentDepartmentUuid: 'nope' }),
        ],
        [
            'malformed parent uuid on update',
            (s: DepartmentService, a: Account) =>
                s.update(a, DEP, { parentDepartmentUuid: 'nope' }),
        ],
        [
            'malformed group uuid',
            (s: DepartmentService, a: Account) =>
                s.setGroups(a, DEP, [GRP, 'nope']),
        ],
        [
            'malformed user uuid',
            (s: DepartmentService, a: Account) =>
                s.setMembers(a, DEP, [USR, 'nope']),
        ],
        [
            'malformed owner uuid',
            (s: DepartmentService, a: Account) =>
                s.setOwners(a, DEP, [{ type: 'user', uuid: 'nope' }]),
        ],
        [
            'bad owner type',
            (s: DepartmentService, a: Account) =>
                s.setOwners(a, DEP, [{ type: 'team', uuid: USR } as never]),
        ],
        [
            'too many groups',
            (s: DepartmentService, a: Account) =>
                s.setGroups(a, DEP, Array(5001).fill(GRP)),
        ],
        [
            'too many users',
            (s: DepartmentService, a: Account) =>
                s.setMembers(a, DEP, Array(5001).fill(USR)),
        ],
        [
            'too many owners',
            (s: DepartmentService, a: Account) =>
                s.setOwners(
                    a,
                    DEP,
                    Array(5001).fill({ type: 'user', uuid: USR }),
                ),
        ],
    ])('rejects %s before any model call', async (_name, call) => {
        const { service, departmentModel } = buildService({ flag: true });
        await expect(call(service, manager())).rejects.toThrow(ParameterError);
        Object.values(departmentModel).forEach((fn) =>
            expect(fn).not.toHaveBeenCalled(),
        );
    });
    it('accepts the maximum list size', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        await service.setMembers(manager(), DEP, Array(5000).fill(USR));
        expect(departmentModel.setMembers).toHaveBeenCalled();
    });
});

describe('DepartmentService.getSummary', () => {
    it('resolves with the tree, rolls up, and reports attention', async () => {
        const departments = [
            departmentFixture('ops', null, 20),
            departmentFixture('stores', 'ops', 10),
        ];
        const link = (departmentUuid: string) => ({
            departmentUuid,
            groupUuid: `g-${departmentUuid}`,
            groupName: departmentUuid,
        });
        const user = (userUuid: string, groupLinks: unknown[]) => ({
            userUuid,
            email: `${userUuid}@example.com`,
            firstName: userUuid,
            lastName: 'L',
            role: OrganizationMemberRole.MEMBER,
            explicitDepartmentUuid: null,
            groupLinks,
        });
        const { service, departmentAnalyticsModel } = buildService({
            flag: true,
            departments,
            rows: [
                user('both', [link('ops'), link('stores')]),
                user('none', []),
            ],
        });
        departmentAnalyticsModel.getActivity.mockResolvedValue({
            activeUserUuids: ['both'],
            weeklyActivity: [],
        });

        const summary = await service.getSummary(
            buildAccount(abilityWith(['view', ORG])),
        );
        const byUuid = new Map(
            summary.departments.map((d) => [d.departmentUuid, d]),
        );
        expect(byUuid.get('stores')?.metrics.memberCount).toBe(1);
        expect(byUuid.get('ops')?.metrics.memberCount).toBe(1);
        expect(byUuid.get('ops')?.directMetrics.memberCount).toBe(0);
        expect(byUuid.get('ops')?.metrics.activePct).toBe(5);
        expect(byUuid.get('ops')?.headcountBelowChildren).toBe(false);
        expect(summary.attention).toEqual({
            conflictCount: 0,
            unassignedCount: 1,
        });
    });
});

describe('DepartmentService analytics scoping', () => {
    it('reads activity once, for exactly the org member uuids', async () => {
        const row = (userUuid: string) => ({
            userUuid,
            email: `${userUuid}@example.com`,
            firstName: userUuid,
            lastName: 'L',
            role: OrganizationMemberRole.MEMBER,
            explicitDepartmentUuid: null,
            groupLinks: [],
        });
        const { service, departmentModel, departmentAnalyticsModel } =
            buildService({
                flag: true,
                rows: [row('u1'), row('u2'), row('u3')],
            });
        await service.getSummary(buildAccount(abilityWith(['view', ORG])));
        expect(departmentModel.getResolvedMemberRows).toHaveBeenCalledWith(ORG);
        expect(departmentAnalyticsModel.getActivity).toHaveBeenCalledTimes(1);
        const [org, userUuids, windows] =
            departmentAnalyticsModel.getActivity.mock.calls[0];
        expect(org).toBe(ORG);
        expect(userUuids).toEqual(['u1', 'u2', 'u3']);
        const DAY = 24 * 60 * 60 * 1000;
        expect(
            windows.activeSince.getTime() - windows.trendSince.getTime(),
        ).toBe((84 - 30) * DAY);
    });
});

describe('getActivityWindows', () => {
    it('measures 30 days and 12 weeks back from one instant', () => {
        expect(getActivityWindows(new Date('2026-10-08T09:30:00Z'))).toEqual({
            activeSince: new Date('2026-09-08T09:30:00Z'),
            trendSince: new Date('2026-07-16T09:30:00Z'),
        });
    });
});

describe('validateDepartmentInput', () => {
    it.each([
        ['empty name', { name: '   ' }, 'Department name is required'],
        [
            'long name',
            { name: 'x'.repeat(256) },
            'Department name must be 255 characters or fewer',
        ],
        [
            'negative headcount',
            { headcount: -1 },
            'Headcount must be a whole number of 0 or more, up to 2147483647: -1',
        ],
        [
            'fractional headcount',
            { headcount: 1.5 },
            'Headcount must be a whole number of 0 or more, up to 2147483647: 1.5',
        ],
        [
            'huge headcount',
            { headcount: 2147483648 },
            'Headcount must be a whole number of 0 or more, up to 2147483647: 2147483648',
        ],
        [
            'negative target',
            { targetActiveUsers: -3 },
            'Target active users must be a whole number of 0 or more, up to 2147483647: -3',
        ],
        [
            'huge target',
            { targetActiveUsers: 2147483648 },
            'Target active users must be a whole number of 0 or more, up to 2147483647: 2147483648',
        ],
        [
            'bad date format',
            { targetDate: '31/12/2026' },
            'DATEMSG: 31/12/2026',
        ],
        ['month 13', { targetDate: '2026-13-45' }, 'DATEMSG: 2026-13-45'],
        ['feb 30', { targetDate: '2026-02-30' }, 'DATEMSG: 2026-02-30'],
        [
            'long note',
            { headcountNote: 'x'.repeat(501) },
            'Headcount note must be 500 characters or fewer',
        ],
    ])('rejects %s', (_label, data, message) => {
        expect(() => validateDepartmentInput(data)).toThrow(
            new ParameterError(
                message.replace(
                    'DATEMSG',
                    'Target date must be a real date in YYYY-MM-DD format',
                ),
            ),
        );
    });
    it('accepts boundaries, nulls and omitted fields', () => {
        expect(() =>
            validateDepartmentInput({
                name: 'x'.repeat(255),
                headcount: 2147483647,
                targetActiveUsers: null,
                targetDate: '2028-02-29',
            }),
        ).not.toThrow();
        expect(() => validateDepartmentInput({ headcount: 0 })).not.toThrow();
        expect(() => validateDepartmentInput({})).not.toThrow();
    });
});

describe('DepartmentService.getDetail', () => {
    const OPS = '44444444-4444-4444-8444-444444444444';
    const STORES = '55555555-5555-4555-8555-555555555555';
    const FINANCE = '66666666-6666-4666-8666-666666666666';
    const OTHER_ORG_DEPARTMENT = '77777777-7777-4777-8777-777777777777';
    const link = (departmentUuid: string) => ({
        departmentUuid,
        groupUuid: `g-${departmentUuid}`,
        groupName: departmentUuid,
    });
    const user = (userUuid: string, departmentUuid: string) => ({
        userUuid,
        email: `${userUuid}@example.com`,
        firstName: userUuid,
        lastName: 'L',
        role: OrganizationMemberRole.VIEWER,
        explicitDepartmentUuid: null,
        groupLinks: [link(departmentUuid)],
    });
    const departments = [
        { ...departmentFixture(OPS, null, 20), targetActiveUsers: 5 },
        departmentFixture(STORES, OPS, 10),
        departmentFixture(FINANCE, null, 5),
    ];
    const rows = [user('a', OPS), user('b', STORES), user('c', FINANCE)];
    const viewer = () => buildAccount(abilityWith(['view', ORG]));

    it('is gated like the summary', async () => {
        const { service, departmentModel } = buildService({
            flag: false,
            departments,
            rows,
        });
        await expect(service.getDetail(viewer(), OPS)).rejects.toThrow(
            NotFoundError,
        );
        expect(departmentModel.listByOrganization).not.toHaveBeenCalled();
    });
    it('throws ForbiddenError without the view scope', async () => {
        const { service } = buildService({ flag: true, departments, rows });
        await expect(
            service.getDetail(buildAccount(abilityWith()), OPS),
        ).rejects.toThrow(ForbiddenError);
    });
    it('checks the scope before it validates the uuid', async () => {
        const { service } = buildService({ flag: true, departments, rows });
        await expect(
            service.getDetail(buildAccount(abilityWith()), 'not-a-uuid'),
        ).rejects.toThrow(ForbiddenError);
    });
    it('rejects a department that is not a uuid before reading anything', async () => {
        const { service, departmentModel } = buildService({
            flag: true,
            departments,
            rows,
        });
        await expect(service.getDetail(viewer(), 'ops')).rejects.toThrow(
            ParameterError,
        );
        expect(departmentModel.listByOrganization).not.toHaveBeenCalled();
    });
    it('throws NotFoundError for a department that does not exist', async () => {
        const { service } = buildService({ flag: true, departments, rows });
        await expect(
            service.getDetail(viewer(), OTHER_ORG_DEPARTMENT),
        ).rejects.toThrow(NotFoundError);
    });
    it('answers a department from another organization exactly like a missing one', async () => {
        // The model only returns the caller's organization, so a foreign uuid is simply absent
        const { service, departmentModel, departmentAnalyticsModel } =
            buildService({ flag: true, departments, rows });
        const missing = await service
            .getDetail(viewer(), '88888888-8888-4888-8888-888888888888')
            .catch((e) => e);
        const foreign = await service
            .getDetail(viewer(), OTHER_ORG_DEPARTMENT)
            .catch((e) => e);
        expect(foreign).toBeInstanceOf(NotFoundError);
        expect(missing).toBeInstanceOf(NotFoundError);
        expect(foreign.message.replace(OTHER_ORG_DEPARTMENT, '#')).toBe(
            missing.message.replace(
                '88888888-8888-4888-8888-888888888888',
                '#',
            ),
        );
        expect(departmentModel.listByOrganization).toHaveBeenCalledWith(ORG);
        expect(
            departmentAnalyticsModel.getMemberActivity,
        ).not.toHaveBeenCalled();
        expect(departmentAnalyticsModel.getTopContent).not.toHaveBeenCalled();
    });
    it('takes the organization from the account only', async () => {
        const { service, departmentModel } = buildService({
            flag: true,
            departments,
            rows,
        });
        await service.getDetail(viewer(), OPS);
        expect(departmentModel.listByOrganization).toHaveBeenCalledWith(ORG);
        expect(departmentModel.getResolvedMemberRows).toHaveBeenCalledWith(ORG);
    });
    it('reads activity and content for the department and its descendants only', async () => {
        const { service, departmentAnalyticsModel } = buildService({
            flag: true,
            departments,
            rows,
        });
        const detail = await service.getDetail(viewer(), OPS);

        const [org, userUuids] =
            departmentAnalyticsModel.getMemberActivity.mock.calls[0];
        expect(org).toBe(ORG);
        expect([...userUuids].sort()).toEqual(['a', 'b']);
        const [topOrg, topUsers, since, limit] =
            departmentAnalyticsModel.getTopContent.mock.calls[0];
        expect(topOrg).toBe(ORG);
        expect([...topUsers].sort()).toEqual(['a', 'b']);
        expect(limit).toBe(5);
        expect(since).toBe(
            departmentAnalyticsModel.getActivity.mock.calls[0][2].activeSince,
        );
        expect(detail.children.map((d) => d.departmentUuid)).toEqual([STORES]);
        expect(detail.members.map((m) => m.userUuid).sort()).toEqual([
            'a',
            'b',
        ]);
        expect(detail.targetProgress).toMatchObject({
            targetActiveUsers: 5,
            remaining: 5,
        });
        expect(detail.weeklyActive).toHaveLength(12);
    });
    it('agrees on who is active between the 30-day count and the member flags', async () => {
        const { service, departmentAnalyticsModel } = buildService({
            flag: true,
            departments,
            rows,
        });
        // Both reads apply one definition, so the fixture answers them consistently
        departmentAnalyticsModel.getActivity.mockResolvedValue({
            activeUserUuids: ['a', 'c'],
            weeklyActivity: [],
        });
        const member = (userUuid: string, isActive30d: boolean) => ({
            userUuid,
            lastActiveAt: isActive30d ? new Date('2026-10-01T09:00:00Z') : null,
            isActive30d,
            queries30d: 0,
            dashboardViews30d: 0,
        });
        departmentAnalyticsModel.getMemberActivity.mockResolvedValue([
            member('a', true),
            member('b', false),
        ]);

        const detail = await service.getDetail(viewer(), OPS);

        expect(detail.department.metrics.activeCount30d).toBe(1);
        expect(
            detail.members.filter((m) => m.isActive30d).map((m) => m.userUuid),
        ).toEqual(['a']);
        expect(detail.members.filter((m) => m.isActive30d)).toHaveLength(
            detail.department.metrics.activeCount30d,
        );
        // The count and the flags are bounded by the very same instant
        expect(
            departmentAnalyticsModel.getMemberActivity.mock.calls[0][2],
        ).toBe(
            departmentAnalyticsModel.getActivity.mock.calls[0][2].activeSince,
        );
    });
    it('lists ancestors from the top down', async () => {
        const { service } = buildService({ flag: true, departments, rows });
        const detail = await service.getDetail(viewer(), STORES);
        expect(detail.ancestors).toEqual([{ departmentUuid: OPS, name: OPS }]);
    });
    it('returns no ancestors and no target progress for a top level department without a target', async () => {
        const { service } = buildService({ flag: true, departments, rows });
        const detail = await service.getDetail(viewer(), FINANCE);
        expect(detail.ancestors).toEqual([]);
        expect(detail.targetProgress).toBeNull();
    });
});
