import { type SessionUser } from '@lightdash/common';
import { type Request, type Response, type Router } from 'express';
import { Cookie, MemoryStore, type SessionData } from 'express-session';
import passport from 'passport';
import { type Profile, type Strategy } from 'passport-google-oauth20';
import { vi } from 'vitest';
import { lightdashConfig } from '../config/lightdashConfig';
import { googlePassportStrategy } from '../controllers/authentication/strategies/googleStrategy';
import { apiV1Router } from '../routers/apiV1Router';
import { type UserService } from '../services/UserService';

vi.mock('../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                google: {
                    ...lightdashConfigMock.auth.google,
                    oauth2ClientId: 'client_a',
                    oauth2ClientSecret: 'client_secret_a',
                    loginPath: '/login/google',
                    callbackPath: '/oauth/google/callback',
                },
            },
        },
    };
});

export const createGoogleOAuthCompatibilityHarness = (
    user: SessionUser | undefined,
    userService: Pick<
        UserService,
        | 'storeOAuthGrant'
        | 'createBigqueryWarehouseCredentials'
        | 'loginWithOpenId'
    >,
    backend: { router: Router; strategy: Strategy } = {
        router: apiV1Router,
        strategy: googlePassportStrategy!,
    },
    store = new MemoryStore(),
) => {
    const sessionId = 'session_a';
    const { strategy, router } = backend;
    const authenticate = vi.spyOn(strategy, 'authenticate');
    const transport = strategy as unknown as {
        _key: string;
        _oauth2: {
            getOAuthAccessToken: (
                code: string,
                params: Record<string, string>,
                done: (
                    error: Error | null,
                    accessToken: string,
                    refreshToken: string,
                    params: { scope: string },
                ) => void,
            ) => void;
        };
    };
    const exchange = vi
        .spyOn(transport._oauth2, 'getOAuthAccessToken')
        .mockImplementation((_code, _params, done) => {
            done(null, 'access_token_a', 'refresh_token_a', {
                scope: 'openid email https://www.googleapis.com/auth/bigquery',
            });
        });
    const profile = vi
        .spyOn(strategy, 'userProfile')
        .mockImplementation((_token, done) => {
            done(null, {
                provider: 'google',
                id: 'subject_a',
                displayName: 'user_a',
                emails: [{ value: 'email_a', verified: true }],
            } as unknown as Profile);
        });
    const readSession = () =>
        new Promise<SessionData | null>((resolve, reject) => {
            store.get(sessionId, (error, data) =>
                error ? reject(error) : resolve(data ?? null),
            );
        });
    const writeSession = (data: SessionData) =>
        new Promise<void>((resolve, reject) => {
            store.set(sessionId, data, (error) =>
                error ? reject(error) : resolve(),
            );
        });
    const invoke = async (
        path: string,
        query: Request['query'] = {},
        data?: SessionData,
    ) => {
        passport.use('google', strategy);
        const session = data ??
            (await readSession()) ?? { cookie: new Cookie(), oauth: {} };
        const req = {
            method: 'GET',
            url: path,
            originalUrl: path,
            query,
            session,
            user,
            services: { getUserService: () => userService },
            get: () => undefined,
            headers: {},
            connection: {},
        } as unknown as Request;
        const route = router.stack.find(
            (layer) => layer.route?.path === path,
        )?.route;
        if (!route) throw new Error('Registered Google route not found');
        let location: string | null = null;
        await new Promise<void>((resolve, reject) => {
            const res = {
                setHeader: (name: string, value: string) => {
                    if (name.toLowerCase() === 'location') location = value;
                },
                end: () => resolve(),
                redirect: (value: string) => {
                    location = value;
                    resolve();
                },
            } as unknown as Response;
            route.dispatch(req, res, (error: unknown) =>
                error ? reject(error) : resolve(),
            );
        });
        await writeSession(req.session as SessionData);
        const savedSession = await readSession();
        if (!savedSession) throw new Error('Google session was not saved');
        return { location, session: savedSession };
    };
    const callback = async () => {
        const data = await readSession();
        if (!data)
            throw new Error('Google callback needs an initiating session');
        const state = (
            data as unknown as Record<string, { state?: { handle: string } }>
        )[transport._key]?.state;
        return invoke(lightdashConfig.auth.google.callbackPath, {
            code: 'code_a',
            state: state?.handle,
        });
    };
    return {
        invoke,
        callback,
        readSession,
        writeSession,
        store,
        authenticate,
        exchange,
        profile,
        callbackPath: lightdashConfig.auth.google.callbackPath,
    };
};
