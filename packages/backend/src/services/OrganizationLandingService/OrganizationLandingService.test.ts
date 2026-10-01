import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    OrganizationJoinRequestStatus,
    OrganizationMemberRole,
    ParameterError,
    type PossibleAbilities,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type DbOrganizationJoinRequest } from '../../database/entities/organizationJoinRequests';
import { buildAccount } from '../ProjectService/ProjectService.mock';
import { OrganizationLandingService } from './OrganizationLandingService';

const NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

const user = {
    userUuid: 'user-uuid',
    email: 'ada@acme.com',
    organizationUuid: undefined,
} as unknown as SessionUser;

const memberOf = (organizationUuid: string) =>
    ({
        ...user,
        organizationUuid,
        organizationName: 'Elsewhere',
        organizationCreatedAt: NOW,
        role: OrganizationMemberRole.VIEWER,
    }) as unknown as SessionUser;

const requestRow = (
    overrides: Partial<DbOrganizationJoinRequest> = {},
): DbOrganizationJoinRequest => ({
    join_request_uuid: 'request-uuid',
    organization_uuid: 'private-org',
    user_uuid: user.userUuid,
    status: OrganizationJoinRequestStatus.PENDING,
    created_at: NOW,
    expires_at: new Date(NOW.getTime() + 14 * DAY_MS),
    decided_at: null,
    decided_by_user_uuid: null,
    ...overrides,
});

const buildService = ({
    enabled = true,
    allowMultiOrgs = true,
    isVerified = true,
    email = 'ada@acme.com',
    smtp = false,
    memberDomainOrgs = [
        { organizationUuid: 'private-org', name: 'Acme', hasAdmin: true },
    ],
    latestRequests = [] as DbOrganizationJoinRequest[],
    createdInLastDay = 0,
    requester = { ...user } as SessionUser,
}: {
    enabled?: boolean;
    allowMultiOrgs?: boolean;
    isVerified?: boolean;
    email?: string;
    smtp?: boolean;
    memberDomainOrgs?: {
        organizationUuid: string;
        name: string;
        hasAdmin: boolean;
    }[];
    latestRequests?: DbOrganizationJoinRequest[];
    createdInLastDay?: number;
    requester?: SessionUser;
} = {}) => {
    const mocks = {
        create: vi.fn(async ({ expiresAt }: { expiresAt: Date }) =>
            requestRow({ expires_at: expiresAt }),
        ),
        decide: vi.fn(async () => undefined),
        joinOrg: vi.fn(async () => undefined),
        sendGenericNotificationEmail: vi.fn(async () => undefined),
        get: vi.fn(async () => requestRow()),
        getOrganizationsWithMemberDomain: vi.fn(async () => memberDomainOrgs),
        track: vi.fn(),
    };
    const service = new OrganizationLandingService({
        lightdashConfig: {
            allowMultiOrgs,
            smtp: smtp ? ({} as never) : undefined,
            siteUrl: 'https://lightdash.example.com',
        },
        analytics: { track: mocks.track },
        featureFlagModel: {
            get: vi.fn(async () => ({
                id: FeatureFlags.ConnectJourney,
                enabled,
            })),
        },
        emailModel: {
            getPrimaryEmailStatus: vi.fn(async () => ({
                email,
                isVerified,
                otp: undefined,
            })),
        },
        organizationModel: {
            get: vi.fn(async () => ({
                organizationUuid: 'private-org',
                name: 'Acme',
            })),
            hasOrgs: vi.fn(async () => true),
            getAllowedOrgsForDomain: vi.fn(async () => []),
            getOrganizationsWithMemberDomain:
                mocks.getOrganizationsWithMemberDomain,
            getAllOrganizationsWithAdminFlag: vi.fn(async () => [
                { organizationUuid: 'only-org', name: 'Only', hasAdmin: true },
            ]),
        },
        organizationJoinRequestModel: {
            create: mocks.create,
            findLatestForUser: vi.fn(async () => latestRequests),
            countCreatedSince: vi.fn(async () => createdInLastDay),
            expirePendingForUser: vi.fn(async () => undefined),
            get: mocks.get,
            listOpenForOrganization: vi.fn(async () => []),
            decide: mocks.decide,
        },
        organizationMemberProfileModel: {
            getOrganizationAdmins: vi.fn(async () => [
                { email: 'admin@acme.com', isActive: true },
            ]),
        } as never,
        userModel: {
            findSessionUserByUUID: vi.fn(async () => requester),
            joinOrg: mocks.joinOrg,
            invalidateSessionUserCache: vi.fn(),
        } as never,
        emailClient: {
            sendGenericNotificationEmail: mocks.sendGenericNotificationEmail,
        } as never,
    });
    return { service, mocks };
};

const buildAdmin = (canManage = true): RegisteredAccount => {
    const account = buildAccount() as RegisteredAccount;
    return {
        ...account,
        user: {
            ...account.user,
            ability: new Ability<PossibleAbilities>(
                canManage
                    ? [
                          {
                              subject: 'OrganizationMemberProfile',
                              action: 'manage',
                          },
                      ]
                    : [],
            ),
        },
        organization: {
            ...account.organization,
            organizationUuid: 'private-org',
        },
    } as RegisteredAccount;
};

