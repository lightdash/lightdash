import OAuth2Server from '@node-oauth/oauth2-server';
import express, { type ErrorRequestHandler, type Request } from 'express';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { nanoid } from 'nanoid';
import { once } from 'node:events';
import { request, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { defaultSessionUser } from '../auth/account/account.mock';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    allowOauthAuthentication,
    isAuthenticated,
} from '../controllers/authentication';
import Logger from '../logging/logger';
import { OAuth2Model } from '../models/OAuth2Model';
import { type UserModel } from '../models/UserModel';
import { OAuthService } from '../services/OAuthService/OAuthService';
import oauthRouter from './oauthRouter';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
let server: Server;
let base: string;
const clientId = 'digest-test-client';
const logs: unknown[][] = [];
let tokenQueries = 0;
database.on('query', ({ sql }: { sql: string }) => {
    if (/oauth2_(access_tokens|refresh_tokens|authorization_codes)/.test(sql))
        tokenQueries += 1;
});

beforeAll(async () => {
    const config = {
        ...lightdashConfigMock,
        auth: {
            ...lightdashConfigMock.auth,
            oauthServer: {
                accessTokenLifetime: 3600,
                refreshTokenLifetime: 86400,
                mobileRefreshTokenLifetime: 86400,
                refreshTokenRotationGrace: 60,
            },
        },
    };
    const model = new OAuth2Model(database, config, {
        get: async ({ featureFlagId }) => ({
            id: featureFlagId,
            enabled: false,
        }),
    });
    const service = new OAuthService({
        oauthModel: model,
        lightdashConfig: config,
        userModel: {} as UserModel,
    });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, res, next) => {
        req.isAuthenticated = (() => false) as Request['isAuthenticated'];
        if (req.path.endsWith('/introspect')) req.user = defaultSessionUser;
        req.services = { getOauthService: () => service } as never;
        res.set('Date', 'Mon, 12 Oct 2026 12:00:00 GMT');
        next();
    });
    app.get(
        '/api/protected',
        allowOauthAuthentication,
        isAuthenticated,
        (_req, res) => res.json({ authenticated: true }),
    );
    app.use('/api/v1/oauth', oauthRouter);
    const errors: ErrorRequestHandler = (error, _req, res, _next) => {
        res.status(error.statusCode ?? 401).json({
            error: error.name,
            message: error.message,
        });
    };
    app.use(errors);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
    await database.destroy();
});
beforeEach(() => {
    tracker.reset();
    tracker.on.select(/from "oauth2_clients"/).response({
        client_id: clientId,
        client_name: 'Digest test',
        redirect_uris: ['https://client.example/callback'],
        grants: ['authorization_code', 'refresh_token'],
        scopes: ['read'],
    });
    tracker.on
        .select(/oauth2_(access_tokens|refresh_tokens|authorization_codes)/)
        .response([]);
    tracker.on.update('oauth2_access_tokens').response(0);
    tracker.on.delete('oauth2_access_tokens').response(0);
    for (const level of ['error', 'warn', 'info', 'debug'] as const) {
        vi.spyOn(Logger, level).mockImplementation((...args: unknown[]) => {
            logs.push([level, ...args]);
            return Logger;
        });
    }
    logs.length = 0;
});
afterEach(() => vi.restoreAllMocks());

