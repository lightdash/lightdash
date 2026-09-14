import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    SpaceMemberRole,
    type DirectAccessAssignment,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const ORG_UUID = 'org-uuid';
const user = { userUuid: 'exporter-uuid' } as SessionUser;

const userAssignment = (
    overrides: Partial<{
        userUuid: string;
        email: string | null;
        role: SpaceMemberRole;
    }> = {},
): DirectAccessAssignment => ({
    principal: {
        type: DirectAccessPrincipalType.USER,
        userUuid: overrides.userUuid ?? 'user-1',
        firstName: 'Vera',
        lastName: 'Viewer',
        email:
            overrides.email === undefined ? 'vera@acme.com' : overrides.email,
    },
    role: overrides.role ?? SpaceMemberRole.VIEWER,
    grantedByUserUuid: 'granter-uuid',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
});

const groupAssignment = (
    overrides: Partial<{
        groupUuid: string;
        name: string;
        role: SpaceMemberRole;
    }> = {},
): DirectAccessAssignment => ({
    principal: {
        type: DirectAccessPrincipalType.GROUP,
        groupUuid: overrides.groupUuid ?? 'group-1',
        name: overrides.name ?? 'Analysts',
    },
    role: overrides.role ?? SpaceMemberRole.EDITOR,
    grantedByUserUuid: 'granter-uuid',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
});

type Setup = {
    policies: Record<string, DirectAccessAssignment[]>;
    members?: { userUuid: string; email: string }[];
    groups?: { uuid: string; name: string }[];
};

const buildService = ({ policies, members, groups }: Setup) =>
    new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as never,
        savedChartModel: {} as never,
        savedSqlModel: {} as never,
        appModel: {} as never,
        dashboardModel: {} as never,
        spaceModel: {} as never,
        schedulerModel: {} as never,
        schedulerService: {} as never,
        savedChartService: {} as never,
        dashboardService: {} as never,
        schedulerClient: {} as never,
        promoteService: {} as never,
        spacePermissionService: {} as never,
        contentAsCodeSnapshotModel: {} as never,
        contentAsCodeProjectSettingsModel: {} as never,
        contentVerificationModel: {} as never,
        groupsModel: {
            find: vi.fn(async ({ name }: { name: string }) => ({
                data: (
                    groups ?? [{ uuid: 'group-1', name: 'Analysts' }]
                ).filter((group) => group.name === name),
            })),
        } as never,
        organizationMemberProfileModel: {
            findOrganizationMembersByEmails: vi.fn(
                async () =>
                    members ?? [{ userUuid: 'user-1', email: 'vera@acme.com' }],
            ),
        } as never,
        userModel: {} as never,
        directAccessService: {
            listPoliciesForExport: vi.fn(async () => policies),
        } as never,
    });

describe('CoderService.getPortableDirectAccessByUuid', () => {
    it('maps portable users and groups deterministically without internal identifiers', async () => {
        const service = buildService({
            policies: {
                'chart-1': [
                    groupAssignment({ role: SpaceMemberRole.ADMIN }),
                    userAssignment({
                        userUuid: 'user-2',
                        email: 'Zoe@acme.com',
                        role: SpaceMemberRole.EDITOR,
                    }),
                    userAssignment(),
                ],
            },
            members: [
                { userUuid: 'user-1', email: 'vera@acme.com' },
                { userUuid: 'user-2', email: 'zoe@acme.com' },
            ],
        });

        const result = await service.getPortableDirectAccessByUuid(
            user,
            ORG_UUID,
            DirectAccessResourceType.CHART,
            ['chart-1'],
        );

        expect(result.get('chart-1')).toEqual({
            users: [
                { email: 'vera@acme.com', role: SpaceMemberRole.VIEWER },
                { email: 'zoe@acme.com', role: SpaceMemberRole.EDITOR },
            ],
            groups: [{ name: 'Analysts', role: SpaceMemberRole.ADMIN }],
        });
    });

    it('omits the whole policy when any user lacks a portable identity', async () => {
        const service = buildService({
            policies: {
                'no-email': [userAssignment({ email: null })],
                'ambiguous-email': [userAssignment()],
                portable: [userAssignment()],
            },
            members: [
                { userUuid: 'user-1', email: 'vera@acme.com' },
                { userUuid: 'user-9', email: 'vera@acme.com' },
            ],
        });

        const result = await service.getPortableDirectAccessByUuid(
            user,
            ORG_UUID,
            DirectAccessResourceType.DASHBOARD,
            ['no-email', 'ambiguous-email', 'portable'],
        );

        // The duplicated email poisons every policy that references it.
        expect(result.size).toBe(0);
    });

    it('omits the whole policy when a group name is not unique or does not match', async () => {
        const service = buildService({
            policies: {
                'dup-group': [groupAssignment()],
                'mismatched-group': [
                    groupAssignment({ groupUuid: 'group-2', name: 'Ops' }),
                ],
            },
            groups: [
                { uuid: 'group-1', name: 'Analysts' },
                { uuid: 'group-9', name: 'Analysts' },
                { uuid: 'group-other', name: 'Ops' },
            ],
        });

        const result = await service.getPortableDirectAccessByUuid(
            user,
            ORG_UUID,
            DirectAccessResourceType.SQL_CHART,
            ['dup-group', 'mismatched-group'],
        );

        expect(result.size).toBe(0);
    });

    it('returns no entries when the feature returns no policies', async () => {
        const service = buildService({ policies: {} });

        const result = await service.getPortableDirectAccessByUuid(
            user,
            ORG_UUID,
            DirectAccessResourceType.APP,
            ['app-1'],
        );

        expect(result.size).toBe(0);
    });
});
