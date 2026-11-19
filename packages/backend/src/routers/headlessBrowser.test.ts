import { Ability, AbilityBuilder, subject } from '@casl/ability';
import {
    applyServiceAccountAbilities,
    LightdashError,
    OrganizationMemberRole,
    ServiceAccountScope,
    type MemberAbility,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import express, { type ErrorRequestHandler } from 'express';
import expressSession from 'express-session';
import { once } from 'node:events';
import { request, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { Passport } from 'passport';
import { isAuthenticated } from '../controllers/authentication/middlewares';
import { authenticateServiceAccount } from '../ee/authentication/middlewares';
import { sessionAccountMiddleware } from '../middlewares/accountMiddleware';
import { createRestrictUnverifiedSessionMiddleware } from '../middlewares/restrictUnverifiedSession/restrictUnverifiedSession';
import { UserService } from '../services/UserService';
import { headlessBrowserRouter } from './headlessBrowser';

const ORG_UUID = 'org-0000-test';
const SA_USER_UUID = 'sa-user-0000-test';
const SA_UUID = 'sa-0000-test';
const HUMAN_UUID = 'human-0000-test';
const OTHER_UUID = 'other-0000-test';

type FakeServiceAccount = {
    uuid: string;
    description: string;
    scopes: ServiceAccountScope[];
    organizationUuid: string;
    expiresAt: Date | null;
};

const buildScopedAbility = (scopes: ServiceAccountScope[]) => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    applyServiceAccountAbilities({
        scopes,
        organizationUuid: ORG_UUID,
        userUuid: SA_USER_UUID,
        builder,
    });
    return { ability: builder.build(), abilityRules: builder.rules };
};

const fullAbility = new Ability<PossibleAbilities>([
    { action: 'manage', subject: 'Organization' },
    { action: 'manage', subject: 'Project' },
]);

const baseUser = (userUuid: string, isActive: boolean): SessionUser => ({
    userUuid,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    email: undefined,
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: ORG_UUID,
    organizationName: 'Test org',
    organizationCreatedAt: new Date('2024-01-01'),
    isActive,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    isEmailVerified: userUuid !== SA_USER_UUID,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ability: fullAbility,
    abilityRules: fullAbility.rules,
});

const buildFixture = () => {
    const serviceAccounts = new Map<string, FakeServiceAccount>([
        [
            SA_USER_UUID,
            {
                uuid: SA_UUID,
                description: 'export token',
                scopes: [ServiceAccountScope.ORG_READ],
                organizationUuid: ORG_UUID,
                expiresAt: null,
            },
        ],
    ]);
    const activeUsers = new Map<string, boolean>([
        [SA_USER_UUID, false],
        [HUMAN_UUID, false],
        [OTHER_UUID, true],
    ]);
    const grants = new Map<string, string>();

    const userModel = {
        findServiceAccountByUserUuid: vi.fn(async (userUuid: string) =>
            serviceAccounts.get(userUuid),
        ),
        findSessionUserAndOrgByUuid: vi.fn(async (userUuid: string) => {
            const serviceAccount = serviceAccounts.get(userUuid);
            if (!serviceAccount) {
                return baseUser(userUuid, activeUsers.get(userUuid) ?? false);
            }
            return {
                ...baseUser(userUuid, false),
                ...buildScopedAbility(serviceAccount.scopes),
            };
        }),
    };
    const userServiceThis = {
        lightdashConfig: { license: { licenseKey: 'test-licence' } },
        userModel,
    } as unknown as UserService;
    const getSessionUserForServiceAccount =
        UserService.prototype.getSessionUserForServiceAccount.bind(
            userServiceThis,
        );
    Object.assign(userServiceThis, { getSessionUserForServiceAccount });

    const userService = {
        getSessionByUserUuid: vi.fn(async (userUuid: string) =>
            baseUser(userUuid, activeUsers.get(userUuid) ?? false),
        ),
        getSessionUserForServiceAccount,
        getHeadlessServiceAccountSessionUser: vi.fn(
            (...args: [string, string?]) =>
                UserService.prototype.getHeadlessServiceAccountSessionUser.apply(
                    userServiceThis,
                    args,
                ),
        ),
    };

    const services = {
        getHeadlessBrowserService: () => ({
            consumeLoginGrant: async (token: string) => {
                const userUuid = grants.get(token) ?? null;
                grants.delete(token);
                return userUuid;
            },
        }),
        getUserService: () => userService,
        getServiceAccountService: () => ({
            authenticateServiceAccount: async () => {
                const serviceAccount = serviceAccounts.get(SA_USER_UUID)!;
                return { ...serviceAccount, userUuid: SA_USER_UUID };
            },
        }),
    };

    const grantLogin = (userUuid: string) => {
        const token = `${userUuid}-grant`;
        grants.set(token, userUuid);
        return token;
    };

    return { services, serviceAccounts, grantLogin };
};

type Fixture = ReturnType<typeof buildFixture>;

const startApp = async (
    fixture: Fixture,
    { hasEmailClient = false }: { hasEmailClient?: boolean } = {},
) => {
    const passport = new Passport();
    passport.serializeUser((user, done) => {
        done(null, { id: user.userUuid, organization: user.organizationUuid });
    });
    passport.deserializeUser(
        (
            passportUser: { id: string },
            done: (err: unknown, user?: SessionUser) => void,
        ) => {
            fixture.services
                .getUserService()
                .getSessionByUserUuid(passportUser.id)
                .then((user) => done(null, user), done);
        },
    );

    const app = express();
    app.use(express.json());
    app.use(
        expressSession({
            secret: 'headless-browser-test',
            resave: false,
            saveUninitialized: false,
        }),
    );
    app.use(passport.initialize());
    app.use(passport.session());
    app.use((req, _res, next) => {
        req.services = fixture.services as never;
        next();
    });
    app.use(sessionAccountMiddleware);
    app.use(createRestrictUnverifiedSessionMiddleware({ hasEmailClient }));
    app.use('/api/v1/headless-browser', headlessBrowserRouter);
    app.post('/test/session-mark', (req, res) => {
        if (req.body.mark) {
            req.session.headlessServiceAccount = req.body.mark;
        } else {
            delete req.session.headlessServiceAccount;
        }
        req.session.save(() => res.json({ status: 'ok' }));
    });
    app.get('/api/v1/probe', isAuthenticated, (req, res) => {
        const ability = req.account!.user!.ability!;
        res.json({
            type: req.account!.authentication.type,
            userUuid: req.user!.userUuid,
            abilityRules: req.account!.user!.abilityRules,
            canViewProject: ability.can(
                'view',
                subject('Project', { organizationUuid: ORG_UUID }),
            ),
            canManageOrganization: ability.can(
                'manage',
                subject('Organization', { organizationUuid: ORG_UUID }),
            ),
        });
    });
    const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
        res.status(
            error instanceof LightdashError ? error.statusCode : 500,
        ).json({ name: error instanceof Error ? error.name : 'UnknownError' });
    };
    app.use(errorHandler);

    const server: Server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    return { origin: `http://127.0.0.1:${port}`, server };
};

