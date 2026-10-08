import { Ability } from '@casl/ability';
import {
    AgentIdentityConnectEntryPoint as EntryPoint,
    AgentIdentityConnectFailureReason as FailureReason,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request, type Response } from 'express';
import passport from 'passport';
import {
    AuthorizationError,
    InternalOAuthError,
    TokenError,
} from 'passport-oauth2';
import { validate as isUuid, version as uuidVersion } from 'uuid';
import {
    buildAccount,
    defaultSessionUser,
} from '../../auth/account/account.mock';
import { lightdashConfig } from '../../config/lightdashConfig';
import { AiAccessService } from '../../services/AiAccessService/AiAccessService';
import {
    agentConnectCallback,
    authenticateAgentConnect,
    classifyAgentConnectFailure,
    storeAgentConnectAttempt,
} from './agentConnectAnalytics';
import { storeAgentConnectRedirect } from './agentConnectRedirect';
import { isAuthenticated } from './middlewares';
import { requireAgentIdentity } from './requireAgentIdentity';
import * as snowflakeAiStrategyModule from './strategies/snowflakeAiStrategy';
import {
    snowflakeAiPassportStrategy,
    snowflakeAiSessionCheck,
} from './strategies/snowflakeAiStrategy';

vi.mock('../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            siteUrl: 'https://app.example',
            license: { licenseKey: 'test-license' },
            auth: {
                ...lightdashConfigMock.auth,
                snowflakeAi: {
                    account: 'test-account',
                    clientId: 'client',
                    clientSecret: 'secret',
                    authorizationEndpoint:
                        'https://snowflake.example/authorize',
                    tokenEndpoint: 'https://snowflake.example/token',
                    callbackPath: '/oauth/redirect/snowflake-ai',
                },
            },
        },
    };
});

