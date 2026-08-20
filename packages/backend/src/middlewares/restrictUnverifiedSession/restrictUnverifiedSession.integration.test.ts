import { LightdashError } from '@lightdash/common';
import express, { type ErrorRequestHandler } from 'express';
import expressSession from 'express-session';
import type { Server } from 'node:http';
import passport from 'passport';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    test,
} from 'vitest';
import { RegisterRoutes } from '../../generated/routes';
import { apiV1Router } from '../../routers/apiV1Router';
import {
    getTestContext,
    type IntegrationTestContext,
} from '../../vitest.setup.integration';
import { sessionAccountMiddleware } from '../accountMiddleware';
import { createRestrictUnverifiedSessionMiddleware } from './restrictUnverifiedSession';

const listen = async (app: express.Express) =>
    new Promise<{ origin: string; server: Server }>((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Integration test server did not bind a port');
            }
            resolve({
                origin: `http://127.0.0.1:${address.port}`,
                server,
            });
        });
    });

const close = async (server: Server) =>
    new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });

const startGuardServer = async ({
    context,
    userUuid,
    hasEmailClient,
}: {
    context: IntegrationTestContext;
    userUuid: string;
    hasEmailClient: boolean;
}) => {
    const app = express();
    app.use(express.json());
    app.use(
        expressSession({
            secret: 'restricted-session-integration-test',
            resave: false,
            saveUninitialized: true,
        }),
    );
    app.use(passport.initialize());
    app.use(passport.session());
    app.use((req, _res, next) => {
        req.services = context.app.getServiceRepository();
        const requestUserUuid = req.get('x-test-user-uuid') ?? userUuid;
        context.app
            .getModels()
            .getUserModel()
            .findSessionUserByUUID(requestUserUuid)
            .then((sessionUser) => {
                req.user = sessionUser;
                next();
            })
            .catch(next);
    });
    app.use(sessionAccountMiddleware);
    app.use(
        createRestrictUnverifiedSessionMiddleware({
            hasEmailClient,
        }),
    );
    app.use('/api/v1', apiV1Router);
    RegisterRoutes(app);
    app.all('*', (_req, res) => res.status(204).end());
    const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
        const statusCode =
            error instanceof LightdashError ? error.statusCode : 500;
        res.status(statusCode).json({
            name: error instanceof Error ? error.name : 'UnknownError',
        });
    };
    app.use(errorHandler);
    return listen(app);
};

type EndpointRequest = {
    capability: string;
    method: string;
    path: string;
    body?: unknown;
    userUuid?: string;
};

const rejectedRequests: EndpointRequest[] = [
    {
        capability: 'password creation or change',
        method: 'POST',
        path: '/api/v1/user/password',
        body: { password: '', newPassword: 'secure-password-1' },
    },
    {
        capability: 'profile changes',
        method: 'PATCH',
        path: '/api/v1/user/me',
        body: { firstName: 'Changed' },
    },
    {
        capability: 'email changes',
        method: 'PATCH',
        path: '/api/v1/user/me',
        body: { email: 'changed@example.com' },
    },
    {
        capability: 'profile completion',
        method: 'PATCH',
        path: '/api/v1/user/me/complete',
        body: { firstName: 'Changed', lastName: 'User' },
    },
    {
        capability: 'avatar upload',
        method: 'PUT',
        path: '/api/v1/user/me/avatar',
        body: { image: 'data' },
    },
    {
        capability: 'avatar removal',
        method: 'DELETE',
        path: '/api/v1/user/me/avatar',
    },
    {
        capability: 'organization creation',
        method: 'PUT',
        path: '/api/v1/org',
        body: { name: 'Restricted organization' },
    },
    {
        capability: 'organization join',
        method: 'POST',
        path: '/api/v1/user/me/joinOrganization/org-uuid',
    },
    {
        capability: 'organization leave',
        method: 'DELETE',
        path: '/api/v1/user/me/leaveOrganization',
    },
    {
        capability: 'personal access token creation',
        method: 'POST',
        path: '/api/v1/user/me/personal-access-tokens',
        body: { description: 'restricted token' },
    },
    {
        capability: 'Google identity linking',
        method: 'GET',
        path: '/api/v1/login/google',
    },
    {
        capability: 'Google Drive identity linking',
        method: 'GET',
        path: '/api/v1/login/gdrive',
    },
    {
        capability: 'BigQuery identity linking',
        method: 'GET',
        path: '/api/v1/login/bigquery',
    },
    {
        capability: 'Slack identity linking',
        method: 'GET',
        path: '/api/v1/auth/slack',
    },
    {
        capability: 'identity removal',
        method: 'DELETE',
        path: '/api/v1/user/identity',
        body: { issuer: 'google' },
    },
];

