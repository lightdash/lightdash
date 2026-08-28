import { Ability } from '@casl/ability';
import {
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    ForbiddenError,
    OrganizationMemberRole,
    SpaceMemberRole,
    type ContentAsCodeDirectAccess,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const ORG_UUID = 'org-uuid';
const PROJECT_UUID = 'project-uuid';

// fromSession needs a fully-formed session user to build the account.
const user = {
    userUuid: 'uploader-uuid',
    email: 'uploader@acme.com',
    firstName: 'Uploader',
    lastName: 'User',
    organizationUuid: ORG_UUID,
    organizationName: 'Acme',
    organizationCreatedAt: new Date('2026-01-01'),
    role: OrganizationMemberRole.ADMIN,
    isActive: true,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 1,
    ability: new Ability(),
    abilityRules: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
} as unknown as SessionUser;

type Setup = {
    members?: { userUuid: string; email: string }[];
    groups?: { uuid: string; name: string }[];
    gateError?: Error;
};

const buildService = ({ members = [], groups = [], gateError }: Setup = {}) => {
    const assertEnabled = vi.fn(async () => {
        if (gateError) throw gateError;
    });
    const replacePolicy = vi.fn(async () => {});
    const service = new CoderService({
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
                data: groups.filter((group) => group.name === name),
            })),
        } as never,
        organizationMemberProfileModel: {
            findOrganizationMembersByEmails: vi.fn(async () => members),
        } as never,
        userModel: {} as never,
        directAccessService: { assertEnabled, replacePolicy } as never,
    });
    return { service, assertEnabled, replacePolicy };
};

const prepare = (
    service: CoderService,
    access: ContentAsCodeDirectAccess | undefined,
) =>
    service.prepareDirectAccessReplace({
        user,
        organizationUuid: ORG_UUID,
        access,
        contentLabel: 'Chart my-chart',
    });

describe('CoderService.prepareDirectAccessReplace', () => {
    it('returns null for an absent block without touching the feature gate', async () => {
        const { service, assertEnabled } = buildService();

        await expect(prepare(service, undefined)).resolves.toBeNull();
        expect(assertEnabled).not.toHaveBeenCalled();
    });

    it('resolves portable principals to refs with roles preserved', async () => {
        const { service } = buildService({
            members: [{ userUuid: 'user-1', email: 'vera@acme.com' }],
            groups: [{ uuid: 'group-1', name: 'Analysts' }],
        });

        await expect(
            prepare(service, {
                users: [
                    { email: 'Vera@Acme.com', role: SpaceMemberRole.EDITOR },
                ],
                groups: [{ name: 'Analysts', role: SpaceMemberRole.VIEWER }],
            }),
        ).resolves.toEqual([
            {
                principal: {
                    type: DirectAccessPrincipalType.USER,
                    uuid: 'user-1',
                },
                role: SpaceMemberRole.EDITOR,
            },
            {
                principal: {
                    type: DirectAccessPrincipalType.GROUP,
                    uuid: 'group-1',
                },
                role: SpaceMemberRole.VIEWER,
            },
        ]);
    });

    it('returns an empty policy for an empty block (clear semantics)', async () => {
        const { service } = buildService();

        await expect(
            prepare(service, { users: [], groups: [] }),
        ).resolves.toEqual([]);
    });

    it('fails closed before resolution when the feature gate rejects', async () => {
        const gateError = new ForbiddenError('Direct access is not available');
        const { service } = buildService({ gateError });

        await expect(
            prepare(service, { users: [], groups: [] }),
        ).rejects.toThrow(gateError);
    });

    it('rejects unknown and ambiguous users without partial results', async () => {
        const missing = buildService({ members: [] });
        await expect(
            prepare(missing.service, {
                users: [
                    { email: 'ghost@acme.com', role: SpaceMemberRole.VIEWER },
                ],
                groups: [],
            }),
        ).rejects.toThrow(
            'Chart my-chart access user ghost@acme.com is not a member of this organization',
        );

        const ambiguous = buildService({
            members: [
                { userUuid: 'user-1', email: 'vera@acme.com' },
                { userUuid: 'user-2', email: 'vera@acme.com' },
            ],
        });
        await expect(
            prepare(ambiguous.service, {
                users: [
                    { email: 'vera@acme.com', role: SpaceMemberRole.VIEWER },
                ],
                groups: [],
            }),
        ).rejects.toThrow('is ambiguous in this organization');
    });

    it('rejects unknown and ambiguous groups', async () => {
        const missing = buildService({ groups: [] });
        await expect(
            prepare(missing.service, {
                users: [],
                groups: [{ name: 'Ghosts', role: SpaceMemberRole.VIEWER }],
            }),
        ).rejects.toThrow(
            'Chart my-chart access group Ghosts does not exist in this organization',
        );

        const ambiguous = buildService({
            groups: [
                { uuid: 'group-1', name: 'Analysts' },
                { uuid: 'group-2', name: 'Analysts' },
            ],
        });
        await expect(
            prepare(ambiguous.service, {
                users: [],
                groups: [{ name: 'Analysts', role: SpaceMemberRole.VIEWER }],
            }),
        ).rejects.toThrow('is ambiguous in this organization');
    });

    it('rejects duplicate principals and invalid roles', async () => {
        const { service } = buildService({
            members: [{ userUuid: 'user-1', email: 'vera@acme.com' }],
        });

        await expect(
            prepare(service, {
                users: [
                    { email: 'vera@acme.com', role: SpaceMemberRole.VIEWER },
                    { email: 'VERA@acme.com', role: SpaceMemberRole.EDITOR },
                ],
                groups: [],
            }),
        ).rejects.toThrow('contains duplicate user emails');

        await expect(
            prepare(service, {
                users: [],
                groups: [
                    { name: 'Analysts', role: SpaceMemberRole.VIEWER },
                    { name: 'Analysts', role: SpaceMemberRole.EDITOR },
                ],
            }),
        ).rejects.toThrow('contains duplicate group names');

        await expect(
            prepare(service, {
                users: [
                    {
                        email: 'vera@acme.com',
                        role: 'owner' as SpaceMemberRole,
                    },
                ],
                groups: [],
            }),
        ).rejects.toThrow('has an invalid role');
        await expect(
            prepare(service, {
                users: [],
                groups: [
                    { name: 'Analysts', role: 'owner' as SpaceMemberRole },
                ],
            }),
        ).rejects.toThrow('has an invalid role');
    });
});

describe('CoderService.applyDirectAccessPolicy', () => {
    it('is a no-op for a null plan', async () => {
        const { service, replacePolicy } = buildService();

        await service.applyDirectAccessPolicy(
            user,
            PROJECT_UUID,
            DirectAccessResourceType.CHART,
            'chart-uuid',
            null,
        );

        expect(replacePolicy).not.toHaveBeenCalled();
    });

    it('replaces the policy through the direct access service', async () => {
        const { service, replacePolicy } = buildService();
        const assignments = [
            {
                principal: {
                    type: DirectAccessPrincipalType.USER,
                    uuid: 'user-1',
                },
                role: SpaceMemberRole.VIEWER,
            },
        ];

        await service.applyDirectAccessPolicy(
            user,
            PROJECT_UUID,
            DirectAccessResourceType.DASHBOARD,
            'dashboard-uuid',
            assignments,
        );

        expect(replacePolicy).toHaveBeenCalledWith(
            expect.objectContaining({
                user: expect.objectContaining({ userUuid: 'uploader-uuid' }),
            }),
            PROJECT_UUID,
            DirectAccessResourceType.DASHBOARD,
            'dashboard-uuid',
            assignments,
        );
    });
});
