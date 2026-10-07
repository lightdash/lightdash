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
    validateDepartmentInput,
} from './DepartmentService';

const ORG = 'org-1';

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
        getActiveUserUuids: vi.fn().mockResolvedValue([]),
        getWeeklyActivity: vi.fn().mockResolvedValue([]),
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
    it.each([
        [
            'create',
            (s: DepartmentService, a: Account) => s.create(a, newDepartment),
        ],
        [
            'update',
            (s: DepartmentService, a: Account) =>
                s.update(a, 'd', { name: 'x' }),
        ],
        ['delete', (s: DepartmentService, a: Account) => s.delete(a, 'd')],
        [
            'setGroups',
            (s: DepartmentService, a: Account) => s.setGroups(a, 'd', []),
        ],
        [
            'setMembers',
            (s: DepartmentService, a: Account) => s.setMembers(a, 'd', []),
        ],
        [
            'setOwners',
            (s: DepartmentService, a: Account) => s.setOwners(a, 'd', []),
        ],
    ])('%s needs manage, not just view', async (_name, call) => {
        const { service } = buildService({ flag: true });
        await expect(
            call(service, buildAccount(abilityWith(['view', ORG]))),
        ).rejects.toThrow(ForbiddenError);
    });
    it('always passes the session org to the model', async () => {
        const { service, departmentModel } = buildService({ flag: true });
        const account = buildAccount(
            abilityWith(['view', ORG], ['manage', ORG]),
        );
        await service.setOwners(account, 'd', [{ type: 'group', uuid: 'g' }]);
        expect(departmentModel.setOwners).toHaveBeenCalledWith(ORG, 'd', [
            { type: 'group', uuid: 'g' },
        ]);
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
        departmentAnalyticsModel.getActiveUserUuids.mockResolvedValue(['both']);

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
    it('hands both analytics methods exactly the org member uuids', async () => {
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
        const memberUuids = ['u1', 'u2', 'u3'];
        expect(
            departmentAnalyticsModel.getActiveUserUuids,
        ).toHaveBeenCalledWith(ORG, memberUuids, 30);
        expect(departmentAnalyticsModel.getWeeklyActivity).toHaveBeenCalledWith(
            ORG,
            memberUuids,
            12,
        );
    });
});

describe('validateDepartmentInput', () => {
    it.each([
        [{ name: '   ' }, 'Department name is required'],
        [{ headcount: -1 }, 'Headcount must be a whole number of 0 or more'],
        [{ headcount: 1.5 }, 'Headcount must be a whole number of 0 or more'],
        [
            { targetActiveUsers: -3 },
            'Target active users must be a whole number of 0 or more',
        ],
        [{ targetDate: '31/12/2026' }, 'Target date must be YYYY-MM-DD'],
        [
            { headcountNote: 'x'.repeat(501) },
            'Headcount note must be 500 characters or fewer',
        ],
    ])('rejects %j', (data, message) => {
        expect(() => validateDepartmentInput(data)).toThrow(
            new ParameterError(message),
        );
    });
    it('accepts nulls, zero and omitted fields', () => {
        expect(() =>
            validateDepartmentInput({
                headcount: 0,
                targetActiveUsers: null,
                targetDate: null,
            }),
        ).not.toThrow();
        expect(() => validateDepartmentInput({})).not.toThrow();
    });
});
