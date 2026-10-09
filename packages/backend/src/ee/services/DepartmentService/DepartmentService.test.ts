import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    type Account,
    type Authentication,
    type CreateDepartment,
    type MemberAbility,
} from '@lightdash/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DepartmentService,
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

// An API token account: the user's own organization and ability, a token instead of a session
const buildTokenAccount = (
    authentication: Authentication,
    ability: MemberAbility,
): Account =>
    ({
        ...buildAccount(ability),
        authentication,
        isSessionUser: () => false,
        isServiceAccount: () => authentication.type === 'service-account',
        isPatUser: () => authentication.type === 'pat',
    }) as Account;

const SERVICE_ACCOUNT: Authentication = {
    type: 'service-account',
    source: 'service-account-token',
    serviceAccountUuid: 'service-account-uuid',
    serviceAccountDescription: 'CI',
};
const PERSONAL_ACCESS_TOKEN: Authentication = {
    type: 'pat',
    source: 'personal-access-token',
};

const abilityWith = (
    ...grants: Array<['view' | 'manage', string]>
): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    grants.forEach(([action, organizationUuid]) =>
        builder.can(action, 'OrganizationAdoption', { organizationUuid }),
    );
    return builder.build();
};

// The limits every create and move is checked against, inside the model's organization lock
const LIMITS = { maxDepartments: 1000, maxDepth: 10 };

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
});

// One item of each kind, each with the project its link opens in
const TOP_CONTENT = {
    dashboards: [
        {
            id: 'dashboard-uuid',
            name: 'Sales',
            projectUuid: 'project-uuid',
            count: 3,
            distinctPeople: 2,
        },
    ],
    explores: [
        {
            id: 'project-uuid:orders',
            name: 'orders',
            projectUuid: 'project-uuid',
            count: 5,
            distinctPeople: 2,
        },
    ],
    aiAgents: [
        {
            id: 'agent-uuid',
            name: 'Analyst',
            projectUuid: 'project-uuid',
            count: 1,
            distinctPeople: 1,
        },
    ],
};

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
            .mockResolvedValue({ lastActiveAt: new Map(), weeklyActivity: [] }),
        getMemberActivity: vi.fn().mockResolvedValue([]),
        getTopContent: vi.fn().mockResolvedValue(TOP_CONTENT),
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
            LIMITS,
        );
        expect(departmentModel.update).toHaveBeenCalledWith(
            ORG,
            DEP,
            { name: 'x' },
            'user-uuid',
            LIMITS,
        );
        expect(departmentModel.setOwners).toHaveBeenCalledWith(ORG, DEP, [
            { type: 'group', uuid: GRP },
        ]);
    });
});

