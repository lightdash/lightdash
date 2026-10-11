import { Ability } from '@casl/ability';
import {
    type PersonalAccessToken,
    type PossibleAbilities,
} from '@lightdash/common';
import { type NextFunction, type Request, type Response } from 'express';
import { type Knex } from 'knex';
import passport from 'passport';
import { fromServiceAccount } from '../../auth/account/account';
import { lightdashConfig } from '../../config/lightdashConfig';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { authenticateServiceAccount } from '../../ee/authentication';
import { PatSessionCache } from '../../models/caches/PatSessionCache';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { UserModel } from '../../models/UserModel';
import { UserService } from '../../services/UserService';
import { setupGrantAuthentication } from './agentConnectionGrants.mock';
import {
    allowApiKeyAuthentication,
    allowApiKeyAuthenticationIfPresent,
    allowOauthAuthentication,
} from './middlewares';

const cache = vi.hoisted(() => {
    process.env.EXPERIMENTAL_CACHE = 'true';
    return new Map<string, unknown>();
});
vi.mock('node-cache', () => ({
    default: class {
        get(key: string) {
            return cache.get(key);
        }
        set(key: string, value: unknown) {
            cache.set(key, value);
        }
    },
}));

vi.mock('passport', () => ({ default: { authenticate: vi.fn() } }));
vi.mock('../../ee/authentication', () => ({
    authenticateServiceAccount: vi.fn(),
}));
beforeEach(() => {
    cache.clear();
    vi.clearAllMocks();
});

it.each(
    [
        allowApiKeyAuthentication,
        allowOauthAuthentication,
        allowApiKeyAuthenticationIfPresent,
    ].flatMap((middleware) =>
        (['reduced', 'inactive', 'removed'] as const).map((change) => ({
            middleware,
            change,
        })),
    ),
)(
    'bypasses a populated real user cache for a bound bearer: $change $middleware.name',
    async ({ middleware, change }) => {
        const f = setupGrantAuthentication();
        const stale = { ...f.user, isEmailVerified: true };
        const model = new UserModel({
            database: vi.fn() as unknown as Knex,
            lightdashConfig: lightdashConfigMock,
            featureFlagModel: f.deps
                .featureFlags as unknown as FeatureFlagModel,
        });
        const load = vi
            .spyOn(model, 'findSessionUserAndOrgByUuid')
            .mockResolvedValue(stale);
        const cached = vi.spyOn(model, 'getSessionUserFromCacheOrDB');
        const users = new UserService({
            userModel: model,
        } as ConstructorParameters<typeof UserService>[0]);
        f.users.findSessionUser.mockImplementation((args) =>
            users.findSessionUser(args),
        );
        f.deps.userModel.findSessionUserAndOrgByUuid.mockImplementation(
            (userUuid: string, organizationUuid: string) =>
                model.findSessionUserAndOrgByUuid(userUuid, organizationUuid),
        );
        const identity = {
            id: stale.userUuid,
            organization: stale.organizationUuid!,
        };
        await users.findSessionUser(identity);
        expect(
            await model.getSessionUserFromCacheOrDB(
                identity.id,
                identity.organization,
            ),
        ).toEqual({ sessionUser: stale, cacheHit: true });
        const fresh = {
            ...stale,
            ability: new Ability<PossibleAbilities>([]),
            abilityRules: [],
        };
        if (change === 'inactive') fresh.isActive = false;
        if (change === 'removed')
            load.mockRejectedValue(new Error('Membership removed'));
        else load.mockResolvedValue(fresh);
        load.mockClear();
        cached.mockClear();
        const result = await f.run(middleware);
        if (change === 'reduced') {
            expect(result).toEqual({ status: 200, error: undefined });
            expect(f.req.account!.user.ability.can('view', 'Project')).toBe(
                false,
            );
        } else
            expect(result).toMatchObject({
                status: 401,
                body: { error: 'invalid_token' },
            });
        expect(load).toHaveBeenCalledExactlyOnceWith(
            identity.id,
            identity.organization,
        );
        expect(cached).not.toHaveBeenCalled();
        load.mockClear();
        Object.assign(f.token, { agentConnectionGrantUuid: null });
        expect(await f.run(middleware)).toEqual({
            status: 200,
            error: undefined,
        });
        expect(f.req.account!.user.ability.can('view', 'Project')).toBe(true);
        expect(cached).toHaveBeenCalledExactlyOnceWith(
            identity.id,
            identity.organization,
        );
        expect(load).not.toHaveBeenCalled();
    },
);