type Response = {
    status: number;
    body: Record<string, unknown>;
    cookie: string | undefined;
};

const send = (
    origin: string,
    method: 'GET' | 'POST',
    path: string,
    { body, cookie }: { body?: unknown; cookie?: string } = {},
): Promise<Response> =>
    new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body);
        const req = request(
            `${origin}${path}`,
            {
                method,
                headers: {
                    accept: 'application/json',
                    ...(payload ? { 'content-type': 'application/json' } : {}),
                    ...(cookie ? { cookie } : {}),
                },
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    const setCookie = res.headers['set-cookie']?.[0];
                    resolve({
                        status: res.statusCode ?? 0,
                        body: data ? JSON.parse(data) : {},
                        cookie: setCookie?.split(';')[0] ?? cookie,
                    });
                });
            },
        );
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });

const bearerAbilityRules = async (fixture: Fixture) => {
    const req = {
        headers: { authorization: 'Bearer service-account-token' },
        services: fixture.services,
        ip: '127.0.0.1',
        get: () => undefined,
    } as unknown as express.Request;
    await new Promise<void>((resolve, reject) => {
        void authenticateServiceAccount(req, {} as express.Response, (err) =>
            err ? reject(err) : resolve(),
        );
    });
    return {
        type: req.account!.authentication.type,
        abilityRules: JSON.parse(
            JSON.stringify(req.account!.user!.abilityRules),
        ),
    };
};