describe('OrganizationLandingService.getLanding', () => {
    it('is refused when the flag is off', async () => {
        await expect(
            buildService({ enabled: false }).service.getLanding(user),
        ).rejects.toThrow(ForbiddenError);
    });

    it('is refused for a user who already has an organization', async () => {
        await expect(
            buildService().service.getLanding(memberOf('org')),
        ).rejects.toThrow('User already has an organization');
    });

    it('offers a private organization on the same domain with its name', async () => {
        const landing = await buildService().service.getLanding(user);
        expect(landing.canCreateOrganization).toBe(true);
        expect(landing.requestable).toEqual([
            {
                organizationUuid: 'private-org',
                name: 'Acme',
                hasAdmin: true,
                joinRequest: null,
            },
        ]);
    });

    it('never looks up the domain for an unverified email', async () => {
        const { service, mocks } = buildService({ isVerified: false });
        const landing = await service.getLanding(user);
        expect(landing.requestable).toEqual([]);
        expect(mocks.getOrganizationsWithMemberDomain).not.toHaveBeenCalled();
    });

    it('never matches a public email provider domain', async () => {
        const { service, mocks } = buildService({ email: 'ada@gmail.com' });
        const landing = await service.getLanding(user);
        expect(landing.requestable).toEqual([]);
        expect(mocks.getOrganizationsWithMemberDomain).not.toHaveBeenCalled();
    });

    it('offers the existing organization on a single-org instance instead of refusing', async () => {
        const landing = await buildService({
            allowMultiOrgs: false,
            isVerified: false,
        }).service.getLanding(user);
        expect(landing.canCreateOrganization).toBe(false);
        expect(landing.requestable.map((m) => m.organizationUuid)).toEqual([
            'only-org',
        ]);
    });

    it('reads a pending request past its expiry as expired', async () => {
        const landing = await buildService({
            latestRequests: [
                requestRow({ expires_at: new Date(NOW.getTime() - 1000) }),
            ],
        }).service.getLanding(user);
        expect(landing.requestable[0].joinRequest?.status).toBe(
            OrganizationJoinRequestStatus.EXPIRED,
        );
    });
});

describe('OrganizationLandingService.requestToJoin', () => {
    it('refuses an organization that is not offered to the user', async () => {
        await expect(
            buildService().service.requestToJoin(user, 'other-org'),
        ).rejects.toThrow('You cannot request to join this organization');
    });

    it('returns the open request instead of creating a second one', async () => {
        const { service, mocks } = buildService({
            latestRequests: [requestRow()],
        });
        const summary = await service.requestToJoin(user, 'private-org');
        expect(summary.joinRequestUuid).toBe('request-uuid');
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('refuses at the daily limit', async () => {
        const { service, mocks } = buildService({ createdInLastDay: 5 });
        await expect(
            service.requestToJoin(user, 'private-org'),
        ).rejects.toThrow('too many requests');
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('creates a request that expires in 14 days and emails the admins', async () => {
        const { service, mocks } = buildService({ smtp: true });
        const summary = await service.requestToJoin(user, 'private-org');
        expect(summary.status).toBe(OrganizationJoinRequestStatus.PENDING);
        const { expiresAt } = mocks.create.mock.calls[0][0];
        expect(Math.round((expiresAt.getTime() - Date.now()) / DAY_MS)).toBe(
            14,
        );
        expect(mocks.sendGenericNotificationEmail).toHaveBeenCalledWith(
            ['admin@acme.com'],
            'Request to join Acme',
            expect.any(String),
            expect.stringContaining('ada@acme.com'),
        );
    });

    it('sends no email without an email server', async () => {
        const { service, mocks } = buildService();
        await service.requestToJoin(user, 'private-org');
        expect(mocks.sendGenericNotificationEmail).not.toHaveBeenCalled();
    });
});

describe('OrganizationLandingService decisions', () => {
    it('needs permission to manage members', async () => {
        await expect(
            buildService().service.listJoinRequests(buildAdmin(false)),
        ).rejects.toThrow(ForbiddenError);
    });

    it("hides another organization's request", async () => {
        const { service, mocks } = buildService();
        mocks.get.mockResolvedValueOnce(
            requestRow({ organization_uuid: 'other-org' }),
        );
        await expect(
            service.approveJoinRequest(
                buildAdmin(),
                'request-uuid',
                OrganizationMemberRole.VIEWER,
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('refuses an expired request', async () => {
        const { service, mocks } = buildService();
        mocks.get.mockResolvedValueOnce(
            requestRow({ expires_at: new Date(NOW.getTime() - 1000) }),
        );
        await expect(
            service.approveJoinRequest(
                buildAdmin(),
                'request-uuid',
                OrganizationMemberRole.VIEWER,
            ),
        ).rejects.toThrow(ParameterError);
    });

    it('refuses when the person joined another organization meanwhile', async () => {
        const { service, mocks } = buildService({
            requester: memberOf('elsewhere'),
        });
        await expect(
            service.approveJoinRequest(
                buildAdmin(),
                'request-uuid',
                OrganizationMemberRole.VIEWER,
            ),
        ).rejects.toThrow('already belongs to an organization');
        expect(mocks.joinOrg).not.toHaveBeenCalled();
    });

    it('adds the person with the chosen role and records the approval', async () => {
        const { service, mocks } = buildService();
        await service.approveJoinRequest(
            buildAdmin(),
            'request-uuid',
            OrganizationMemberRole.EDITOR,
        );
        expect(mocks.joinOrg).toHaveBeenCalledWith(
            user.userUuid,
            'private-org',
            OrganizationMemberRole.EDITOR,
            undefined,
        );
        expect(mocks.decide).toHaveBeenCalledWith(
            'request-uuid',
            OrganizationJoinRequestStatus.APPROVED,
            expect.any(String),
        );
    });

    it('records a decline without adding the person', async () => {
        const { service, mocks } = buildService();
        await service.declineJoinRequest(buildAdmin(), 'request-uuid');
        expect(mocks.joinOrg).not.toHaveBeenCalled();
        expect(mocks.decide).toHaveBeenCalledWith(
            'request-uuid',
            OrganizationJoinRequestStatus.DECLINED,
            expect.any(String),
        );
    });
});
