import { Ability } from '@casl/ability';
import {
    AgentIdentityConnectEntryPoint as EntryPoint,
    AgentIdentityConnectFailureReason as FailureReason,
    FeatureNotEnabledError,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request, type RequestHandler, type Response } from 'express';
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
import {
    AiAccessService,
    type AgentConnectAttempt,
} from '../../services/AiAccessService/AiAccessService';
import { snowflakeAgentClientMock } from '../../services/AiAccessService/SnowflakeAgentClientResolver.mock';
import {
    agentConnectCallback,
    authenticateAgentConnect,
    classifyAgentConnectFailure,
    storeAgentConnectAttempt,
} from './agentConnectAnalytics';
import { storeAgentConnectRedirect } from './agentConnectRedirect';
import { isAuthenticated } from './middlewares';
import { requireAgentIdentity } from './requireAgentIdentity';
import { AgentConnectStateStore } from './strategies/AgentConnectStateStore';
import * as snowflakeAiStrategyModule from './strategies/snowflakeAiStrategy';
import {
    createSnowflakeAiPassportStrategy,
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
                snowflakeAi: lightdashConfigMock.auth.snowflakeAi,
            },
        },
    };
});

const createStrategy = createSnowflakeAiPassportStrategy;
const snowflakeAiPassportStrategy = createSnowflakeAiPassportStrategy({
    ...snowflakeAgentClientMock,
    organizationUuid: defaultSessionUser.organizationUuid!,
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
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        analytics,
        featureFlagModel: flags,
        projectModel: projects,
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    vi.spyOn(service, 'resolveSnowflakeAgentClient').mockImplementation(
        async () => ({
            ...snowflakeAgentClientMock,
            organizationUuid: defaultSessionUser.organizationUuid!,
        }),
    );
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
        return req.agentConnectAttempt!;
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
    vi.spyOn(
        snowflakeAiStrategyModule,
        'createSnowflakeAiPassportStrategy',
    ).mockReturnValue(snowflakeAiPassportStrategy);
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
    it.each(['access_denied', 'server_error'])(
        'consumes the nonce and binding after %s and rejects a replay',
        async (error) => {
            const { req, start, authorize, callback, upsert } = setup();
            await start();
            const state = new URL(await authorize()).searchParams.get('state')!;
            req.query = { error, state, error_description: 'OAuth failed' };
            await callback();
            expect(req.session['oauth2:snowflake-ai']).toBeUndefined();
            expect(req.session.agentConnectBindings).toEqual({});
            req.query = { code: 'replayed-code', state };
            expect(await callback()).toContain('error=sign_in_failed');
            expect(oauth.getOAuthAccessToken).not.toHaveBeenCalled();
            expect(upsert).not.toHaveBeenCalled();
        },
    );

    it('rejects a denied nonce after the user changes organizations', async () => {
        const { req, service, start, authorize, callback, upsert } = setup();
        await start();
        const state = new URL(await authorize()).searchParams.get('state')!;
        req.query = { error: 'access_denied', state };
        await callback();
        req.user!.organizationUuid = 'other-org';
        vi.mocked(service.resolveSnowflakeAgentClient).mockResolvedValue({
            ...snowflakeAgentClientMock,
            organizationUuid: 'other-org',
        });
        req.query = { code: 'replayed-code', state };
        expect(await callback()).toContain('error=sign_in_failed');
        expect(oauth.getOAuthAccessToken).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'rejects an unbound nonce with or without a bindings map (map=%s)',
        async (hasBindings) => {
            const { req, callback, upsert } = setup();
            req.session['oauth2:snowflake-ai'] = { state: 'legacy-state' };
            if (hasBindings) req.session.agentConnectBindings = {};
            req.query = { code: 'code', state: 'legacy-state' };
            const result = await callback();
            expect(result).toContain('error=sign_in_failed');
            expect(oauth.getOAuthAccessToken).not.toHaveBeenCalled();
            expect(upsert).not.toHaveBeenCalled();
            expect(req.session['oauth2:snowflake-ai']).toBeUndefined();
        },
    );

    it('correlates overlapping starts when A is denied and B connects', async () => {
        const { req, analytics, upsert, start, authorize, callback } = setup();
        req.query.entryPoint = EntryPoint.CHAT_CARD;
        const first = await start();
        const firstState = new URL(await authorize()).searchParams.get(
            'state',
        )!;
        req.query.entryPoint = EntryPoint.MCP_CONNECT_LINK;
        const second = await start();
        const secondState = new URL(await authorize()).searchParams.get(
            'state',
        )!;
        expect(secondState).not.toBe(firstState);
        expect(req.session['oauth2:snowflake-ai']?.state).toBe(secondState);
        req.query = { error: 'access_denied', state: firstState };
        await callback();
        expect(analytics.track).toHaveBeenLastCalledWith({
            userId: defaultSessionUser.userUuid,
            event: 'agent_identity.connect_failed',
            properties: {
                ...first,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                failureReason: FailureReason.ACCESS_DENIED,
            },
        });
        expect(req.session['oauth2:snowflake-ai']?.state).toBe(secondState);
        req.query = { code: 'code', state: secondState };
        await callback();
        expect(analytics.track).toHaveBeenLastCalledWith({
            userId: defaultSessionUser.userUuid,
            event: 'agent_identity.connected',
            properties: {
                ...second,
                warehouseType: WarehouseTypes.SNOWFLAKE,
                failureReason: null,
            },
        });
        expect(analytics.track).toHaveBeenCalledTimes(4);
        expect(upsert).toHaveBeenCalledOnce();
    });

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
        expect(req.session.agentConnectAttempts ?? {}).toEqual({});
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(req.session.agentConnectBindings).toEqual({});
        expect(req.session['oauth2:snowflake-ai']).toBeUndefined();
        expect(await callback()).toBe(
            'http://localhost:4321/done?x=1&error=sign_in_failed',
        );
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(upsert).toHaveBeenCalledOnce();
    });

    it.each([
        ['access_denied', FailureReason.ACCESS_DENIED, 'sign_in_failed'],
        ['oauth_error', FailureReason.OAUTH_ERROR, 'sign_in_failed'],
        ['invalid_nonce', FailureReason.STATE_MISMATCH, 'sign_in_failed'],
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
                    state: url.searchParams.get('state')!,
                };
            if (branch === 'invalid_nonce')
                req.session['oauth2:snowflake-ai'] = { state: 'other-nonce' };
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
            expect(req.session.agentConnectAttempts ?? {}).toEqual({});
            await callback();
            expect(analytics.track).toHaveBeenCalledTimes(2);
        },
    );

    it.each([
        undefined,
        'unknown',
        ['state'],
        { nested: 'state' },
        '__proto__',
        'constructor',
    ])(
        'ignores an uncorrelated callback state %j without consuming another attempt',
        async (state) => {
            const { req, start, authorize, callback, analytics } = setup();
            const attempt = await start();
            const pendingState = new URL(await authorize()).searchParams.get(
                'state',
            )!;
            req.query = { error: 'access_denied', state };
            await callback();
            expect(analytics.track).toHaveBeenCalledTimes(1);
            expect(req.session.agentConnectAttempts).toEqual({
                [pendingState]: attempt,
            });
            expect(req.session['oauth2:snowflake-ai']?.state).toBe(
                pendingState,
            );
        },
    );

    it.each([undefined, 'unknown'])(
        'preserves a pending attempt when a callback has unbound state %j',
        async (state) => {
            const { req, start, authorize, callback, analytics, upsert } =
                setup();
            const attempt = await start();
            const pendingState = new URL(await authorize()).searchParams.get(
                'state',
            )!;
            req.query = { code: 'code', state };
            await callback();
            expect(analytics.track).toHaveBeenCalledTimes(1);
            expect(req.session.agentConnectAttempts).toEqual({
                [pendingState]: attempt,
            });
            expect(req.session['oauth2:snowflake-ai']?.state).toBe(
                pendingState,
            );
            expect(oauth.getOAuthAccessToken).not.toHaveBeenCalled();
            expect(upsert).not.toHaveBeenCalled();
        },
    );

    it('bounds pending attempts to the five most recent starts', async () => {
        const { req, start, authorize, callback, analytics } = setup();
        const entries = await Array.from({ length: 7 }).reduce<
            Promise<[string, AgentConnectAttempt][]>
        >(async (previous) => {
            const attempts = await previous;
            const attempt = await start();
            const state = new URL(await authorize()).searchParams.get('state')!;
            return [...attempts, [state, attempt]];
        }, Promise.resolve([]));
        expect(req.session.agentConnectAttempts).toEqual(
            Object.fromEntries(entries.slice(-5)),
        );
        expect(analytics.track).toHaveBeenCalledTimes(7);
        req.query = { error: 'access_denied', state: entries[0][0] };
        await callback();
        expect(analytics.track).toHaveBeenCalledTimes(7);
        expect(req.session.agentConnectAttempts).toEqual(
            Object.fromEntries(entries.slice(-5)),
        );
    });

    it('rejects an older code with its own attribution and preserves the latest attempt', async () => {
        const { req, start, authorize, callback, analytics, upsert } = setup();
        const first = await start();
        const firstState = new URL(await authorize()).searchParams.get(
            'state',
        )!;
        const second = await start();
        const secondState = new URL(await authorize()).searchParams.get(
            'state',
        )!;
        req.query = { code: 'old-code', state: firstState };
        await callback();
        expect(analytics.track).toHaveBeenLastCalledWith(
            expect.objectContaining({
                event: 'agent_identity.connect_failed',
                properties: expect.objectContaining({
                    ...first,
                    failureReason: FailureReason.STATE_MISMATCH,
                }),
            }),
        );
        expect(req.session.agentConnectAttempts).toEqual({
            [secondState]: second,
        });
        expect(req.session['oauth2:snowflake-ai']).toBeUndefined();
        expect(upsert).not.toHaveBeenCalled();
    });

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
                : {
                      error: 'access_denied',
                      state: url.searchParams.get('state')!,
                  };
            expect(await callback()).toBe(
                `https://app.example/auth/popup/${success ? 'success' : 'failure'}`,
            );
            expect(req.session.agentConnectAttempts ?? {}).toEqual({});
        },
    );

    it('does not record failure if the flag is disabled during token exchange', async () => {
        const { req, start, authorize, callback, flags, analytics } = setup();
        const earlier = await start();
        const earlierState = new URL(await authorize()).searchParams.get(
            'state',
        )!;
        await start();
        const url = new URL(await authorize());
        req.query = { code: 'code', state: url.searchParams.get('state')! };
        flags.get.mockResolvedValue({ enabled: false });
        expect(await callback()).toBe(
            'http://localhost:4321/done?x=1&error=sign_in_failed',
        );
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(req.session.agentConnectAttempts).toEqual({
            [earlierState]: earlier,
        });
    });

    it('records an unconfigured strategy at start without changing the error response', async () => {
        const { req, start, analytics } = setup();
        const attempt = await start();
        passport.unuse('snowflake-ai');
        vi.mocked(
            req.services.getAiAccessService().resolveSnowflakeAgentClient,
        ).mockResolvedValue(null);
        const next = vi.fn();
        await authenticateAgentConnect(req, {} as Response, next);
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
        expect(req.session.agentConnectAttempts ?? {}).toEqual({});
    });

    it('keeps start failure attribution if the authorization redirect throws after state binding', async () => {
        const { req, start, authorize, analytics } = setup();
        const earlier = await start();
        const earlierState = new URL(await authorize()).searchParams.get(
            'state',
        )!;
        const attempt = await start();
        const error = new Error('redirect failed');
        const next = vi.fn();
        await authenticateAgentConnect(
            req,
            {
                setHeader: () => {
                    throw error;
                },
            } as unknown as Response,
            next,
        );
        expect(next).toHaveBeenCalledExactlyOnceWith(error);
        expect(analytics.track).toHaveBeenCalledTimes(3);
        expect(analytics.track).toHaveBeenLastCalledWith(
            expect.objectContaining({
                event: 'agent_identity.connect_failed',
                properties: expect.objectContaining({
                    ...attempt,
                    failureReason: FailureReason.SIGN_IN_FAILED,
                }),
            }),
        );
        expect(req.session.agentConnectAttempts).toEqual({
            [earlierState]: earlier,
        });
        expect(req.agentConnectAttempt).toBeNull();
    });

    it.each(['next', 'throw'] as const)(
        'correlates errors on the %s path and preserves unrelated attempts',
        async (path) => {
            const { req, start, authorize, analytics } = setup();
            const first = await start();
            const firstState = new URL(await authorize()).searchParams.get(
                'state',
            )!;
            const second = await start();
            const secondState = new URL(await authorize()).searchParams.get(
                'state',
            )!;
            const error = new Error('passport failure');
            vi.spyOn(passport, 'authenticate').mockImplementation(
                (): RequestHandler => {
                    if (path === 'throw') throw error;
                    return (_req, _res, next) => next(error);
                },
            );
            const next = vi.fn();
            await [undefined, 'unknown'].reduce(async (previous, state) => {
                await previous;
                req.query = { code: 'code', state };
                await agentConnectCallback(req, {} as Response, next);
                expect(analytics.track).toHaveBeenCalledTimes(2);
                expect(req.session.agentConnectAttempts).toEqual({
                    [firstState]: first,
                    [secondState]: second,
                });
            }, Promise.resolve());
            req.query = { code: 'code', state: firstState };
            await agentConnectCallback(req, {} as Response, next);
            expect(next).toHaveBeenLastCalledWith(error);
            expect(analytics.track).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    event: 'agent_identity.connect_failed',
                    properties: expect.objectContaining({
                        ...first,
                        failureReason: FailureReason.SIGN_IN_FAILED,
                    }),
                }),
            );
            expect(req.session.agentConnectAttempts).toEqual({
                [secondState]: second,
            });
            await agentConnectCallback(req, {} as Response, next);
            expect(analytics.track).toHaveBeenCalledTimes(3);
        },
    );

    it.each(['next', 'throw'] as const)(
        'suppresses a disabled-feature error on the %s path for only its correlated attempt',
        async (path) => {
            const { req, start, authorize, analytics } = setup();
            const first = await start();
            const firstState = new URL(await authorize()).searchParams.get(
                'state',
            )!;
            await start();
            const secondState = new URL(await authorize()).searchParams.get(
                'state',
            )!;
            const error = new FeatureNotEnabledError('disabled');
            vi.spyOn(passport, 'authenticate').mockImplementation(
                (): RequestHandler => {
                    if (path === 'throw') throw error;
                    return (_req, _res, next) => next(error);
                },
            );
            req.query = { code: 'code', state: secondState };
            const next = vi.fn();
            await agentConnectCallback(req, {} as Response, next);
            expect(next).toHaveBeenCalledExactlyOnceWith(error);
            expect(analytics.track).toHaveBeenCalledTimes(2);
            expect(req.session.agentConnectAttempts).toEqual({
                [firstState]: first,
            });
        },
    );

    it('preserves errors forwarded outside the custom Passport callback', async () => {
        const { req, start, authorize, analytics } = setup();
        await start();
        const url = new URL(await authorize());
        req.query = { code: 'code', state: url.searchParams.get('state')! };
        vi.spyOn(passport, 'authenticate').mockImplementation(() => {
            throw new Error('passport failure');
        });
        const next = vi.fn();
        await agentConnectCallback(req, {} as Response, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(analytics.track).toHaveBeenCalledTimes(2);
        expect(req.session.agentConnectAttempts ?? {}).toEqual({});
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

describe('agent connect nonce store compatibility', () => {
    it('keeps the default nonce generation, replacement, verification, and failure messages', () => {
        const { req } = setup();
        const store = new AgentConnectStateStore();
        const stored = vi.fn();
        store.store(req, stored);
        const firstState = req.session['oauth2:snowflake-ai']!.state!;
        expect(firstState).toHaveLength(24);
        expect(stored).toHaveBeenLastCalledWith(null, firstState);
        store.store(req, stored);
        const secondState = req.session['oauth2:snowflake-ai']!.state!;
        expect(secondState).not.toBe(firstState);
        const verified = vi.fn();
        store.verify(req, firstState, verified);
        expect(verified).toHaveBeenLastCalledWith(null, false, {
            message: 'Invalid authorization request state.',
        });
        expect(req.session['oauth2:snowflake-ai']).toBeUndefined();
        store.verify(req, secondState, verified);
        expect(verified).toHaveBeenLastCalledWith(null, false, {
            message: 'Unable to verify authorization request state.',
        });
        store.store(req, stored);
        store.verify(req, req.session['oauth2:snowflake-ai']!.state!, verified);
        expect(verified).toHaveBeenLastCalledWith(null, true);
        expect(req.session['oauth2:snowflake-ai']).toBeUndefined();
        expect(req.session.agentConnectAttempts).toBeUndefined();
    });

    it('preserves the missing-session error when storing and verifying', () => {
        const store = new AgentConnectStateStore();
        const callback = vi.fn();
        store.store({} as Request, callback);
        store.verify({} as Request, 'state', callback);
        expect(callback).toHaveBeenCalledTimes(2);
        for (const [error] of callback.mock.calls) {
            expect(error).toEqual(
                new Error(
                    'OAuth 2.0 authentication requires session support when using state. Did you forget to use express-session middleware?',
                ),
            );
        }
    });
});

it('logs a redacted session-check exception once through the existing connect failure', async () => {
    const f = setup();
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    Object.assign(f.service, { logger });
    const attempt = await f.start();
    const url = new URL(await f.authorize());
    f.req.query = {
        code: 'auth-secret',
        state: url.searchParams.get('state')!,
    };
    vi.mocked(snowflakeAiSessionCheck.check).mockRejectedValue(
        Object.assign(
            new TypeError(
                'Connection failed password is abc123\nagent@example.com SELECT secret_column',
            ),
            { code: '390318' },
        ),
    );
    expect(await f.callback()).toBe(
        'http://localhost:4321/done?x=1&error=not_agent_session',
    );
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'Agent sign-in connect failed',
        {
            userUuid: attempt.userId,
            organizationUuid: attempt.organizationId,
            reason: FailureReason.SESSION_CHECK_FAILED,
            errorClass: 'TypeError',
            errorCode: '390318',
            errorCategory: null,
            errorMessage: 'Connection failed password [REDACTED]',
        },
    );
    for (const mock of Object.values(logger)) {
        for (const line of mock.mock.calls) {
            expect(JSON.stringify(line)).not.toMatch(
                /abc123|agent@example.com|secret_column|auth-secret|access-token|refresh-token/,
            );
        }
    }
    await f.callback();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(f.upsert).not.toHaveBeenCalled();
});

describe('Snowflake client attempt bindings', () => {
    it.each(['organization', 'version', 'unbound-organization'] as const)(
        'rejects %s changes before token exchange',
        async (change) => {
            const {
                req,
                start,
                authorize,
                callback,
                analytics,
                upsert,
                service,
            } = setup();
            await start();
            const state = new URL(await authorize()).searchParams.get('state')!;
            req.query = { code: 'code', state };
            if (change === 'organization')
                req.user!.organizationUuid = 'different-org';
            else
                vi.mocked(
                    service.resolveSnowflakeAgentClient,
                ).mockResolvedValue({
                    ...snowflakeAgentClientMock,
                    organizationUuid: defaultSessionUser.organizationUuid!,
                    source: 'organization',
                    clientVersion: 'new-version',
                });
            if (change === 'unbound-organization')
                delete req.session.agentConnectBindings;
            expect(await callback()).toContain('error=sign_in_failed');
            expect(oauth.getOAuthAccessToken).not.toHaveBeenCalled();
            expect(upsert).not.toHaveBeenCalled();
            expect(analytics.track).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        failureReason: FailureReason.SIGN_IN_FAILED,
                    }),
                }),
            );
        },
    );
    it('rejects an old-pod attempt without a client binding', async () => {
        const { req, start, authorize, callback, upsert } = setup();
        await start();
        const state = new URL(await authorize()).searchParams.get('state')!;
        delete req.session.agentConnectBindings;
        req.query = { code: 'code', state };
        expect(await callback()).toContain('error=sign_in_failed');
        expect(oauth.getOAuthAccessToken).not.toHaveBeenCalled();
        expect(upsert).not.toHaveBeenCalled();
    });
    it('reports missing callback configuration without exchanging a code', async () => {
        const { req, start, authorize, callback, analytics, service } = setup();
        await start();
        req.query = {
            code: 'code',
            state: new URL(await authorize()).searchParams.get('state')!,
        };
        vi.mocked(service.resolveSnowflakeAgentClient).mockResolvedValue(null);
        await expect(callback()).rejects.toThrow('not set up');
        expect(oauth.getOAuthAccessToken).not.toHaveBeenCalled();
        expect(analytics.track).toHaveBeenLastCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    failureReason: FailureReason.NOT_CONFIGURED,
                }),
            }),
        );
    });
});