describe('DepartmentService snapshot cache', () => {
    const viewer = () => buildAccount(abilityWith(['view', ORG]));
    const manager = () =>
        buildAccount(abilityWith(['view', ORG], ['manage', ORG]));
    const viewerOf = (organizationUuid: string): Account =>
        ({
            ...buildAccount(abilityWith(['view', organizationUuid])),
            organization: {
                organizationUuid,
                name: organizationUuid,
                createdAt: new Date(),
            },
        }) as Account;
    afterEach(() => {
        vi.useRealTimers();
    });

    it('reuses the organization snapshot for the summary and the department page', async () => {
        const { service, departmentModel, departmentAnalyticsModel } =
            buildService({
                flag: true,
                departments: [departmentFixture(DEP, null, 5)],
            });
        await service.getSummary(viewer());
        await service.getSummary(viewer());
        const detail = await service.getDetail(viewer(), DEP);

        expect(detail.department.departmentUuid).toBe(DEP);
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(1);
        expect(departmentModel.getResolvedMemberRows).toHaveBeenCalledTimes(1);
        expect(departmentAnalyticsModel.getActivity).toHaveBeenCalledTimes(1);
        // The page reads its people with the cached snapshot's own bounds
        const windows = departmentAnalyticsModel.getActivity.mock.calls[0][2];
        expect(
            departmentAnalyticsModel.getMemberActivity.mock.calls[0][2],
        ).toBe(windows.activeSince);
    });
    it('shares one load between requests that arrive together', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        await Promise.all([
            service.getSummary(viewer()),
            service.getSummary(viewer()),
            service.getSummary(viewer()),
        ]);
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(1);
    });
    it('loads again once the snapshot is 60 seconds old', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
        const { service, departmentModel } = buildService({ flag: true });
        await service.getSummary(viewer());
        vi.setSystemTime(new Date('2026-10-08T12:00:59.999Z'));
        await service.getSummary(viewer());
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(1);
        vi.setSystemTime(new Date('2026-10-08T12:01:00.000Z'));
        await service.getSummary(viewer());
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(2);
    });
    it.each([
        [
            'create',
            (s: DepartmentService, a: Account) => s.create(a, newDepartment),
        ],
        [
            'update',
            (s: DepartmentService, a: Account) =>
                s.update(a, DEP, { name: 'x' }),
        ],
        ['delete', (s: DepartmentService, a: Account) => s.delete(a, DEP)],
        [
            'setGroups',
            (s: DepartmentService, a: Account) => s.setGroups(a, DEP, [GRP]),
        ],
        [
            'setMembers',
            (s: DepartmentService, a: Account) => s.setMembers(a, DEP, [USR]),
        ],
        [
            'setOwners',
            (s: DepartmentService, a: Account) =>
                s.setOwners(a, DEP, [{ type: 'user', uuid: USR }]),
        ],
    ])('drops the snapshot after %s', async (_name, write) => {
        const { service, departmentModel } = buildService({ flag: true });
        await service.getSummary(viewer());
        await write(service, manager());
        await service.getSummary(viewer());
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(2);
    });
    it('drops the snapshot after a write that fails, too', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        departmentModel.create.mockRejectedValueOnce(
            new ParameterError(
                'An organization can have at most 1,000 departments',
            ),
        );
        await service.getSummary(viewer());
        await expect(service.create(manager(), newDepartment)).rejects.toThrow(
            ParameterError,
        );
        await service.getSummary(viewer());
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(2);
    });
    it('does not keep a load that failed', async () => {
        const { service, departmentAnalyticsModel, departmentModel } =
            buildService({ flag: true });
        departmentAnalyticsModel.getActivity.mockRejectedValueOnce(
            new Error('connection lost'),
        );
        departmentModel.getResolvedMemberRows.mockResolvedValue([
            {
                userUuid: 'u1',
                email: 'u1@example.com',
                firstName: 'U',
                lastName: 'One',
                role: OrganizationMemberRole.MEMBER,
                explicitDepartmentUuid: null,
                groupLinks: [],
            },
        ]);
        await expect(service.getSummary(viewer())).rejects.toThrow(
            'connection lost',
        );
        await service.getSummary(viewer());
        expect(departmentAnalyticsModel.getActivity).toHaveBeenCalledTimes(2);
    });
    it('keeps organizations apart, and at most 500 of them, dropping the oldest', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        const organizations = Array.from({ length: 501 }, (_, i) => `org-${i}`);
        await organizations.reduce(
            (previous, organizationUuid) =>
                previous.then(async () => {
                    await service.getSummary(viewerOf(organizationUuid));
                }),
            Promise.resolve(),
        );
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(501);
        await service.getSummary(viewerOf('org-1'));
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(501);
        await service.getSummary(viewerOf('org-0'));
        expect(departmentModel.listByOrganization).toHaveBeenCalledTimes(502);
        expect(departmentModel.listByOrganization).toHaveBeenLastCalledWith(
            'org-0',
        );
    });
});