const projectId = '9cf75257-3605-450e-b711-81a2d0fef5e3';
const setup = () => {
    const analytics = { track: vi.fn() };
    const flags = { get: vi.fn(async () => ({ enabled: true })) };
    const projects = {
        getSummary: vi.fn(async () => ({
            organizationUuid: defaultSessionUser.organizationUuid,
        })),
    };
    const service = new AiAccessService({
        analytics,
        featureFlagModel: flags,
        projectModel: projects,
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const upsert = vi.fn<() => Promise<void>>(async () => undefined);
    const req = {
        query: {
            project: projectId,
            entryPoint: EntryPoint.CLI,
            redirect: 'http://localhost:4321/done?x=1',
        },
        session: {},
        account: buildAccount(),
        user: { ...defaultSessionUser },
        services: {
            getAiAccessService: () => service,
            getUserService: () => ({ upsertAiSnowflakeCredential: upsert }),
        },
    } as unknown as Request;
    const start = async () => {
        const next = vi.fn();
        storeAgentConnectRedirect(req, {} as Response, next);
        await storeAgentConnectAttempt(req, {} as Response, next);
        expect(next.mock.calls).toEqual([[], []]);
        return req.session.oauth?.agentConnect!;
    };
    const callback = () =>
        new Promise<string>((resolve, reject) => {
            agentConnectCallback(
                req,
                { redirect: resolve } as unknown as Response,
                reject,
            );
        });
    const authorize = () =>
        new Promise<string>((resolve, reject) => {
            let location = '';
            authenticateAgentConnect(
                req,
                {
                    setHeader: (key: string, value: string) => {
                        if (key === 'Location') location = value;
                    },
                    end: () => resolve(location),
                } as unknown as Response,
                reject,
            );
        });
    return {
        req,
        service,
        analytics,
        flags,
        projects,
        upsert,
        start,
        callback,
        authorize,
    };
};

type TokenClient = {
    getOAuthAccessToken: (
        code: string,
        params: object,
        done: (
            error: { statusCode: number; data: string } | null,
            accessToken: string,
            refreshToken: string,
            params: object,
        ) => void,
    ) => void;
};
const oauth = (
    snowflakeAiPassportStrategy as unknown as { _oauth2: TokenClient }
)._oauth2;

beforeEach(() => {
    passport.use('snowflake-ai', snowflakeAiPassportStrategy!);
    vi.spyOn(oauth, 'getOAuthAccessToken').mockImplementation(
        (_code, _params, done) => {
            done(null, 'access-token', 'refresh-token', {});
        },
    );
    vi.spyOn(snowflakeAiSessionCheck, 'check').mockResolvedValue({
        agentActivated: true,
        currentRole: 'private-role',
        activeRestrictedSessionScopes: 'READ',
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    passport.unuse('snowflake-ai');
    lightdashConfig.license.licenseKey = 'test-license';
    lightdashConfig.auth.snowflakeAi.account = 'test-account';
});

describe('connect start', () => {
    it.each(Object.values(EntryPoint))(
        'stores and tracks %s',
        async (entryPoint) => {
            const { req, analytics, start, flags } = setup();
            req.query.entryPoint = entryPoint;
            const attempt = await start();
            expect(isUuid(attempt.connectAttemptId)).toBe(true);
            expect(uuidVersion(attempt.connectAttemptId)).toBe(4);
            expect(attempt).toEqual({
                connectAttemptId: expect.any(String),
                organizationId: defaultSessionUser.organizationUuid,
                userId: defaultSessionUser.userUuid,
                projectId,
                entryPoint,
            });
            expect(analytics.track).toHaveBeenCalledExactlyOnceWith({
                userId: defaultSessionUser.userUuid,
                event: 'agent_identity.connect_started',
                properties: {
                    ...attempt,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                },
            });
            expect(flags.get).not.toHaveBeenCalled();
        },
    );

    it.each([undefined, 'invalid', ['cli'], { nested: 'cli' }])(
        'normalizes entry point %j',
        async (entryPoint) => {
            const { req, start } = setup();
            req.query.entryPoint = entryPoint;
            expect((await start()).entryPoint).toBe(EntryPoint.UNKNOWN);
        },
    );

    it.each([undefined, 'invalid', ['9cf75257-3605-450e-b711-81a2d0fef5e3']])(
        'ignores malformed project %j',
        async (project) => {
            const { req, start, projects } = setup();
            req.query.project = project;
            expect((await start()).projectId).toBeNull();
            expect(projects.getSummary).not.toHaveBeenCalled();
        },
    );

    it.each(['denied', 'other_org', 'missing', 'no_account'])(
        'ignores inaccessible project: %s',
        async (kind) => {
            const { req, start, projects } = setup();
            if (kind === 'denied')
                req.account!.user.ability = new Ability<PossibleAbilities>([]);
            if (kind === 'other_org')
                projects.getSummary.mockResolvedValue({
                    organizationUuid: 'other-org',
                });
            if (kind === 'missing')
                projects.getSummary.mockRejectedValue(new Error('not found'));
            if (kind === 'no_account') delete req.account;
            expect((await start()).projectId).toBeNull();
        },
    );

    it('preserves redirect and popup fields and creates a fresh attempt per start', async () => {
        const { req, start, analytics } = setup();
        req.query.isPopup = 'true';
        const first = await start();
        const second = await start();
        expect(second.connectAttemptId).not.toBe(first.connectAttemptId);
        expect(req.session.oauth).toEqual({
            agentConnect: second,
            returnTo: 'http://localhost:4321/done?x=1',
            isPopup: true,
        });
        expect(analytics.track).toHaveBeenCalledTimes(2);
    });

    it('still starts OAuth if tracking throws', async () => {
        const { start, authorize, analytics, req } = setup();
        analytics.track.mockImplementation(() => {
            throw new Error('analytics unavailable');
        });
        await start();
        const url = new URL(await authorize());
        expect(url.origin).toBe('https://snowflake.example');
        expect(url.searchParams.get('scope')).toBe('refresh_token');
        expect(url.searchParams.get('state')).toBe(
            req.session['oauth2:snowflake-ai']?.state,
        );
        expect(url.searchParams.has('entryPoint')).toBe(false);
    });
});

describe('connect outcome with real Passport', () => {
    it('connects once after persistence, keeps start attribution, and ignores a replay', async () => {
        const { req, analytics, upsert, start, callback, authorize } = setup();
        const attempt = await start();
        const url = new URL(await authorize());
        let finishSave: () => void = () => {};
        upsert.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishSave = resolve;
                }),
        );
        req.query = {
            code: 'code',
            state: url.searchParams.get('state')!,
            entryPoint: EntryPoint.CHAT_CARD,
            project: 'other-project',
        };
        const outcome = callback();
        await vi.waitFor(() => expect(upsert).toHaveBeenCalledOnce());
        expect(analytics.track).toHaveBeenCalledTimes(1);
        finishSave();
        expect(await outcome).toBe('http://localhost:4321/done?x=1');
        expect(analytics.track).toHaveBeenLastCalledWith({
            userId: defaultSessionUser.userUuid,
            event: 'agent_identity.connected',
            properties: {
                ...attempt,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                failureReason: null,
            },
        });
        expect(req.session.oauth?.agentConnect).toBeUndefined();
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(await callback()).toBe(
            'http://localhost:4321/done?x=1&error=sign_in_failed',
        );
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(upsert).toHaveBeenCalledOnce();
    });

    it.each([
        ['access_denied', FailureReason.ACCESS_DENIED, 'sign_in_failed'],
        ['oauth_error', FailureReason.OAUTH_ERROR, 'sign_in_failed'],
        ['missing_state', FailureReason.STATE_MISMATCH, 'sign_in_failed'],
        ['invalid_state', FailureReason.STATE_MISMATCH, 'sign_in_failed'],
        ['consumed_state', FailureReason.STATE_MISMATCH, 'sign_in_failed'],
        ['token_error', FailureReason.TOKEN_EXCHANGE_FAILED, 'sign_in_failed'],
        [
            'internal_oauth_error',
            FailureReason.TOKEN_EXCHANGE_FAILED,
            'sign_in_failed',
        ],
        [
            'missing_access_token',
            FailureReason.TOKEN_EXCHANGE_FAILED,
            'sign_in_failed',
        ],
        [
            'no_refresh_token',
            FailureReason.NO_REFRESH_TOKEN,
            'no_refresh_token',
        ],
        ['license', FailureReason.LICENSE_REQUIRED, 'license_required'],
        ['organization', FailureReason.ORGANIZATION_REQUIRED, 'sign_in_failed'],
        ['inactive', FailureReason.NOT_AGENT_SESSION, 'not_agent_session'],
        [
            'probe_error',
            FailureReason.SESSION_CHECK_FAILED,
            'not_agent_session',
        ],
        ['configuration', FailureReason.NOT_CONFIGURED, 'not_agent_session'],
        ['save_error', FailureReason.CREDENTIAL_SAVE_FAILED, 'sign_in_failed'],
        ['unknown', FailureReason.SIGN_IN_FAILED, 'sign_in_failed'],
    ])(
        'records %s once with unchanged landing code',
        async (branch, reason, landingCode) => {
            const {
                req,
                analytics,
                flags,
                upsert,
                start,
                callback,
                authorize,
            } = setup();
            const attempt = await start();
            const url = new URL(await authorize());
            req.query = { code: 'code', state: url.searchParams.get('state')! };
            if (branch === 'access_denied' || branch === 'oauth_error')
                req.query = {
                    error:
                        branch === 'access_denied'
                            ? 'access_denied'
                            : 'server_error',
                    error_description: 'private provider text',
                };
            if (branch === 'missing_state') delete req.query.state;
            if (branch === 'invalid_state') req.query.state = 'wrong';
            if (branch === 'consumed_state')
                delete req.session['oauth2:snowflake-ai'];
            if (branch === 'token_error')
                vi.mocked(oauth.getOAuthAccessToken).mockImplementation(
                    (_code, _params, done) =>
                        done(
                            {
                                statusCode: 400,
                                data: '{"error":"invalid_grant","error_description":"private provider text"}',
                            },
                            '',
                            '',
                            {},
                        ),
                );
            if (branch === 'internal_oauth_error')
                vi.mocked(oauth.getOAuthAccessToken).mockImplementation(
                    (_code, _params, done) =>
                        done(
                            { statusCode: 502, data: 'unavailable' },
                            '',
                            '',
                            {},
                        ),
                );
            if (branch === 'missing_access_token')
                vi.mocked(oauth.getOAuthAccessToken).mockImplementation(
                    (_code, _params, done) => done(null, '', 'refresh', {}),
                );
            if (branch === 'no_refresh_token')
                vi.mocked(oauth.getOAuthAccessToken).mockImplementation(
                    (_code, _params, done) => done(null, 'access', '', {}),
                );
            if (branch === 'license') lightdashConfig.license.licenseKey = null;
            if (branch === 'organization')
                req.user!.organizationUuid = undefined;
            if (branch === 'inactive')
                vi.mocked(snowflakeAiSessionCheck.check).mockResolvedValue({
                    agentActivated: false,
                    currentRole: null,
                    activeRestrictedSessionScopes: null,
                });
            if (branch === 'probe_error')
                vi.mocked(snowflakeAiSessionCheck.check).mockRejectedValue(
                    new Error('private probe text'),
                );
            if (branch === 'configuration')
                lightdashConfig.auth.snowflakeAi.account = undefined;
            if (branch === 'save_error')
                upsert.mockRejectedValue(new Error('save failed'));
            if (branch === 'unknown')
                flags.get.mockRejectedValue(new Error('lookup failed'));
            expect(await callback()).toBe(
                `http://localhost:4321/done?x=1&error=${landingCode}`,
            );
            expect(analytics.track).toHaveBeenCalledTimes(2);
            expect(analytics.track).toHaveBeenLastCalledWith({
                userId: defaultSessionUser.userUuid,
                event: 'agent_identity.connect_failed',
                properties: {
                    ...attempt,
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    failureReason: reason,
                },
            });
            expect(req.session.oauth?.agentConnect).toBeUndefined();
            await callback();
            expect(analytics.track).toHaveBeenCalledTimes(2);
        },
    );

    it('emits nothing for an unsolicited callback', async () => {
        const { req, callback, analytics } = setup();
        req.query = { error: 'access_denied' };
        expect(await callback()).toBe(
            'https://app.example/?error=sign_in_failed',
        );
        expect(analytics.track).not.toHaveBeenCalled();
    });

    it.each([true, false])(
        'keeps popup success=%s and clears attribution when tracking throws',
        async (success) => {
            const { req, start, authorize, callback, analytics } = setup();
            req.query.isPopup = 'true';
            await start();
            const url = new URL(await authorize());
            analytics.track.mockImplementation(() => {
                throw new Error('tracking unavailable');
            });
            req.query = success
                ? { code: 'code', state: url.searchParams.get('state')! }
                : { error: 'access_denied' };
            expect(await callback()).toBe(
                `https://app.example/auth/popup/${success ? 'success' : 'failure'}`,
            );
            expect(req.session.oauth?.agentConnect).toBeUndefined();
        },
    );

    it('does not record failure if the flag is disabled during token exchange', async () => {
        const { req, start, authorize, callback, flags, analytics } = setup();
        await start();
        const url = new URL(await authorize());
        req.query = { code: 'code', state: url.searchParams.get('state')! };
        flags.get.mockResolvedValue({ enabled: false });
        expect(await callback()).toBe(
            'http://localhost:4321/done?x=1&error=sign_in_failed',
        );
        expect(analytics.track).toHaveBeenCalledTimes(1);
        expect(req.session.oauth?.agentConnect).toBeUndefined();
    });

    it('records an unconfigured strategy at start without changing the error response', async () => {
        const { req, start, analytics } = setup();
        const attempt = await start();
        passport.unuse('snowflake-ai');
        vi.spyOn(
            snowflakeAiStrategyModule,
            'snowflakeAiPassportStrategy',
            'get',
        ).mockReturnValue(undefined);
        const next = vi.fn();
        authenticateAgentConnect(req, {} as Response, next);
        expect(next).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(analytics.track).toHaveBeenLastCalledWith({
            userId: defaultSessionUser.userUuid,
            event: 'agent_identity.connect_failed',
            properties: {
                ...attempt,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                failureReason: FailureReason.NOT_CONFIGURED,
            },
        });
        expect(req.session.oauth?.agentConnect).toBeUndefined();
    });

    it('preserves errors forwarded outside the custom Passport callback', async () => {
        const { req, start, analytics } = setup();
        await start();
        passport.unuse('snowflake-ai');
        const next = vi.fn();
        agentConnectCallback(req, {} as Response, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(req.session.oauth?.agentConnect).toBeUndefined();
    });
});

describe('connect guards', () => {
    it.each(['start', 'callback'])(
        'does not reach %s tracking with the flag off',
        async (route) => {
            const { req, start, flags, analytics } = setup();
            if (route === 'callback') await start();
            analytics.track.mockClear();
            flags.get.mockResolvedValue({ enabled: false });
            const next = vi.fn();
            await requireAgentIdentity(req, {} as Response, next);
            expect(next).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'FeatureNotEnabledError' }),
            );
            expect(analytics.track).not.toHaveBeenCalled();
        },
    );

    it('rejects an unauthenticated request before either lifecycle handler', () => {
        const { req, analytics } = setup();
        delete req.user;
        delete req.account;
        const next = vi.fn();
        isAuthenticated(req, {} as Response, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(analytics.track).not.toHaveBeenCalled();
    });
});

