import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common'; // pragma: allowlist secret
import { LinearAppService } from './LinearAppService';

const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-08-25T00:00:00.000Z');

const makeUser = (canManageOrg: boolean): SessionUser =>
    ({
        userUuid: 'user-1',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        organizationUuid: ORGANIZATION_UUID,
        organizationName: 'Acme',
        organizationCreatedAt: NOW,
        userId: 1,
        role: canManageOrg
            ? OrganizationMemberRole.ADMIN
            : OrganizationMemberRole.MEMBER,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        avatarUrl: null,
        avatarGradient: null,
        isSetupComplete: true,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        timezone: null,
        ability: new Ability<PossibleAbilities>(
            canManageOrg
                ? [{ action: 'manage', subject: 'Organization' }]
                : [{ action: 'view', subject: 'Organization' }],
        ),
        abilityRules: [],
    }) as SessionUser;

const makeService = () => {
    const linearAppInstallationsModel = {
        findInstallation: vi.fn().mockResolvedValue(undefined),
        getInstallation: vi.fn(),
        deleteInstallation: vi.fn().mockResolvedValue(undefined),
    };
    const userModel = {
        findSessionUserByUUID: vi.fn(),
    };
    const analytics = {
        track: vi.fn(),
    };
    const service = new LinearAppService({
        linearAppInstallationsModel,
        userModel,
        lightdashConfig: {
            // pragma: allowlist secret
            siteUrl: 'https://app.example.com',
            linear: {
                clientId: 'client-1',
                clientSecret: 'secret-1',
                redirectDomain: 'app',
            },
        },
        analytics,
    } as unknown as ConstructorParameters<typeof LinearAppService>[0]);

    return { service, linearAppInstallationsModel, analytics };
};

describe('LinearAppService', () => {
    it('forbids members who cannot manage the organization', async () => {
        const { service } = makeService();

        await expect(
            service.getInstallation(makeUser(false)),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('tracks uninstall when an admin removes Linear', async () => {
        const { service, linearAppInstallationsModel, analytics } =
            makeService();

        await service.deleteAppInstallation(makeUser(true));

        expect(
            linearAppInstallationsModel.deleteInstallation,
        ).toHaveBeenCalledWith(ORGANIZATION_UUID);
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'linear_install.uninstalled',
            }),
        );
    });
});
