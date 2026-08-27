import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common'; // pragma: allowlist secret
import {
    exchangeLinearCodeForToken,
    getLinearAuthorizationUrl,
    getLinearOrganization,
    getLinearTeams,
    refreshLinearToken,
} from '../../clients/linear/Linear';
import { LinearAppService } from './LinearAppService';

vi.mock('../../clients/linear/Linear', () => ({
    createLinearIssue: vi.fn(),
    exchangeLinearCodeForToken: vi.fn(),
    getLinearAuthorizationUrl: vi.fn(),
    getLinearOrganization: vi.fn(),
    getLinearProjects: vi.fn(),
    getLinearTeams: vi.fn(),
    refreshLinearToken: vi.fn(),
}));

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
    const transaction = {};
    const linearAppInstallationsModel = {
        transaction: vi
            .fn()
            .mockImplementation((callback) => callback(transaction)),
        findInstallation: vi.fn().mockResolvedValue(undefined),
        getInstallation: vi.fn(),
        getAuth: vi.fn().mockResolvedValue({
            token: 'access-1',
            refreshToken: 'refresh-1',
            clientId: 'client-1',
        }),
        upsertInstallation: vi.fn().mockResolvedValue(undefined),
        updateAuth: vi.fn().mockResolvedValue(undefined),
        deleteInstallation: vi.fn().mockResolvedValue(undefined),
    };
    const analytics = {
        track: vi.fn(),
    };
    const onWorkspaceChanged = vi.fn().mockResolvedValue(undefined);
    const onInstallationDeleted = vi.fn().mockResolvedValue(undefined);
    const service = new LinearAppService({
        linearAppInstallationsModel,
        lightdashConfig: {
            siteUrl: 'https://app.example.com',
        },
        analytics,
        onWorkspaceChanged,
        onInstallationDeleted,
    } as unknown as ConstructorParameters<typeof LinearAppService>[0]);

    return {
        service,
        linearAppInstallationsModel,
        analytics,
        onWorkspaceChanged,
        onInstallationDeleted,
        transaction,
    };
};

describe('LinearAppService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getLinearAuthorizationUrl).mockReturnValue(
            'https://linear.app/oauth/authorize?test',
        );
    });

    it('forbids members who cannot manage the organization', async () => {
        const { service } = makeService();

        await expect(
            service.getInstallation(makeUser(false)),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('starts app-actor OAuth with PKCE and no client secret', async () => {
        const { service, analytics } = makeService();

        const context = await service.installRedirect(
            makeUser(true),
            ' client-1 ',
        );

        expect(context.installUrl).toBe(
            'https://linear.app/oauth/authorize?test',
        );
        expect(context.returnToUrl).toBe(
            'https://app.example.com/generalSettings/ai/general',
        );
        expect(context.linear.clientId).toBe('client-1');
        expect(context.linear.codeVerifier).toBeTruthy();
        expect(getLinearAuthorizationUrl).toHaveBeenCalledWith(
            'client-1',
            'https://app.example.com/api/v1/linear/oauth/callback',
            context.state,
            expect.any(String),
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'linear_install.started' }),
        );
    });

    it('stores OAuth tokens and client ID for the organization', async () => {
        const {
            service,
            linearAppInstallationsModel,
            analytics,
            onWorkspaceChanged,
            transaction,
        } = makeService();
        vi.mocked(exchangeLinearCodeForToken).mockResolvedValue({
            token: 'access-2',
            refreshToken: 'refresh-2',
        });
        vi.mocked(getLinearOrganization).mockResolvedValue({
            id: 'linear-org-1',
            name: 'Acme Linear',
            urlKey: 'acme',
        });

        await expect(
            service.installCallback(
                makeUser(true),
                {
                    state: 'state-1',
                    returnTo:
                        'https://app.example.com/generalSettings/ai/general',
                    linear: {
                        clientId: 'client-1',
                        codeVerifier: 'verifier-1',
                        redirectUri:
                            'https://app.example.com/api/v1/linear/oauth/callback',
                    },
                },
                'code-1',
                'state-1',
            ),
        ).resolves.toBe('https://app.example.com/generalSettings/ai/general');
        expect(exchangeLinearCodeForToken).toHaveBeenCalledWith(
            'code-1',
            'client-1',
            'https://app.example.com/api/v1/linear/oauth/callback',
            'verifier-1',
        );
        expect(
            linearAppInstallationsModel.upsertInstallation,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ organizationUuid: ORGANIZATION_UUID }),
            {
                installationId: 'linear-org-1',
                token: 'access-2',
                refreshToken: 'refresh-2',
                clientId: 'client-1',
                organizationName: 'Acme Linear',
                organizationUrlKey: 'acme',
            },
            transaction,
        );
        expect(onWorkspaceChanged).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            transaction,
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'linear_install.completed' }),
        );
    });

    it('rejects an empty OAuth client ID', async () => {
        const { service, linearAppInstallationsModel } = makeService();

        await expect(
            service.installRedirect(makeUser(true), '   '),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(
            linearAppInstallationsModel.upsertInstallation,
        ).not.toHaveBeenCalled();
    });

    it('refreshes an expired OAuth token using the stored client ID', async () => {
        const { service, linearAppInstallationsModel } = makeService();
        vi.mocked(getLinearTeams)
            .mockRejectedValueOnce(new ForbiddenError('expired'))
            .mockResolvedValueOnce([]);
        vi.mocked(refreshLinearToken).mockResolvedValue({
            token: 'access-2',
            refreshToken: 'refresh-2',
        });

        await expect(service.getTeams(makeUser(true))).resolves.toEqual([]);
        expect(refreshLinearToken).toHaveBeenCalledWith(
            'refresh-1',
            'client-1',
        );
        expect(linearAppInstallationsModel.updateAuth).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            'access-2',
            'refresh-2',
        );
        expect(getLinearTeams).toHaveBeenLastCalledWith('access-2');
    });

    it('tracks uninstall when an admin removes Linear', async () => {
        const {
            service,
            linearAppInstallationsModel,
            analytics,
            onInstallationDeleted,
            transaction,
        } = makeService();

        await service.deleteAppInstallation(makeUser(true));

        expect(
            linearAppInstallationsModel.deleteInstallation,
        ).toHaveBeenCalledWith(ORGANIZATION_UUID, transaction);
        expect(onInstallationDeleted).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
            transaction,
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'linear_install.uninstalled',
            }),
        );
    });
});