it.each([allowApiKeyAuthentication, allowApiKeyAuthenticationIfPresent])(
    'keeps PAT authentication on the real PAT cache: %s',
    async (middleware) => {
        const f = setupGrantAuthentication();
        const user = {
            ...f.user,
            ability: new Ability<PossibleAbilities>([
                { action: 'manage', subject: 'all' },
            ]),
        };
        const model = new UserModel({
            database: vi.fn() as unknown as Knex,
            lightdashConfig: lightdashConfigMock,
            featureFlagModel: f.deps
                .featureFlags as unknown as FeatureFlagModel,
        });
        const fresh = vi.spyOn(model, 'findSessionUserAndOrgByUuid');
        const cached = vi.spyOn(model, 'findSessionUserByPersonalAccessToken');
        const users = new UserService({
            userModel: model,
        } as ConstructorParameters<typeof UserService>[0]);
        vi.spyOn(users, 'loginToOrganization').mockResolvedValue(
            user as Awaited<ReturnType<UserService['loginToOrganization']>>,
        );
        PatSessionCache.set(
            'pat',
            {
                user,
                personalAccessToken: {
                    uuid: 'pat-uuid',
                    expiresAt: null,
                    lastUsedAt: new Date(),
                } as PersonalAccessToken,
            },
            Date.now(),
        );
        f.req.headers.authorization = 'ApiKey pat';
        f.oauth.authenticate.mockRejectedValue(new Error('Not OAuth'));
        vi.mocked(authenticateServiceAccount).mockImplementation(
            (_req, _res, next) => next(),
        );
        vi.mocked(passport.authenticate).mockReturnValue(
            (req: Request, _res: Response, next: NextFunction) => {
                void users
                    .loginWithPersonalAccessToken('pat')
                    .then((person) => {
                        req.user = person;
                        next();
                    }, next);
            },
        );
        const { enabled } = lightdashConfig.auth.pat;
        lightdashConfig.auth.pat.enabled = true;
        try {
            expect(await f.run(middleware)).toEqual({
                status: 200,
                error: undefined,
            });
            expect(f.req.account!.authentication.type).toBe('pat');
            expect(cached).toHaveBeenCalledExactlyOnceWith('pat');
            const { value } = cached.mock.results[0];
            expect(await value).toMatchObject({
                cacheHit: true,
            });
            expect(fresh).not.toHaveBeenCalled();
            expect(
                f.deps.userModel.findSessionUserAndOrgByUuid,
            ).not.toHaveBeenCalled();
            expect(f.users.findSessionUser).not.toHaveBeenCalled();
            expect(passport.authenticate).toHaveBeenCalledExactlyOnceWith(
                'headerapikey',
                { session: false },
            );
        } finally {
            lightdashConfig.auth.pat.enabled = enabled;
        }
    },
);

it.each([allowApiKeyAuthentication, allowApiKeyAuthenticationIfPresent])(
    'keeps service account authentication without a bound-person lookup: %s',
    async (middleware) => {
        const f = setupGrantAuthentication();
        f.oauth.authenticate.mockRejectedValue(new Error('Not OAuth'));
        const user = {
            ...f.user,
            serviceAccount: { uuid: 'service', description: 'service' },
        };
        vi.mocked(authenticateServiceAccount).mockImplementation(
            (req, _res, next) => {
                req.user = user;
                req.account = fromServiceAccount(user, 'service-token');
                req.isAuthenticated = (() =>
                    true) as Request['isAuthenticated'];
                next();
            },
        );
        expect(await f.run(middleware)).toEqual({
            status: 200,
            error: undefined,
        });
        expect(authenticateServiceAccount).toHaveBeenCalledOnce();
        expect(passport.authenticate).not.toHaveBeenCalled();
        expect(f.users.findSessionUser).not.toHaveBeenCalled();
        expect(
            f.deps.userModel.findSessionUserAndOrgByUuid,
        ).not.toHaveBeenCalled();
    },
);
