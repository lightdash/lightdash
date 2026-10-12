import { FeatureFlags } from '@lightdash/common';
import connectSessionKnex from 'connect-session-knex';
import signature from 'cookie-signature';
import express, { type ErrorRequestHandler } from 'express';
import expressSession from 'express-session';
import { type Knex } from 'knex';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type AddressInfo } from 'node:net';
import passport from 'passport';
import { fromSession } from '../../../auth/account/account';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { apiKeyPassportStrategy } from '../../../controllers/authentication/strategies/apiKeyStrategy';
import { errorHandler } from '../../../errors';
import { RegisterRoutes } from '../../../generated/routes';
import { ModelRepository } from '../../../models/ModelRepository';
import oauthRouter from '../../../routers/oauthRouter';
import { ProjectService } from '../../../services/ProjectService/ProjectService';
import { ServiceRepository } from '../../../services/ServiceRepository';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { connectionTestConfig } from './agentConnectionFixture.mock';

const sessionSecret = 'agent-connection-http-test-session-secret';
export const startConnectionHttpServer = async (database: Knex) => {
    const config = {
        ...connectionTestConfig,
        lightdashSecrets: {
            active: process.env.LIGHTDASH_SECRET!,
            fallbacks: [],
            all: [process.env.LIGHTDASH_SECRET!],
        },
        auth: {
            ...connectionTestConfig.auth,
            pat: { ...connectionTestConfig.auth.pat, enabled: true },
        },
    };
    Object.assign(lightdashConfig, config);
    const encryptionUtil = new EncryptionUtil({ lightdashConfig: config });
    const models = new ModelRepository({
        database,
        lightdashConfig: config,
        utils: { getEncryptionUtil: () => encryptionUtil } as never,
    });
    const queued: { kind: string; args: unknown }[] = [];
    const scheduler = {
        indexCatalog: async (args: unknown) => {
            queued.push({ kind: 'indexCatalog', args });
            return randomUUID();
        },
        generateValidation: async (args: unknown) => {
            queued.push({ kind: 'generateValidation', args });
            return randomUUID();
        },
    };
    const services = new ServiceRepository({
        context: {
            lightdashConfig: config,
            lightdashAnalytics: { track: () => {} },
        } as never,
        models,
        serviceProviders: {
            projectService: ({ repository }) =>
                new ProjectService({
                    lightdashConfig: config,
                    projectModel: models.getProjectModel(),
                    preAggregateModel: models.getPreAggregateModel(),
                    projectDbtSourcesModel: models.getProjectDbtSourcesModel(),
                    catalogModel: models.getCatalogModel(),
                    projectCompileLogModel: models.getProjectCompileLogModel(),
                    schedulerClient: scheduler,
                    getAgentConnectionGrantService: () =>
                        repository.getAgentConnectionGrantService(),
                    featureFlagModel: models.getFeatureFlagModel(),
                } as unknown as ConstructorParameters<
                    typeof ProjectService
                >[0]),
        },
        clients: {
            getEmailClient: () => ({}),
            getSchedulerClient: () => scheduler,
        } as never,
        utils: { getEncryptionUtil: () => encryptionUtil } as never,
    });
    const users = services.getUserService();
    passport.use(
        'headerapikey',
        apiKeyPassportStrategy({ userService: users }),
    );
    passport.deserializeUser(
        async (identity: { id: string; organization: string }, done) => {
            try {
                done(null, await users.findSessionUser(identity));
            } catch (error) {
                done(error);
            }
        },
    );
    const Store = connectSessionKnex(expressSession);
    const store = new Store({
        knex: database,
        tablename: 'sessions',
        createtable: false,
        clearInterval: 0,
    });
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
        req.services = services;
        next();
    });
    app.use(
        expressSession({
            secret: sessionSecret,
            resave: false,
            saveUninitialized: false,
            store,
        }),
    );
    app.use(passport.initialize());
    app.use(passport.session());
    app.use((req, _res, next) => {
        if (req.user) req.account = fromSession(req.user, req.sessionID);
        next();
    });
    app.use('/api/v1/oauth', oauthRouter);
    RegisterRoutes(app);
    const errors: ErrorRequestHandler = (error: Error, _req, res, _next) => {
        const result = errorHandler(error);
        res.status(result.statusCode).json({
            status: 'error',
            error: {
                statusCode: result.statusCode,
                name: result.name,
                message: result.message,
                data: result.data,
            },
        });
    };
    app.use(errors);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
        base,
        models,
        services,
        queued,
        close: async () => {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        },
    };
};

export const enableConnectionFlag = async (
    database: Knex,
    organizationUuid: string,
) => {
    await database('feature_flags')
        .insert({ flag_id: FeatureFlags.AgentIdentity, default_enabled: false })
        .onConflict('flag_id')
        .ignore();
    await database('feature_flag_overrides').insert({
        flag_id: FeatureFlags.AgentIdentity,
        organization_uuid: organizationUuid,
        enabled: true,
    });
};

export const sessionCookie = async (
    database: Knex,
    userUuid: string,
    organizationUuid: string,
) => {
    const sid = randomUUID();
    await database('sessions').insert({
        sid,
        expired: new Date(Date.now() + 3600000),
        sess: {
            cookie: {
                originalMaxAge: 3600000,
                expires: new Date(Date.now() + 3600000),
                httpOnly: true,
                path: '/',
            },
            passport: {
                user: { id: userUuid, organization: organizationUuid },
            },
        },
    });
    return `connect.sid=${encodeURIComponent(`s:${signature.sign(sid, sessionSecret)}`)}`;
};

export const httpRequest = async (
    base: string,
    path: string,
    headers: Record<string, string>,
    method = 'GET',
    body?: unknown,
) => {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: {
            ...headers,
            ...(body === undefined
                ? {}
                : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
        status: response.status,
        body: response.headers.get('content-type')?.includes('application/json')
            ? await response.json()
            : await response.text(),
    };
};

export const forEachInOrder = async <T>(
    items: readonly T[],
    operation: (item: T) => Promise<void>,
): Promise<void> => {
    await items.reduce(
        (previous, item) => previous.then(() => operation(item)),
        Promise.resolve(),
    );
};