describe('DepartmentService with API tokens', () => {
    it.each([
        ['a service account', SERVICE_ACCOUNT],
        ['a personal access token', PERSONAL_ACCESS_TOKEN],
    ])(
        'lets %s holding manage create a department in its own organization',
        async (_label, authentication) => {
            const { service, departmentModel } = buildService({ flag: true });
            await service.create(
                buildTokenAccount(
                    authentication,
                    abilityWith(['view', ORG], ['manage', ORG]),
                ),
                newDepartment,
            );
            expect(departmentModel.create).toHaveBeenCalledWith(
                ORG,
                newDepartment,
                'user-uuid',
                LIMITS,
            );
        },
    );
    it.each([
        ['a service account', SERVICE_ACCOUNT],
        ['a personal access token', PERSONAL_ACCESS_TOKEN],
    ])(
        'refuses %s with view only, or manage on another organization, without touching the model',
        async (_label, authentication) => {
            const { service, departmentModel } = buildService({ flag: true });
            await expect(
                service.setMembers(
                    buildTokenAccount(
                        authentication,
                        abilityWith(['view', ORG]),
                    ),
                    DEP,
                    [USR],
                ),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.setMembers(
                    buildTokenAccount(
                        authentication,
                        abilityWith(['view', 'other'], ['manage', 'other']),
                    ),
                    DEP,
                    [USR],
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(departmentModel.setMembers).not.toHaveBeenCalled();
        },
    );
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
        [
            'a 1 MB name on create',
            (s: DepartmentService, a: Account) =>
                s.create(a, {
                    ...newDepartment,
                    name: 'x'.repeat(1024 * 1024),
                }),
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
    const ownerUuid = (i: number) =>
        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    it('refuses more than 20 owners without calling the model', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        await expect(
            service.setOwners(
                manager(),
                DEP,
                Array.from({ length: 21 }, (_, i) => ({
                    type: 'user' as const,
                    uuid: ownerUuid(i),
                })),
            ),
        ).rejects.toThrow(
            new ParameterError('A department can have at most 20 owners'),
        );
        expect(departmentModel.setOwners).not.toHaveBeenCalled();
    });
    it('accepts 20 owners, counting a repeated owner once', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        const twenty = Array.from({ length: 20 }, (_, i) => ({
            type: 'user' as const,
            uuid: ownerUuid(i),
        }));
        await service.setOwners(manager(), DEP, [...twenty, twenty[0]]);
        expect(departmentModel.setOwners).toHaveBeenCalled();
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
            lastActiveAt: new Map([['both', new Date()]]),
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
        expect(byUuid.get('ops')?.effectiveHeadcount).toBe(20);
        expect(byUuid.get('ops')?.hasHeadcount).toBe(true);
        expect(byUuid.get('ops')?.headcountBelowChildren).toBe(false);
        expect(summary.attention).toEqual({
            conflictCount: 0,
            unassignedCount: 1,
        });
    });
    it('never puts a headcount below the people on Lightdash, and counts them where none is set', async () => {
        const departments = [
            departmentFixture('ops', null, 1),
            departmentFixture('finance', null, null),
        ];
        const user = (userUuid: string, departmentUuid: string) => ({
            userUuid,
            email: `${userUuid}@example.com`,
            firstName: userUuid,
            lastName: 'L',
            role: OrganizationMemberRole.MEMBER,
            explicitDepartmentUuid: departmentUuid,
            groupLinks: [],
        });
        const { service, departmentAnalyticsModel } = buildService({
            flag: true,
            departments,
            rows: [user('a', 'ops'), user('b', 'ops'), user('c', 'finance')],
        });
        departmentAnalyticsModel.getActivity.mockResolvedValue({
            lastActiveAt: new Map([
                ['a', new Date()],
                ['c', new Date()],
            ]),
            weeklyActivity: [],
        });
        const summary = await service.getSummary(
            buildAccount(abilityWith(['view', ORG])),
        );
        const byUuid = new Map(
            summary.departments.map((d) => [d.departmentUuid, d]),
        );
        // A headcount of 1 with two people on Lightdash counts two
        expect(byUuid.get('ops')).toMatchObject({
            headcount: 1,
            effectiveHeadcount: 2,
            hasHeadcount: true,
            metrics: { coveragePct: 100, activePct: 50 },
        });
        // No headcount at all: its people on Lightdash, and it says it has none
        expect(byUuid.get('finance')).toMatchObject({
            headcount: null,
            effectiveHeadcount: 1,
            hasHeadcount: false,
            metrics: { coveragePct: 100, activePct: 100 },
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
            windows.activeSince.getTime() - windows.lastActiveSince.getTime(),
        ).toBe((90 - 30) * DAY);
    });
});

// Every member of a run of characters, in one string
const charactersFrom = (from: number, to: number): string =>
    String.fromCodePoint(
        ...Array.from({ length: to - from + 1 }, (_, i) => from + i),
    );

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
        ['NUL in the name', { name: 'Fin\u0000ance' }, 'NAMECONTROL'],
        ['a tab in the name', { name: 'Fin\tance' }, 'NAMECONTROL'],
        ['DEL in the name', { name: 'Fin\u007Fance' }, 'NAMECONTROL'],
        ['NUL in the note', { headcountNote: 'a\u0000b' }, 'NOTECONTROL'],
        ['a line break in the note', { headcountNote: 'a\nb' }, 'NOTECONTROL'],
        [
            'a name of zero-width characters only',
            { name: '\u200B\u2060\uFEFF' },
            'Department name is required',
        ],
        [
            'a name of bidi controls only',
            {
                name: `\u200E\u200F${charactersFrom(0x202a, 0x202e)}${charactersFrom(0x2066, 0x2069)}`,
            },
            'Department name is required',
        ],
        [
            'a name of a soft hyphen only',
            { name: '\u00AD' },
            'Department name is required',
        ],
        [
            'a name of a combining grapheme joiner only',
            { name: '\u034F' },
            'Department name is required',
        ],
        [
            'a name of variation selectors only',
            { name: charactersFrom(0xfe00, 0xfe0f) },
            'Department name is required',
        ],
        [
            'a name of tag characters only',
            { name: charactersFrom(0xe0000, 0xe007f) },
            'Department name is required',
        ],
        ['U+0080 in the name', { name: 'Fin\u0080ance' }, 'NAMECONTROL'],
        [
            'a next-line character (U+0085) in the name',
            { name: 'Fin\u0085ance' },
            'NAMECONTROL',
        ],
        ['U+009F in the name', { name: 'Fin\u009Fance' }, 'NAMECONTROL'],
        [
            'a next-line character (U+0085) in the note',
            { headcountNote: 'a\u0085b' },
            'NOTECONTROL',
        ],
        [
            'a name over 255 characters once normalised',
            { name: '\uFDFA'.repeat(20) },
            'Department name must be 255 characters or fewer',
        ],
        [
            'a 1 MB name, on its raw length',
            { name: '\uFDFA'.repeat(1024 * 1024) },
            'Department name must be 255 characters or fewer',
        ],
        [
            'a raw name of 1,021 characters, even one that would normalise short',
            { name: `A${' '.repeat(1019)}B` },
            'Department name must be 255 characters or fewer',
        ],
        ['year 0000', { targetDate: '0000-01-01' }, 'YEARMSG: 0000-01-01'],
        ['year 1899', { targetDate: '1899-12-31' }, 'YEARMSG: 1899-12-31'],
        ['year 2201', { targetDate: '2201-01-01' }, 'YEARMSG: 2201-01-01'],
        [
            'a very long malformed parent uuid, echoed cut short',
            { parentDepartmentUuid: 'x'.repeat(5000) },
            `Parent department must be a valid UUID: ${'x'.repeat(80)}…`,
        ],
        [
            'a very long malformed date, echoed cut short',
            { targetDate: `2026-01-01${'x'.repeat(5000)}` },
            `DATEMSG: 2026-01-01${'x'.repeat(70)}…`,
        ],
    ])('rejects %s', (_label, data, message) => {
        expect(() => validateDepartmentInput(data)).toThrow(
            new ParameterError(
                message
                    .replace(
                        'DATEMSG',
                        'Target date must be a real date in YYYY-MM-DD format',
                    )
                    .replace(
                        'YEARMSG',
                        'Target date must be between the years 1900 and 2200',
                    )
                    .replace(
                        'NAMECONTROL',
                        'Department name cannot contain control characters such as tabs or line breaks',
                    )
                    .replace(
                        'NOTECONTROL',
                        'Headcount note cannot contain control characters such as tabs or line breaks',
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
        expect(() =>
            validateDepartmentInput({ targetDate: '1900-01-01' }),
        ).not.toThrow();
        expect(() =>
            validateDepartmentInput({ targetDate: '2200-12-31' }),
        ).not.toThrow();
        // Look-alike characters are normalised away rather than refused
        expect(() =>
            validateDepartmentInput({ name: 'Ｆｉｎ\u200Bａｎｃｅ' }),
        ).not.toThrow();
        // 1,020 raw characters is the most normalising is tried on
        expect(() =>
            validateDepartmentInput({ name: `A${' '.repeat(1018)}B` }),
        ).not.toThrow();
    });
    it('refuses a 1 MB name without normalising it', () => {
        const normalize = vi.spyOn(String.prototype, 'normalize');
        try {
            expect(() =>
                validateDepartmentInput({
                    name: '\uFDFA'.repeat(1024 * 1024),
                }),
            ).toThrow(
                new ParameterError(
                    'Department name must be 255 characters or fewer',
                ),
            );
            expect(normalize).not.toHaveBeenCalled();
        } finally {
            normalize.mockRestore();
        }
    });
});

describe('DepartmentService input normalisation', () => {
    // Letters, so upper and lower case differ
    const MIXED = 'AbCdEf12-3456-4789-8AbC-DeF012345678';
    const LOWER = MIXED.toLowerCase();
    const manager = () =>
        buildAccount(abilityWith(['view', ORG], ['manage', ORG]));

    it('stores the normalised name and a lower-case parent on create', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        await service.create(manager(), {
            ...newDepartment,
            name: '  Ｆｉｎ\u200Bａｎｃｅ   Team ',
            parentDepartmentUuid: MIXED,
        });
        expect(departmentModel.create).toHaveBeenCalledWith(
            ORG,
            {
                ...newDepartment,
                name: 'Finance Team',
                parentDepartmentUuid: LOWER,
            },
            'user-uuid',
            LIMITS,
        );
    });
    it('lower-cases every uuid from the path and the body on writes', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        const account = manager();
        await service.update(account, MIXED, {
            name: 'Ops\u00A0 team',
            parentDepartmentUuid: MIXED,
        });
        await service.delete(account, MIXED);
        await service.setGroups(account, MIXED, [MIXED]);
        await service.setMembers(account, MIXED, [MIXED]);
        await service.setOwners(account, MIXED, [
            { type: 'user', uuid: MIXED },
        ]);
        expect(departmentModel.update).toHaveBeenCalledWith(
            ORG,
            LOWER,
            { name: 'Ops team', parentDepartmentUuid: LOWER },
            'user-uuid',
            LIMITS,
        );
        expect(departmentModel.delete).toHaveBeenCalledWith(ORG, LOWER);
        expect(departmentModel.setGroupLinks).toHaveBeenCalledWith(ORG, LOWER, [
            LOWER,
        ]);
        expect(departmentModel.setMembers).toHaveBeenCalledWith(ORG, LOWER, [
            LOWER,
        ]);
        expect(departmentModel.setOwners).toHaveBeenCalledWith(ORG, LOWER, [
            { type: 'user', uuid: LOWER },
        ]);
    });
    it('finds a department by its uuid in upper case', async () => {
        const { service } = buildService({
            flag: true,
            departments: [departmentFixture(LOWER, null, 5)],
        });
        const detail = await service.getDetail(
            buildAccount(abilityWith(['view', ORG])),
            MIXED.toUpperCase(),
        );
        expect(detail.department.departmentUuid).toBe(LOWER);
    });
    it('cuts a long malformed path uuid short in the error', async () => {
        const { service } = buildService({ flag: true });
        await expect(
            service.delete(manager(), 'y'.repeat(100_000)),
        ).rejects.toThrow(
            new ParameterError(
                `Department must be a valid UUID: ${'y'.repeat(80)}…`,
            ),
        );
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
        // Each item keeps the project its link opens in
        expect(detail.topContent).toEqual(TOP_CONTENT);
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
            lastActiveAt: new Map([
                ['a', new Date()],
                ['c', new Date()],
            ]),
            weeklyActivity: [],
        });
        const member = (userUuid: string, isActive30d: boolean) => ({
            userUuid,
            lastActiveAt: isActive30d ? new Date() : null,
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
        // Each person lands in the activity bucket the split counts them in
        expect(
            Object.fromEntries(
                detail.members.map((m) => [m.userUuid, m.activity]),
            ),
        ).toEqual({ a: 'healthy', b: 'lost' });
        expect(detail.department.metrics.activitySplit).toEqual({
            healthy: 1,
            atRisk: 0,
            lost: 1,
        });
        // The count and the flags are bounded by the very same instant
        expect(
            departmentAnalyticsModel.getMemberActivity.mock.calls[0][2],
        ).toBe(
            departmentAnalyticsModel.getActivity.mock.calls[0][2].activeSince,
        );
        // Last activity is read back 90 days from that instant too
        expect(
            departmentAnalyticsModel.getMemberActivity.mock.calls[0][3],
        ).toBe(
            departmentAnalyticsModel.getActivity.mock.calls[0][2]
                .lastActiveSince,
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
