import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    LinearConnectError,
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
    LinearTokenRequestError,
    refreshLinearToken,
} from '../../clients/linear/Linear';
import { LinearAppService } from './LinearAppService';

vi.mock('../../clients/linear/Linear', async (importOriginal) => ({
    LinearTokenRequestError: (
        await importOriginal<typeof import('../../clients/linear/Linear')>()
    ).LinearTokenRequestError,
    createLinearIssue: vi.fn(),
    exchangeLinearCodeForToken: vi.fn(),
    getLinearAuthorizationUrl: vi.fn(),
    getLinearOrganization: vi.fn(),
    getLinearProjects: vi.fn(),
    getLinearTeams: vi.fn(),
    linkLinearIssueUrl: vi.fn(),
    refreshLinearToken: vi.fn(),
}));

const ENCRYPTED_SECRET = Buffer.from('enc:secret-1').toString('base64');
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
            clientSecret: 'secret-1',
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
    const encryptionUtil = {
        encrypt: (value: string) => Buffer.from(`enc:${value}`),
        decrypt: (value: Buffer) => value.toString().replace(/^enc:/, ''),
    };
    const service = new LinearAppService({
        linearAppInstallationsModel,
        encryptionUtil,
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

    it('starts app-actor OAuth and keeps the client secret encrypted in the session', async () => {
        const { service, analytics } = makeService();

        const context = await service.installRedirect(makeUser(true), {
            clientId: ' client-1 ',
            clientSecret: ' secret-1 ',
        });

        expect(context.installUrl).toBe(
            'https://linear.app/oauth/authorize?test',
        );
        expect(context.returnToUrl).toBe(
            'https://app.example.com/generalSettings/ai/general',
        );
        expect(context.linear.clientId).toBe('client-1');
        expect(context.linear.encryptedClientSecret).toBe(ENCRYPTED_SECRET);
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
                        encryptedClientSecret: ENCRYPTED_SECRET,
                        codeVerifier: 'verifier-1',
                        redirectUri:
                            'https://app.example.com/api/v1/linear/oauth/callback',
                    },
                },
                { code: 'code-1', state: 'state-1' },
            ),
        ).resolves.toBe('https://app.example.com/generalSettings/ai/general');
        expect(exchangeLinearCodeForToken).toHaveBeenCalledWith(
            'code-1',
            { clientId: 'client-1', clientSecret: 'secret-1' },
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
                clientSecret: 'secret-1',
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

    describe('when the callback fails', () => {
        const oauth = {
            state: 'state-1',
            returnTo: 'https://app.example.com/generalSettings/ai/general',
            linear: {
                clientId: 'client-1',
                encryptedClientSecret: ENCRYPTED_SECRET,
                codeVerifier: 'verifier-1',
                redirectUri:
                    'https://app.example.com/api/v1/linear/oauth/callback',
            },
        };
        const settingsUrlWith = (error: LinearConnectError) =>
            `https://app.example.com/generalSettings/ai/general?linearError=${error}`;

        it('returns to settings with the reason Linear rejected the code', async () => {
            const { service, analytics, linearAppInstallationsModel } =
                makeService();
            vi.mocked(exchangeLinearCodeForToken).mockRejectedValue(
                new LinearTokenRequestError(LinearConnectError.INVALID_CLIENT),
            );

            await expect(
                service.installCallback(makeUser(true), oauth, {
                    code: 'code-1',
                    state: 'state-1',
                }),
            ).resolves.toBe(settingsUrlWith(LinearConnectError.INVALID_CLIENT));
            expect(
                linearAppInstallationsModel.upsertInstallation,
            ).not.toHaveBeenCalled();
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'linear_install.error',
                    properties: expect.objectContaining({
                        error: LinearConnectError.INVALID_CLIENT,
                    }),
                }),
            );
        });

        it.each([
            ['access_denied', LinearConnectError.CANCELLED],
            ['invalid_scope', LinearConnectError.UNKNOWN],
            ['server_error', LinearConnectError.UNKNOWN],
        ])(
            'maps a %s callback without calling Linear and tracks it',
            async (error, reason) => {
                const { service, analytics } = makeService();

                await expect(
                    service.installCallback(makeUser(true), oauth, {
                        state: 'state-1',
                        error,
                    }),
                ).resolves.toBe(settingsUrlWith(reason));
                expect(exchangeLinearCodeForToken).not.toHaveBeenCalled();
                expect(analytics.track).toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'linear_install.error',
                        properties: expect.objectContaining({ error: reason }),
                    }),
                );
            },
        );

        it('reports a callback without a code as unknown', async () => {
            const { service } = makeService();

            await expect(
                service.installCallback(makeUser(true), oauth, {
                    state: 'state-1',
                }),
            ).resolves.toBe(settingsUrlWith(LinearConnectError.UNKNOWN));
        });

        it('reports an expired session when the state does not match', async () => {
            const { service, analytics } = makeService();

            await expect(
                service.installCallback(makeUser(true), oauth, {
                    code: 'code-1',
                    state: 'other-state',
                }),
            ).resolves.toBe(
                settingsUrlWith(LinearConnectError.SESSION_EXPIRED),
            );
            expect(exchangeLinearCodeForToken).not.toHaveBeenCalled();
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({ event: 'linear_install.error' }),
            );
        });

        it('reports an unknown error when a later step fails', async () => {
            const { service } = makeService();
            vi.mocked(exchangeLinearCodeForToken).mockResolvedValue({
                token: 'access-2',
                refreshToken: null,
            });
            vi.mocked(getLinearOrganization).mockRejectedValue(
                new Error('boom'),
            );

            await expect(
                service.installCallback(makeUser(true), oauth, {
                    code: 'code-1',
                    state: 'state-1',
                }),
            ).resolves.toBe(settingsUrlWith(LinearConnectError.UNKNOWN));
        });
    });

    it.each([
        ['client ID', { clientId: '   ', clientSecret: 'secret-1' }],
        ['client secret', { clientId: 'client-1', clientSecret: '   ' }],
    ])('rejects an empty OAuth %s', async (_label, credentials) => {
        const { service, linearAppInstallationsModel } = makeService();

        await expect(
            service.installRedirect(makeUser(true), credentials),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(
            linearAppInstallationsModel.upsertInstallation,
        ).not.toHaveBeenCalled();
    });

    it('reconnects with the saved client ID and secret', async () => {
        const { service } = makeService();

        const context = await service.installRedirect(makeUser(true), null);

        expect(context.linear.clientId).toBe('client-1');
        expect(context.linear.encryptedClientSecret).toBe(ENCRYPTED_SECRET);
    });

    it('asks for credentials when reconnecting an install saved without a secret', async () => {
        const { service, linearAppInstallationsModel } = makeService();
        linearAppInstallationsModel.getAuth.mockResolvedValue({
            token: 'access-1',
            refreshToken: 'refresh-1',
            clientId: 'client-1',
            clientSecret: null,
        });

        await expect(
            service.installRedirect(makeUser(true), null),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it('refreshes an expired OAuth token using the stored client credentials', async () => {
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
            'secret-1',
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