describe('failure classification', () => {
    const base = {
        error: null,
        user: false as const,
        status: undefined,
        accessDenied: false,
        tokenExchangeStarted: false,
        verification: undefined,
    };
    it.each(Object.values(FailureReason))(
        'preserves typed verification failure %s',
        (failureReason) => {
            expect(
                classifyAgentConnectFailure({
                    ...base,
                    verification: { failureReason },
                }),
            ).toBe(failureReason);
        },
    );
    it.each([
        [
            new AuthorizationError('private', 'access_denied'),
            FailureReason.ACCESS_DENIED,
        ],
        [
            new AuthorizationError('private', 'server_error'),
            FailureReason.OAUTH_ERROR,
        ],
        [
            new TokenError('private', 'invalid_grant'),
            FailureReason.TOKEN_EXCHANGE_FAILED,
        ],
        [
            new InternalOAuthError('private', new Error('private')),
            FailureReason.TOKEN_EXCHANGE_FAILED,
        ],
        [new Error('access_denied'), FailureReason.SIGN_IN_FAILED],
    ])('classifies the error class, not its message', (error, expected) => {
        expect(classifyAgentConnectFailure({ ...base, error })).toBe(expected);
    });
    it('classifies Passport fail status and access-denied signals', () => {
        expect(classifyAgentConnectFailure({ ...base, status: 403 })).toBe(
            FailureReason.STATE_MISMATCH,
        );
        expect(
            classifyAgentConnectFailure({ ...base, accessDenied: true }),
        ).toBe(FailureReason.ACCESS_DENIED);
        expect(classifyAgentConnectFailure(base)).toBe(
            FailureReason.SIGN_IN_FAILED,
        );
    });
    it('classifies the missing access token before verify starts', () => {
        expect(
            classifyAgentConnectFailure({
                ...base,
                error: new Error('opaque'),
                tokenExchangeStarted: true,
            }),
        ).toBe(FailureReason.TOKEN_EXCHANGE_FAILED);
        expect(
            classifyAgentConnectFailure({
                ...base,
                error: new Error('opaque'),
                tokenExchangeStarted: true,
                verification: { failureReason: null },
            }),
        ).toBe(FailureReason.SIGN_IN_FAILED);
    });
});