const surfaces = ['bearer', 'refresh', 'code', 'revoke', 'introspect'] as const;
const call = async (
    surface: (typeof surfaces)[number],
    value: string,
    bearerHeader = surface === 'bearer',
    repeat: string | null = null,
) => {
    let params: Record<string, string> = { token: value };
    if (surface === 'refresh')
        params = {
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: value,
        };
    if (surface === 'code')
        params = {
            client_id: clientId,
            grant_type: 'authorization_code',
            code: value,
            redirect_uri: 'https://client.example/callback',
            code_verifier: nanoid(64),
        };
    const form = new URLSearchParams(params);
    if (repeat !== null) {
        const fields = {
            bearer: 'token',
            refresh: 'refresh_token',
            code: 'code',
            revoke: 'token',
            introspect: 'token',
        } as const;
        form.append(fields[surface], repeat);
    }
    const body = form.toString();
    const path =
        surface === 'bearer'
            ? '/api/protected'
            : `/api/v1/oauth/${surface === 'refresh' || surface === 'code' ? 'token' : surface}`;
    logs.length = 0;
    tokenQueries = 0;
    const response = await new Promise<{
        status: number;
        body: string;
        headers: unknown;
    }>((resolve, reject) => {
        const req = request(
            `${base}${path}`,
            {
                method: surface === 'bearer' ? 'GET' : 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded',
                    ...(bearerHeader
                        ? { authorization: `Bearer ${value}` }
                        : {}),
                    connection: 'close',
                },
            },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode!,
                        body: Buffer.concat(chunks).toString(),
                        headers: res.headers,
                    }),
                );
            },
        );
        req.on('error', reject);
        req.end(surface === 'bearer' ? undefined : body);
    });
    return { response, logs: [...logs] };
};

// Introspection reads its token from the bearer header only; see the colon case below.
it.each(['bearer', 'refresh', 'code', 'revoke'] as const)(
    'keeps unknown and prefixed refusals identical at the %s HTTP surface',
    async (surface) => {
        const unknown = `ldapp_${nanoid(64)}`;
        const ordinary = await call(surface, unknown);
        expect(tokenQueries).toBeGreaterThan(0);
        expect(ordinary.response.status).toBe(surface === 'revoke' ? 200 : 401);
        await ['sha256:', 'SHA256:'].reduce(async (previous, prefix) => {
            await previous;
            const value = `${prefix}${nanoid(64)}`;
            const refused = await call(surface, value);
            expect(tokenQueries).toBe(0);
            expect(JSON.stringify(refused) === JSON.stringify(ordinary)).toBe(
                true,
            );
            expect(JSON.stringify(refused).includes(value)).toBe(false);
            expect(JSON.stringify(ordinary).includes(unknown)).toBe(false);
        }, Promise.resolve());
    },
);

// The OAuth library refuses any bearer header containing a colon as malformed,
// so a prefixed bearer gets that existing answer and never reaches the model.
it.each(['bearer', 'introspect'] as const)(
    'answers a prefixed bearer header like any other bearer with a colon at the %s surface',
    async (surface) => {
        const colon = await call(surface, `${nanoid(8)}:${nanoid(64)}`, true);
        expect(tokenQueries).toBe(0);
        await ['sha256:', 'SHA256:'].reduce(async (previous, prefix) => {
            await previous;
            const value = `${prefix}${nanoid(64)}`;
            const refused = await call(surface, value, true);
            expect(tokenQueries).toBe(0);
            expect(JSON.stringify(refused) === JSON.stringify(colon)).toBe(
                true,
            );
            expect(JSON.stringify(refused).includes(value)).toBe(false);
        }, Promise.resolve());
    },
);

// A repeated form field reaches the model as an array, which must be an unknown value, not an error.
it.each(['refresh', 'code', 'revoke'] as const)(
    'answers a repeated credential field like an unknown value at the %s surface',
    async (surface) => {
        const ordinary = await call(surface, `ldapp_${nanoid(64)}`);
        expect(tokenQueries).toBeGreaterThan(0);
        expect(ordinary.response.status).toBe(surface === 'revoke' ? 200 : 401);
        const first = nanoid(64);
        const second = nanoid(64);
        const repeated = await call(surface, first, false, second);
        expect(tokenQueries).toBe(0);
        expect(JSON.stringify(repeated) === JSON.stringify(ordinary)).toBe(
            true,
        );
        expect(JSON.stringify(repeated).includes(first)).toBe(false);
        expect(JSON.stringify(repeated).includes(second)).toBe(false);
    },
);
