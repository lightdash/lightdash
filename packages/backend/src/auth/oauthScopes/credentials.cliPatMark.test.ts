import { Ability } from '@casl/ability';
import {
    Account,
    AuthTokenPrefix,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    RequestMethod,
    SessionUser,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ServiceAccountService } from '../../ee/services/ServiceAccountService/ServiceAccountService';
import Logger from '../../logging/logger';
import { LearnSandboxService } from '../../services/LearnSandboxService/LearnSandboxService';
import { OAuthService } from '../../services/OAuthService/OAuthService';
import { PersonalAccessTokenService } from '../../services/PersonalAccessTokenService';
import {
    fromApiKey,
    fromOauth,
    fromSession,
    toSessionUser,
} from '../account/account';
import { defaultSessionUser } from '../account/account.mock';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const NOW = new Date('2026-12-01T12:00:00Z');
const TEN_YEARS = new Date(NOW.getTime() + 3650 * DAY_MS);

const user: SessionUser = {
    ...defaultSessionUser,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
};

const patAccount = (cliOAuthPatCompat: boolean) => {
    const account = fromApiKey(
        { ...user, personalAccessToken: { cliOAuthPatCompat } },
        'ApiKey ldpat_token',
    );
    account.requestContext = { userAgent: 'lightdash-cli/3.87.0' };
    return account;
};

const markedPat = () => patAccount(true);
const normalPat = () => patAccount(false);

const cliOAuthAccount = () => {
    const account = fromOauth(
        user,
        {
            accessToken: 'secret',
            client: { id: 'lightdash-cli' },
            scope: ['read', 'write'],
        },
        {
            mode: 'enforce',
            getRequest: () => ({
                method: 'POST',
                routeTemplate: '/me/personal-access-tokens',
            }),
        },
    );
    account.requestContext = { userAgent: 'lightdash-cli/3.87.0' };
    return account;
};

const build = ({ targetMarked = false } = {}) => {
    const analytics = { track: vi.fn() };
    const patModel = {
        create: vi.fn(async (_user, data) => ({
            uuid: 'pat-uuid',
            token: 'pat-token',
            ...data,
        })),
        getUserToken: vi.fn(async () => ({
            uuid: 'pat-uuid',
            createdAt: NOW,
            lastUsedAt: null,
            rotatedAt: null,
            expiresAt: new Date(NOW.getTime() + HOUR_MS),
            description: 'token',
            cliOAuthPatCompat: targetMarked,
        })),
        rotate: vi.fn(async ({ expiresAt }) => ({
            uuid: 'pat-uuid',
            token: 'rotated',
            expiresAt,
        })),
    };
    const pat = new PersonalAccessTokenService({
        lightdashConfig: lightdashConfigMock,
        analytics,
        personalAccessTokenModel: patModel,
        featureFlagModel: {
            get: vi.fn(async ({ featureFlagId }) => ({
                id: featureFlagId,
                enabled: false,
            })),
        },
    } as unknown as ConstructorParameters<
        typeof PersonalAccessTokenService
    >[0]);
    const serviceAccountModel = {
        create: vi.fn(async () => ({ uuid: 'sa-uuid', token: 'created' })),
        getTokenbyUuid: vi.fn(async () => ({
            uuid: 'sa-uuid',
            organizationUuid: user.organizationUuid,
            expiresAt: new Date(NOW.getTime() + DAY_MS),
            rotatedAt: null,
        })),
        rotate: vi.fn(async () => ({ uuid: 'sa-uuid', token: 'rotated' })),
    };
    const serviceAccount = new ServiceAccountService({
        lightdashConfig: lightdashConfigMock,
        analytics,
        serviceAccountModel,
        rolesModel: {
            getOrganizationUserRoleSet: vi.fn(async () => ({
                systemRole: OrganizationMemberRole.ADMIN,
                customRoleUuids: [],
            })),
        },
    } as unknown as ConstructorParameters<typeof ServiceAccountService>[0]);
    const oauthModel = {
        isSecurityStrict: vi.fn(async () => false),
        createClient: vi.fn(async () => ({ clientId: 'client' })),
        updateClient: vi.fn().mockRejectedValue(new Error('Mutation reached')),
        deleteClient: vi.fn().mockRejectedValue(new Error('Mutation reached')),
    };
    const oauth = new OAuthService({
        lightdashConfig: lightdashConfigMock,
        oauthModel,
    } as unknown as ConstructorParameters<typeof OAuthService>[0]);
    const learnWrite = vi.fn().mockRejectedValue(new Error('Mutation reached'));
    const learn = new LearnSandboxService({
        lightdashConfig: lightdashConfigMock,
        projectModel: { getSummary: learnWrite },
        learnWorkspaceModel: { createCommand: learnWrite },
        schedulerClient: { learnSandboxCommand: learnWrite },
    } as unknown as ConstructorParameters<typeof LearnSandboxService>[0]);
    const writes = [
        patModel.create,
        patModel.rotate,
        serviceAccountModel.create,
        serviceAccountModel.rotate,
        oauthModel.createClient,
        oauthModel.updateClient,
        oauthModel.deleteClient,
        learnWrite,
    ];
    return {
        pat,
        patModel,
        serviceAccount,
        serviceAccountModel,
        oauth,
        learn,
        writes,
    };
};