const allowedRequests: EndpointRequest[] = [
    {
        capability: 'health bootstrap',
        method: 'GET',
        path: '/api/v1/health?skipMigrationCheck=true',
    },
    {
        capability: 'account bootstrap',
        method: 'GET',
        path: '/api/v1/user/account',
    },
    {
        capability: 'current user bootstrap',
        method: 'GET',
        path: '/api/v1/user',
    },
    {
        capability: 'verification layout feature flag bootstrap',
        method: 'GET',
        path: '/api/v2/feature-flag/new-onboarding',
    },
    {
        capability: 'one-time passcode resend',
        method: 'PUT',
        path: '/api/v1/user/me/email/otp',
    },
    {
        capability: 'email verification status',
        method: 'GET',
        path: '/api/v1/user/me/email/status',
    },
    {
        capability: 'email verification',
        method: 'GET',
        path: '/api/v1/user/me/email/status?passcode=000000',
    },
    {
        capability: 'logout',
        method: 'GET',
        path: '/api/v1/logout',
    },
    {
        capability: 'account cancellation',
        method: 'DELETE',
        path: '/api/v1/user/me',
    },
];

const sendRequest = (origin: string, request: EndpointRequest) =>
    fetch(`${origin}${request.path}`, {
        method: request.method,
        headers: {
            ...(request.userUuid === undefined
                ? {}
                : { 'x-test-user-uuid': request.userUuid }),
            ...(request.body === undefined
                ? {}
                : { 'content-type': 'application/json' }),
        },
        ...(request.body === undefined
            ? {}
            : {
                  body: JSON.stringify(request.body),
              }),
    });

describe('restricted unverified sessions', () => {
    let context: IntegrationTestContext;
    let origin: string;
    let server: Server;
    let userUuid: string;
    let cancellationUserUuid: string;
    let email: string;
    let cancellationEmail: string;

    beforeAll(async () => {
        context = getTestContext();
        email = `restricted-session-${Date.now()}@example.com`;
        const user = await context.app.getModels().getUserModel().createUser(
            {
                firstName: 'Restricted',
                lastName: 'Session',
                email,
            },
            true,
            false,
        );
        userUuid = user.userUuid;
        cancellationEmail = `restricted-cancellation-${Date.now()}@example.com`;
        const cancellationUser = await context.app
            .getModels()
            .getUserModel()
            .createUser(
                {
                    firstName: 'Restricted',
                    lastName: 'Cancellation',
                    email: cancellationEmail,
                },
                true,
                false,
            );
        cancellationUserUuid = cancellationUser.userUuid;

        ({ origin, server } = await startGuardServer({
            context,
            userUuid,
            hasEmailClient: true,
        }));
    });

    beforeEach(async () => {
        await context
            .db('emails')
            .whereIn('email', [email, cancellationEmail])
            .update({
                is_verified: false,
            });
    });

    afterAll(async () => {
        await close(server);
        await context
            .db('users')
            .whereIn('user_uuid', [userUuid, cancellationUserUuid])
            .delete();
    });

    test.each(rejectedRequests)(
        'rejects $capability at $method $path',
        async (request) => {
            const response = await sendRequest(origin, request);

            expect(response.status).toBe(403);
            await expect(response.json()).resolves.toEqual({
                name: 'ForbiddenError',
            });
        },
    );

    test.each(allowedRequests)(
        'allows $capability at $method $path',
        async (request) => {
            const response = await sendRequest(origin, {
                ...request,
                ...(request.capability === 'account cancellation'
                    ? { userUuid: cancellationUserUuid }
                    : {}),
            });

            expect(response.status).toBe(200);
        },
    );

    test('rejects endpoints that are not explicitly allowed', async () => {
        const response = await sendRequest(origin, {
            capability: 'new endpoint',
            method: 'POST',
            path: '/api/v1/future-sensitive-endpoint',
        });

        expect(response.status).toBe(403);
    });

    test('allows the frontend verification route to load', async () => {
        const response = await sendRequest(origin, {
            capability: 'frontend verification route',
            method: 'GET',
            path: '/verify-email',
        });

        expect(response.status).toBe(204);
    });

    test('allows a verified session to use protected endpoints', async () => {
        await context.db('emails').where({ email }).update({
            is_verified: true,
        });
        await expect(
            context.app
                .getModels()
                .getEmailModel()
                .getPrimaryEmailStatus(userUuid),
        ).resolves.toMatchObject({ isVerified: true });

        const response = await sendRequest(origin, {
            capability: 'protected endpoint',
            method: 'POST',
            path: '/api/v1/future-sensitive-endpoint',
        });

        expect(response.status).toBe(204);
    });

    test('allows an unverified session when no email client is configured', async () => {
        const smtpDisabledServer = await startGuardServer({
            context,
            userUuid,
            hasEmailClient: false,
        });

        try {
            const response = await sendRequest(smtpDisabledServer.origin, {
                capability: 'protected endpoint',
                method: 'POST',
                path: '/api/v1/future-sensitive-endpoint',
            });

            expect(response.status).toBe(204);
        } finally {
            await close(smtpDisabledServer.server);
        }
    });
});