describe('POST /api/v1/headless-browser/login', () => {
    let fixture: Fixture;
    let origin: string;
    let server: Server;

    const login = async (userUuid: string) => {
        const response = await send(
            origin,
            'POST',
            '/api/v1/headless-browser/login',
            { body: { token: fixture.grantLogin(userUuid) } },
        );
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: 'ok',
            results: { userUuid },
        });
        return response.cookie;
    };

    beforeEach(async () => {
        fixture = buildFixture();
        ({ origin, server } = await startApp(fixture));
    });

    afterEach(() => {
        server.close();
    });

    it('lets an inactive service-account row in with only its scoped abilities, the same as the bearer path', async () => {
        const cookie = await login(SA_USER_UUID);

        const firstProbe = await send(origin, 'GET', '/api/v1/probe', {
            cookie,
        });
        const secondProbe = await send(origin, 'GET', '/api/v1/probe', {
            cookie,
        });

        const bearer = await bearerAbilityRules(fixture);
        [firstProbe, secondProbe].forEach((probe) => {
            expect(probe.status).toBe(200);
            expect(probe.body).toMatchObject({
                type: 'service-account',
                userUuid: SA_USER_UUID,
                canViewProject: true,
                canManageOrganization: false,
            });
            expect(probe.body.type).toBe(bearer.type);
            expect(probe.body.abilityRules).toEqual(bearer.abilityRules);
        });
    });

    it('lets the service-account session past the email verification gate', async () => {
        server.close();
        ({ origin, server } = await startApp(fixture, {
            hasEmailClient: true,
        }));
        const cookie = await login(SA_USER_UUID);

        const probe = await send(origin, 'GET', '/api/v1/probe', { cookie });
        expect(probe.status).toBe(200);
        expect(probe.body.type).toBe('service-account');
    });

    it('reloads the service account on each request so scope changes and expiry apply at once', async () => {
        const cookie = await login(SA_USER_UUID);
        const serviceAccount = fixture.serviceAccounts.get(SA_USER_UUID)!;

        serviceAccount.scopes = [ServiceAccountScope.ORG_ADMIN];
        const widened = await send(origin, 'GET', '/api/v1/probe', { cookie });
        expect(widened.status).toBe(200);
        expect(widened.body.abilityRules).toEqual(
            (await bearerAbilityRules(fixture)).abilityRules,
        );

        serviceAccount.expiresAt = new Date(Date.now() - 1000);
        const expired = await send(origin, 'GET', '/api/v1/probe', { cookie });
        expect(expired.status).toBe(403);
        expect(expired.body.name).toBe('DeactivatedAccountError');
    });

    it('refuses a service account that expired between the grant and the login', async () => {
        fixture.serviceAccounts.get(SA_USER_UUID)!.expiresAt = new Date(
            Date.now() - 1000,
        );
        const cookie = await login(SA_USER_UUID);

        const probe = await send(origin, 'GET', '/api/v1/probe', { cookie });
        expect(probe.status).toBe(403);
        expect(probe.body.name).toBe('DeactivatedAccountError');
    });

    it('refuses a service account that was deleted after the login', async () => {
        const cookie = await login(SA_USER_UUID);
        fixture.serviceAccounts.delete(SA_USER_UUID);

        const probe = await send(origin, 'GET', '/api/v1/probe', { cookie });
        expect(probe.status).toBe(403);
        expect(probe.body.name).toBe('DeactivatedAccountError');
    });

    it('still refuses a deactivated human and destroys the session', async () => {
        const cookie = await login(HUMAN_UUID);

        const probe = await send(origin, 'GET', '/api/v1/probe', { cookie });
        expect(probe.status).toBe(403);
        expect(probe.body.name).toBe('DeactivatedAccountError');

        const afterDestroy = await send(origin, 'GET', '/api/v1/probe', {
            cookie,
        });
        expect(afterDestroy.status).toBe(401);
        expect(afterDestroy.body.name).toBe('AuthorizationError');
    });

    it.each([
        {
            name: 'a mark for another user',
            mark: { userUuid: OTHER_UUID, serviceAccountUuid: SA_UUID },
        },
        {
            name: 'a mark that names the human',
            mark: { userUuid: HUMAN_UUID, serviceAccountUuid: SA_UUID },
        },
    ])(
        'refuses a deactivated human whose session carries $name',
        async ({ mark }) => {
            const cookie = await login(HUMAN_UUID);
            await send(origin, 'POST', '/test/session-mark', {
                body: { mark },
                cookie,
            });

            const probe = await send(origin, 'GET', '/api/v1/probe', {
                cookie,
            });
            expect(probe.status).toBe(403);
            expect(probe.body.name).toBe('DeactivatedAccountError');
        },
    );

    it.each([
        { name: 'no mark', mark: undefined },
        {
            name: 'a mark for another user',
            mark: { userUuid: OTHER_UUID, serviceAccountUuid: SA_UUID },
        },
        {
            name: 'a mark for another service account',
            mark: { userUuid: SA_USER_UUID, serviceAccountUuid: 'sa-other' },
        },
    ])('refuses a service-account session with $name', async ({ mark }) => {
        const cookie = await login(SA_USER_UUID);
        await send(origin, 'POST', '/test/session-mark', {
            body: { mark },
            cookie,
        });

        const probe = await send(origin, 'GET', '/api/v1/probe', {
            cookie,
        });
        expect(probe.status).toBe(403);
        expect(probe.body.name).toBe('DeactivatedAccountError');
    });
});