type Services = ReturnType<typeof build>;

const createPat = (services: Services, account: Account, expiresAt: Date) =>
    services.pat.createPersonalAccessToken(
        account,
        { expiresAt, description: 'token', autoGenerated: false },
        RequestMethod.UNKNOWN,
    );

const rotatePat = (services: Services, account: Account) =>
    services.pat.rotatePersonalAccessToken(account, 'pat-uuid', {
        expiresAt: TEN_YEARS,
    });

const serviceAccountDetails = {
    organizationUuid: user.organizationUuid!,
    description: 'token',
    expiresAt: TEN_YEARS,
    scopes: [],
};

const operations = {
    enqueueLearnSandboxCommand: (s: Services, a: Account) =>
        s.learn.enqueueCommand(
            toSessionUser(a as ReturnType<typeof fromApiKey>),
            'project',
            { tool: 'dbt', subcommand: 'parse', args: [] },
        ),
    createPersonalAccessToken: (s: Services, a: Account) =>
        createPat(s, a, TEN_YEARS),
    rotatePersonalAccessToken: rotatePat,
    createServiceAccount: (s: Services, a: Account) =>
        s.serviceAccount.create({
            user: toSessionUser(a as ReturnType<typeof fromApiKey>),
            tokenDetails: serviceAccountDetails,
            prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
        }),
    rotateServiceAccount: (s: Services, a: Account) =>
        s.serviceAccount.rotate({
            user: toSessionUser(a as ReturnType<typeof fromApiKey>),
            tokenUuid: 'sa-uuid',
            update: { expiresAt: TEN_YEARS },
            prefix: AuthTokenPrefix.SERVICE_ACCOUNT,
        }),
    createScimToken: (s: Services, a: Account) =>
        s.serviceAccount.create({
            user: toSessionUser(a as ReturnType<typeof fromApiKey>),
            tokenDetails: serviceAccountDetails,
            prefix: AuthTokenPrefix.SCIM,
        }),
    rotateScimToken: (s: Services, a: Account) =>
        s.serviceAccount.rotate({
            user: toSessionUser(a as ReturnType<typeof fromApiKey>),
            tokenUuid: 'sa-uuid',
            update: { expiresAt: TEN_YEARS },
            prefix: AuthTokenPrefix.SCIM,
        }),
    createOAuthClient: (s: Services, a: Account) =>
        s.oauth.createAdminClient(a, {
            clientName: 'client',
            redirectUris: ['https://example.test/callback'],
        }),
    updateOAuthClient: (s: Services, a: Account) =>
        s.oauth.updateClient(a, 'client', {
            clientName: 'client',
            redirectUris: ['https://example.test/callback'],
        }),
    deleteOAuthClient: (s: Services, a: Account) =>
        s.oauth.deleteClient(a, 'client'),
} as const;

const expectRefusalLog = (operation: string, markedToken: 'actor' | 'target') =>
    expect(Logger.warn).toHaveBeenCalledExactlyOnceWith(
        'oauth_cli_pat_credential_refused',
        {
            operation,
            markedToken,
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
            cliVersion: '3.87.0',
        },
    );