it('completes an attempt with the same saved organization client', async () => {
    const { req, service, start, authorize, callback, upsert } = setup();
    const client = {
        ...snowflakeAgentClientMock,
        source: 'organization' as const,
        organizationUuid: defaultSessionUser.organizationUuid!,
        clientVersion: 'saved-version',
    };
    vi.mocked(service.resolveSnowflakeAgentClient).mockResolvedValue(client);
    vi.mocked(
        snowflakeAiStrategyModule.createSnowflakeAiPassportStrategy,
    ).mockImplementation((resolved) => {
        const strategy = createStrategy(resolved);
        const tokenClient = (strategy as unknown as { _oauth2: TokenClient })
            ._oauth2;
        vi.spyOn(tokenClient, 'getOAuthAccessToken').mockImplementation(
            (_code, _params, done) => done(null, 'access', 'refresh', {}),
        );
        return strategy;
    });
    await start();
    const state = new URL(await authorize()).searchParams.get('state')!;
    expect(req.session.agentConnectBindings?.[state]).toEqual({
        organizationUuid: client.organizationUuid,
        clientVersion: client.clientVersion,
    });
    req.query = { code: 'code', state };
    expect(await callback()).not.toContain('error=');
    expect(upsert).toHaveBeenCalledWith(req.user, 'refresh', null, {
        organizationUuid: client.organizationUuid,
        clientVersion: client.clientVersion,
    });
});