describe('personal access token created by CLI browser login', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
        vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    describe('creation', () => {
        it('marks a token created through the CLI exception', async () => {
            const services = build();
            await createPat(services, cliOAuthAccount(), TEN_YEARS);
            expect(services.patModel.create).toHaveBeenCalledExactlyOnceWith(
                { userId: user.userId },
                expect.objectContaining({ description: 'token' }),
                { cliOAuthPatCompat: true },
            );
        });

        it.each([
            ['a session', () => fromSession(user, 'cookie')],
            ['a normal personal access token', normalPat],
        ])('does not mark a token created with %s', async (_name, account) => {
            const services = build();
            await createPat(services, account(), TEN_YEARS);
            expect(services.patModel.create).toHaveBeenCalledExactlyOnceWith(
                { userId: user.userId },
                expect.objectContaining({ expiresAt: TEN_YEARS }),
                { cliOAuthPatCompat: false },
            );
        });
    });

    describe('rotation', () => {
        it('refuses a marked token that authenticates as itself', async () => {
            const services = build({ targetMarked: true });
            await expect(
                rotatePat(services, markedPat()),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(services.patModel.rotate).not.toHaveBeenCalled();
            expectRefusalLog('rotatePersonalAccessToken', 'actor');
        });

        it.each([
            ['a session', () => fromSession(user, 'cookie')],
            ['a normal personal access token', normalPat],
        ])('refuses a marked token rotated with %s', async (_name, account) => {
            const services = build({ targetMarked: true });
            const actor = account();
            actor.requestContext = { userAgent: 'lightdash-cli/3.87.0' };
            await expect(rotatePat(services, actor)).rejects.toThrow(
                new ForbiddenError(
                    'Personal access tokens created by CLI browser login cannot be rotated',
                ),
            );
            expect(services.patModel.getUserToken).toHaveBeenCalledOnce();
            expect(services.patModel.rotate).not.toHaveBeenCalled();
            expectRefusalLog('rotatePersonalAccessToken', 'target');
        });

        it.each([
            ['a session', () => fromSession(user, 'cookie')],
            ['a normal personal access token', normalPat],
        ])('rotates a normal token with %s', async (_name, account) => {
            const services = build();
            await expect(rotatePat(services, account())).resolves.toMatchObject(
                { token: 'rotated' },
            );
            expect(services.patModel.rotate).toHaveBeenCalledExactlyOnceWith({
                personalAccessTokenUuid: 'pat-uuid',
                expiresAt: TEN_YEARS,
            });
            expect(Logger.warn).not.toHaveBeenCalled();
        });
    });

    describe('marked token as the actor', () => {
        it.each(Object.keys(operations) as (keyof typeof operations)[])(
            'refuses %s',
            async (operation) => {
                const services = build();
                await expect(
                    operations[operation](services, markedPat()),
                ).rejects.toThrow(
                    new ForbiddenError(
                        'Personal access tokens created by CLI browser login cannot manage credentials',
                    ),
                );
                services.writes.forEach((write) =>
                    expect(write).not.toHaveBeenCalled(),
                );
                expect(
                    services.serviceAccountModel.getTokenbyUuid,
                ).not.toHaveBeenCalled();
                expect(services.patModel.getUserToken).not.toHaveBeenCalled();
                expectRefusalLog(operation, 'actor');
            },
        );

        it('keeps the mark after conversion to a session user', () => {
            expect(toSessionUser(markedPat()).personalAccessToken).toEqual({
                cliOAuthPatCompat: true,
            });
            expect(toSessionUser(normalPat()).personalAccessToken).toEqual({
                cliOAuthPatCompat: false,
            });
            expect(
                toSessionUser(fromSession(user, 'cookie')).personalAccessToken,
            ).toBeUndefined();
        });
    });

    describe('normal token as an admin', () => {
        it.each([
            ['rotateServiceAccount', 'ldsvc_'],
            ['rotateScimToken', 'scim_'],
        ] as const)('allows %s', async (operation, prefix) => {
            const services = build();
            await expect(
                operations[operation](services, normalPat()),
            ).resolves.toMatchObject({ token: 'rotated' });
            expect(
                services.serviceAccountModel.rotate,
            ).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    serviceAccountUuid: 'sa-uuid',
                    prefix,
                }),
            );
            expect(Logger.warn).not.toHaveBeenCalled();
        });

        it.each([
            ['createServiceAccount', 'ldsvc_'],
            ['createScimToken', 'scim_'],
        ] as const)('allows %s', async (operation, prefix) => {
            const services = build();
            await expect(
                operations[operation](services, normalPat()),
            ).resolves.toMatchObject({ token: 'created' });
            expect(
                services.serviceAccountModel.create,
            ).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({ prefix }),
            );
            expect(Logger.warn).not.toHaveBeenCalled();
        });

        it('allows createOAuthClient', async () => {
            const services = build();
            await expect(
                operations.createOAuthClient(services, normalPat()),
            ).resolves.toEqual({ clientId: 'client' });
            expect(Logger.warn).not.toHaveBeenCalled();
        });
    });
});
