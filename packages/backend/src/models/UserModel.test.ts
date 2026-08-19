import { subject, type AbilityBuilder, type RawRuleOf } from '@casl/ability';
import {
    LightdashMode,
    LightdashUser,
    MemberAbility,
    NotFoundError,
    OrganizationMemberRole,
    PasswordLoginBlockedError,
    projectMemberAbilities,
    ProjectMemberRole,
    ServiceAccountScope,
    type SessionUser,
} from '@lightdash/common';
import bcrypt from 'bcrypt';
import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type LightdashConfig } from '../config/parseConfig';
import { EmailTableName } from '../database/entities/emails';
import { PasswordLoginTableName } from '../database/entities/passwordLogins';
import { UserTableName } from '../database/entities/users';
import { hashWithSecret } from '../utils/hash';
import { type FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import {
    mapDbUserDetailsToLightdashUser,
    UserModel,
    type DbUserDetails,
} from './UserModel';

vi.mock('../utils/hash', () => ({
    hash: vi.fn(async (s: string) => `bcrypt:env:${s}`),
    hashWithSecret: vi.fn(
        async (s: string, secret: string) => `bcrypt:${secret}:${s}`,
    ),
    deprecatedHash: vi.fn((s: string) => `sha256:${s}`),
}));

type TestableUserModel = {
    hasAuthentication: (userUuid: string, trx?: Knex) => Promise<boolean>;
    getUserProjectRoles: (
        userUuid: string,
        options?: { trx?: Knex },
    ) => Promise<never[]>;
    getUserGroupProjectRoles: (
        userId: number,
        organizationId: number,
        userUuid: string,
        trx?: Knex,
    ) => Promise<never[]>;
    getOrganizationExtraRoleUuids: (
        userId: number,
        organizationId: number,
        trx?: Knex,
    ) => Promise<string[]>;
    findServiceAccountByUserUuid: (
        userUuid: string,
        options?: { trx?: Knex },
    ) => Promise<
        | {
              uuid: string;
              description: string;
              scopes: ServiceAccountScope[];
              organizationUuid: string;
          }
        | undefined
    >;
    customRoleScopes: (
        roleUuids: string[],
        trx?: Knex,
    ) => Promise<Record<string, string[]>>;
    applyServiceAccountProjectMemberships: (
        userId: number,
        userUuid: string,
        builder: AbilityBuilder<MemberAbility>,
        trx?: Knex,
    ) => Promise<void>;
    generateUserAbilityBuilder: (
        user: DbUserDetails,
        trx?: Knex,
    ) => Promise<{
        abilityBuilder: AbilityBuilder<MemberAbility>;
    }>;
};

const lightdashConfig = {
    mode: LightdashMode.DEFAULT,
    auth: {
        pat: { enabled: false, allowedOrgRoles: [] },
    },
    license: {},
    customRoles: { enabled: false },
    rudder: {},
} as unknown as LightdashConfig;

const featureFlagModel = {
    get: vi.fn(async () => ({ enabled: false })),
} as unknown as FeatureFlagModel;

const userDetails: DbUserDetails = {
    user_id: 1,
    user_uuid: 'service-account-user',
    first_name: 'Service',
    last_name: 'Account',
    created_at: new Date('2024-01-01'),
    is_tracking_anonymized: false,
    is_marketing_opted_in: false,
    avatar_gradient: null,
    avatar_content_hash: null,
    email: 'service-account@example.com',
    organization_uuid: 'org-1',
    organization_name: 'Org 1',
    organization_created_at: new Date('2024-01-01'),
    organization_id: 10,
    is_setup_complete: true,
    role: OrganizationMemberRole.MEMBER,
    role_uuid: undefined,
    is_active: true,
    is_internal: true,
    timezone: null,
    updated_at: new Date('2024-01-01'),
};

const createUserModel = (): TestableUserModel => {
    const model = new UserModel({
        database: vi.fn() as unknown as Knex,
        lightdashConfig,
        featureFlagModel,
    }) as unknown as TestableUserModel;

    model.hasAuthentication = vi.fn(async () => true);
    model.getUserProjectRoles = vi.fn(async () => []);
    model.getUserGroupProjectRoles = vi.fn(async () => []);
    model.getOrganizationExtraRoleUuids = vi.fn(async () => []);
    model.findServiceAccountByUserUuid = vi.fn(async (userUuid) => ({
        uuid: 'service-account',
        description: 'Service account',
        scopes: [ServiceAccountScope.SYSTEM_MEMBER],
        organizationUuid: 'org-1',
    }));
    model.customRoleScopes = vi.fn(async () => ({
        'custom-role': ['view:Dashboard'],
    }));
    model.applyServiceAccountProjectMemberships = vi.fn(
        async (_userId, userUuid, builder) => {
            Array.from({ length: 125 }, (_, i) => `project-${i}`).forEach(
                (projectUuid) => {
                    projectMemberAbilities[ProjectMemberRole.ADMIN](
                        {
                            projectUuid,
                            role: ProjectMemberRole.ADMIN,
                            userUuid,
                        },
                        builder,
                    );
                },
            );
        },
    );

    return model;
};

const expectCollapsedDashboardProjectRule = (
    rules: AbilityBuilder<MemberAbility>['rules'],
) => {
    const dashboardRule = rules.find(
        (rule: RawRuleOf<MemberAbility>) =>
            rule.subject === 'Dashboard' &&
            rule.action === 'view' &&
            Boolean(
                (
                    rule.conditions as
                        | Record<string, { $in?: string[] }>
                        | undefined
                )?.projectUuid?.$in,
            ),
    );

    if (!dashboardRule) {
        throw new Error(
            'Expected service account Dashboard rule to be collapsed',
        );
    }

    expect(rules.length).toBeLessThan(100);
    expect(
        (dashboardRule.conditions as Record<string, { $in: string[] }>)
            .projectUuid.$in,
    ).toHaveLength(125);
};

const loadUserModelWithSessionUserCache = async () => {
    const entries = new Map<string, SessionUser>();
    const sessionUserCache = {
        get: vi.fn((key: string) => entries.get(key)),
        set: vi.fn((key: string, value: SessionUser) =>
            entries.set(key, value),
        ),
        keys: vi.fn(() => Array.from(entries.keys())),
        del: vi.fn((key: string) => entries.delete(key)),
        flushAll: vi.fn(),
    };

    vi.resetModules();
    vi.doMock('node-cache', () => ({
        default: function NodeCache() {
            return sessionUserCache;
        },
    }));

    const { UserModel: CachedUserModel } = await import('./UserModel');
    return { CachedUserModel, entries, sessionUserCache };
};

describe('UserModel', () => {
    it('creates a passwordless user without a password login', async () => {
        const insertUser = vi.fn(() => ({
            returning: vi.fn(async () => [
                {
                    user_id: 1,
                    user_uuid: 'passwordless-user',
                },
            ]),
        }));
        const insertEmail = vi.fn(async () => undefined);
        const findDuplicateEmails = vi.fn(async () => []);
        const transactionClient = vi.fn((tableName: string) => {
            if (tableName === UserTableName) {
                return { insert: insertUser };
            }
            if (tableName === EmailTableName) {
                return {
                    where: findDuplicateEmails,
                    insert: insertEmail,
                };
            }
            throw new Error(`Unexpected table ${tableName}`);
        }) as unknown as Knex.Transaction;
        const database = Object.assign(vi.fn(), {
            transaction: vi.fn(
                async (callback: (trx: Knex.Transaction) => Promise<unknown>) =>
                    callback(transactionClient),
            ),
        }) as unknown as Knex;
        const model = new UserModel({
            database,
            lightdashConfig,
            featureFlagModel,
        });
        const createdUser: LightdashUser = {
            ...mapDbUserDetailsToLightdashUser(
                {
                    ...userDetails,
                    user_id: 1,
                    user_uuid: 'passwordless-user',
                    first_name: '',
                    last_name: '',
                    email: 'passwordless@example.com',
                },
                false,
            ),
        };
        vi.spyOn(model, 'getUserDetailsByUuid').mockResolvedValue(createdUser);

        await model.createUser({
            firstName: '',
            lastName: '',
            email: 'passwordless@example.com',
        });

        expect(insertUser).toHaveBeenCalledWith(
            expect.objectContaining({
                first_name: '',
                last_name: '',
                is_active: true,
                is_setup_complete: true,
            }),
        );
        expect(insertEmail).toHaveBeenCalledWith({
            user_id: 1,
            email: 'passwordless@example.com',
            is_primary: true,
        });
        expect(transactionClient).not.toHaveBeenCalledWith(
            PasswordLoginTableName,
        );
    });

    it('inserts a password login when upserting a passwordless user password', async () => {
        const merge = vi.fn(async () => undefined);
        const onConflict = vi.fn(() => ({ merge }));
        const insert = vi.fn(() => ({ onConflict }));
        const first = vi.fn(async () => ({ user_id: 1 }));
        const where = vi.fn(() => ({ first }));
        const database = vi.fn((tableName: string) => {
            if (tableName === PasswordLoginTableName) {
                return { insert };
            }
            if (tableName === UserTableName) {
                return { where };
            }
            throw new Error(`Unexpected table ${tableName}`);
        }) as unknown as Knex;
        const model = new UserModel({
            database,
            lightdashConfig,
            featureFlagModel,
        });

        await model.upsertPassword('passwordless-user', 'new-password1!');

        expect(insert).toHaveBeenCalledWith({
            user_id: 1,
            password_hash: expect.any(String),
        });
        expect(onConflict).toHaveBeenCalledWith('user_id');
        expect(merge).toHaveBeenCalledOnce();
    });

    it('activates an invited user without creating a password login', async () => {
        const update = vi.fn(() => ({
            returning: vi.fn(async () => [{ user_id: 1 }]),
        }));
        const where = vi.fn(() => ({ update }));
        const transactionClient = vi.fn((tableName: string) => {
            if (tableName === UserTableName) {
                return { where };
            }
            throw new Error(`Unexpected table ${tableName}`);
        }) as unknown as Knex.Transaction;
        const database = Object.assign(vi.fn(), {
            transaction: vi.fn(
                async (callback: (trx: Knex.Transaction) => Promise<unknown>) =>
                    callback(transactionClient),
            ),
        }) as unknown as Knex;
        const model = new UserModel({
            database,
            lightdashConfig,
            featureFlagModel,
        });
        const activatedUser = mapDbUserDetailsToLightdashUser(
            {
                ...userDetails,
                first_name: '',
                last_name: '',
            },
            false,
        );
        vi.spyOn(model, 'getUserDetailsByUuid').mockResolvedValue(
            activatedUser,
        );

        await expect(
            model.activateUserWithoutPassword(userDetails.user_uuid),
        ).resolves.toEqual(activatedUser);

        expect(activatedUser.isActive).toBe(true);
        expect(update).toHaveBeenCalledWith({
            first_name: '',
            last_name: '',
            updated_at: expect.any(Date),
        });
        expect(transactionClient).not.toHaveBeenCalledWith(
            PasswordLoginTableName,
        );
    });

    it('collapses legacy service account project membership rules before returning the ability builder', async () => {
        const model = createUserModel();

        const { abilityBuilder } =
            await model.generateUserAbilityBuilder(userDetails);
        const ability = abilityBuilder.build();

        expectCollapsedDashboardProjectRule(abilityBuilder.rules);
        expect(
            ability.can(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: 'org-1',
                }),
            ),
        ).toBe(true);
        expect(
            ability.can(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: 'other-org',
                }),
            ),
        ).toBe(false);
    });

    it('collapses custom-role service account project membership rules before returning the ability builder', async () => {
        const model = createUserModel();

        const { abilityBuilder } = await model.generateUserAbilityBuilder({
            ...userDetails,
            role_uuid: 'custom-role',
        });

        expect(model.customRoleScopes).toHaveBeenCalledWith(
            ['custom-role'],
            expect.anything(),
        );
        expect(model.findServiceAccountByUserUuid).not.toHaveBeenCalled();
        expectCollapsedDashboardProjectRule(abilityBuilder.rules);
    });

    describe('extra custom roles (role sets)', () => {
        const humanDetails: DbUserDetails = {
            ...userDetails,
            user_uuid: 'human-user',
            is_internal: false,
            role: OrganizationMemberRole.VIEWER,
            role_uuid: undefined,
        };

        const createHumanModel = () => {
            const model = new UserModel({
                database: vi.fn() as unknown as Knex,
                lightdashConfig: {
                    ...lightdashConfig,
                    customRoles: { enabled: true },
                } as LightdashConfig,
                featureFlagModel,
            }) as unknown as TestableUserModel;
            model.hasAuthentication = vi.fn(async () => true);
            model.getUserProjectRoles = vi.fn(async () => [
                {
                    projectUuid: 'project-1',
                    role: ProjectMemberRole.VIEWER,
                    userUuid: humanDetails.user_uuid,
                    roleUuid: undefined,
                    extraRoleUuids: ['project-extra'],
                },
            ]) as unknown as TestableUserModel['getUserProjectRoles'];
            model.getUserGroupProjectRoles = vi.fn(async () => []);
            model.getOrganizationExtraRoleUuids = vi.fn(async () => [
                'org-extra',
            ]);
            model.customRoleScopes = vi.fn(async () => ({
                'org-extra': ['manage:Organization'],
                'project-extra': ['manage:SqlRunner'],
            }));
            model.findServiceAccountByUserUuid = vi.fn(async () => undefined);
            model.applyServiceAccountProjectMemberships = vi.fn(async () => {});
            return model;
        };

        it('unions org and project extra roles into a human user ability', async () => {
            const model = createHumanModel();

            const { abilityBuilder } =
                await model.generateUserAbilityBuilder(humanDetails);
            const ability = abilityBuilder.build();

            expect(model.customRoleScopes).toHaveBeenCalledWith(
                expect.arrayContaining(['org-extra', 'project-extra']),
                expect.anything(),
            );
            // base viewer ability kept
            expect(
                ability.can(
                    'view',
                    subject('OrganizationMemberProfile', {
                        organizationUuid: humanDetails.organization_uuid,
                    }),
                ),
            ).toBe(true);
            // extra org role adds manage:Organization (a viewer cannot)
            expect(
                ability.can(
                    'manage',
                    subject('Organization', {
                        organizationUuid: humanDetails.organization_uuid,
                    }),
                ),
            ).toBe(true);
            // extra project role adds manage:SqlRunner in that project only
            expect(
                ability.can(
                    'manage',
                    subject('SqlRunner', { projectUuid: 'project-1' }),
                ),
            ).toBe(true);
            expect(
                ability.can(
                    'manage',
                    subject('SqlRunner', { projectUuid: 'project-2' }),
                ),
            ).toBe(false);
        });

        it('applies org extra roles to a legacy-scopes service account', async () => {
            const model = createUserModel();
            model.getOrganizationExtraRoleUuids = vi.fn(async () => [
                'org-extra',
            ]);
            model.customRoleScopes = vi.fn(async () => ({
                'org-extra': ['manage:Organization'],
            }));

            const { abilityBuilder } =
                await model.generateUserAbilityBuilder(userDetails);

            expect(
                abilityBuilder.build().can(
                    'manage',
                    subject('Organization', {
                        organizationUuid: userDetails.organization_uuid,
                    }),
                ),
            ).toBe(true);
        });
    });

    it('uses one transaction executor for every ability source', async () => {
        const model = createUserModel();
        const trx = vi.fn() as unknown as Knex;

        await model.generateUserAbilityBuilder(userDetails, trx);

        expect(model.hasAuthentication).toHaveBeenCalledWith(
            userDetails.user_uuid,
            trx,
        );
        expect(model.getUserProjectRoles).toHaveBeenCalledWith(
            userDetails.user_uuid,
            { trx },
        );
        expect(model.getUserGroupProjectRoles).toHaveBeenCalledWith(
            userDetails.user_id,
            userDetails.organization_id,
            userDetails.user_uuid,
            trx,
        );
        expect(model.getOrganizationExtraRoleUuids).toHaveBeenCalledWith(
            userDetails.user_id,
            userDetails.organization_id,
            trx,
        );
        expect(model.findServiceAccountByUserUuid).toHaveBeenCalledWith(
            userDetails.user_uuid,
            { trx },
        );
        expect(
            model.applyServiceAccountProjectMemberships,
        ).toHaveBeenCalledWith(
            userDetails.user_id,
            userDetails.user_uuid,
            expect.anything(),
            trx,
        );
    });

    describe('getUserByPrimaryEmailAndPassword', () => {
        const createThenableQuery = (rows: unknown[]) => {
            const query: unknown = new Proxy(
                {},
                {
                    get: (target, prop) => {
                        if (prop === 'then') {
                            return (resolve: (value: unknown[]) => unknown) =>
                                resolve(rows);
                        }
                        if (prop === 'first') {
                            return () => Promise.resolve(rows[0]);
                        }
                        if (prop in target) {
                            return Reflect.get(target, prop);
                        }
                        return () => query;
                    },
                },
            );
            return query;
        };

        it('performs a dummy password comparison when the user has no password login', async () => {
            const trx = vi.fn(() => createThenableQuery([]));
            const database = Object.assign(vi.fn(), {
                transaction: vi.fn(
                    async (callback: (transaction: Knex) => unknown) =>
                        callback(trx as unknown as Knex),
                ),
            }) as unknown as Knex;
            const model = new UserModel({
                database,
                lightdashConfig,
                featureFlagModel,
            });
            const compareSpy = vi
                .spyOn(bcrypt, 'compare')
                .mockResolvedValue(false as never);

            await expect(
                model.getUserByPrimaryEmailAndPassword(
                    'passwordless@example.com',
                    'password1!',
                ),
            ).rejects.toThrow(
                'No user found with email passwordless@example.com and password',
            );

            expect(compareSpy).toHaveBeenCalledWith(
                'password1!',
                expect.stringMatching(/^\$2b\$10\$/),
            );
            compareSpy.mockRestore();
        });

        it('uses the same error for an incorrect password', async () => {
            const update = vi.fn(async () => 1);
            const passwordLogin = {
                user_id: 1,
                password_hash: 'hash',
                created_at: new Date(),
                failed_attempt_count: 0,
                last_attempt_at: new Date(),
                blocked_until: null,
            };
            const trx = vi.fn(() => {
                const query = createThenableQuery([passwordLogin]) as {
                    update?: typeof update;
                };
                query.update = update;
                return query;
            });
            const database = Object.assign(vi.fn(), {
                transaction: vi.fn(
                    async (callback: (transaction: Knex) => unknown) =>
                        callback(trx as unknown as Knex),
                ),
            }) as unknown as Knex;
            const model = new UserModel({
                database,
                lightdashConfig,
                featureFlagModel,
            });
            vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

            await expect(
                model.getUserByPrimaryEmailAndPassword(
                    'passwordless@example.com',
                    'password1!',
                ),
            ).rejects.toThrow(
                'No user found with email passwordless@example.com and password',
            );
        });

        it('blocks the account for 30 minutes on the fifth recent failed attempt', async () => {
            vi.useFakeTimers();
            vi.setSystemTime('2026-08-05T12:00:00.000Z');
            const update = vi.fn(async () => 1);
            const passwordLogin = {
                user_id: 1,
                password_hash: 'hash',
                created_at: new Date(),
                failed_attempt_count: 4,
                last_attempt_at: new Date('2026-08-05T11:59:00.000Z'),
                blocked_until: null,
            };
            const trx = vi.fn(() => {
                const query = createThenableQuery([passwordLogin]) as {
                    update?: typeof update;
                };
                query.update = update;
                return query;
            });
            const database = Object.assign(vi.fn(), {
                transaction: vi.fn(
                    async (callback: (transaction: Knex) => unknown) =>
                        callback(trx as unknown as Knex),
                ),
            }) as unknown as Knex;
            const model = new UserModel({
                database,
                lightdashConfig,
                featureFlagModel,
            });
            vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

            await expect(
                model.getUserByPrimaryEmailAndPassword(
                    'user@example.com',
                    'wrong-password',
                ),
            ).rejects.toBeInstanceOf(PasswordLoginBlockedError);

            expect(update).toHaveBeenCalledWith({
                failed_attempt_count: 5,
                last_attempt_at: new Date('2026-08-05T12:00:00.000Z'),
                blocked_until: new Date('2026-08-05T12:30:00.000Z'),
            });
            vi.useRealTimers();
        });
    });

    describe('getSessionUserFromCacheOrDB', () => {
        const userUuid = 'user-1';
        const organizationUuid = 'org-1';
        let savedExperimentalCache: string | undefined;

        beforeEach(() => {
            savedExperimentalCache = process.env.EXPERIMENTAL_CACHE;
            process.env.EXPERIMENTAL_CACHE = 'true';
        });

        afterEach(() => {
            if (savedExperimentalCache === undefined) {
                delete process.env.EXPERIMENTAL_CACHE;
            } else {
                process.env.EXPERIMENTAL_CACHE = savedExperimentalCache;
            }
            vi.doUnmock('node-cache');
            vi.resetModules();
        });

        it('serves a cached setup-complete user', async () => {
            const { CachedUserModel } =
                await loadUserModelWithSessionUserCache();
            const model = new CachedUserModel({
                database: vi.fn() as unknown as Knex,
                lightdashConfig,
                featureFlagModel,
            });
            const sessionUser = {
                userUuid,
                organizationUuid,
                isSetupComplete: true,
            } as SessionUser;
            const findSessionUser = vi
                .spyOn(model, 'findSessionUserAndOrgByUuid')
                .mockResolvedValue(sessionUser);

            await model.getSessionUserFromCacheOrDB(userUuid, organizationUuid);
            const result = await model.getSessionUserFromCacheOrDB(
                userUuid,
                organizationUuid,
            );

            expect(result).toEqual({ sessionUser, cacheHit: true });
            expect(findSessionUser).toHaveBeenCalledOnce();
        });

        it('treats a cached incomplete user as a cache miss', async () => {
            const { CachedUserModel, entries } =
                await loadUserModelWithSessionUserCache();
            const model = new CachedUserModel({
                database: vi.fn() as unknown as Knex,
                lightdashConfig,
                featureFlagModel,
            });
            const incompleteUser = {
                userUuid,
                organizationUuid,
                isSetupComplete: false,
            } as SessionUser;
            const sessionUser = {
                ...incompleteUser,
                isSetupComplete: true,
            };
            entries.set(`${userUuid}::${organizationUuid}`, incompleteUser);
            const findSessionUser = vi
                .spyOn(model, 'findSessionUserAndOrgByUuid')
                .mockResolvedValue(sessionUser);

            const result = await model.getSessionUserFromCacheOrDB(
                userUuid,
                organizationUuid,
            );

            expect(result).toEqual({ sessionUser, cacheHit: false });
            expect(findSessionUser).toHaveBeenCalledWith(
                userUuid,
                organizationUuid,
            );
        });

        it('does not cache an incomplete user', async () => {
            const { CachedUserModel, sessionUserCache } =
                await loadUserModelWithSessionUserCache();
            const model = new CachedUserModel({
                database: vi.fn() as unknown as Knex,
                lightdashConfig,
                featureFlagModel,
            });
            const sessionUser = {
                userUuid,
                organizationUuid,
                isSetupComplete: false,
            } as SessionUser;
            const findSessionUser = vi
                .spyOn(model, 'findSessionUserAndOrgByUuid')
                .mockResolvedValue(sessionUser);

            await model.getSessionUserFromCacheOrDB(userUuid, organizationUuid);
            await model.getSessionUserFromCacheOrDB(userUuid, organizationUuid);

            expect(findSessionUser).toHaveBeenCalledTimes(2);
            expect(sessionUserCache.set).not.toHaveBeenCalled();
        });
    });

    describe('findSessionUserByPersonalAccessToken', () => {
        const rotationConfig = {
            ...lightdashConfig,
            lightdashSecrets: {
                active: 'new secret',
                fallbacks: ['old secret', 'older secret'],
                all: ['new secret', 'old secret', 'older secret'],
            },
        } as unknown as LightdashConfig;

        const patRow = (tokenHash: string, uuid: string = 'pat-uuid') => ({
            ...userDetails,
            personal_access_token_uuid: uuid,
            token_hash: tokenHash,
            created_at: new Date('2024-01-01'),
            rotated_at: null,
            last_used_at: null,
            description: 'test token',
            expires_at: null,
            created_by_user_id: userDetails.user_id,
        });

        const mockDatabase = knex({ client: MockClient, dialect: 'pg' });
        let tracker: Tracker;

        const createPatUserModel = () => {
            const model = new UserModel({
                database: mockDatabase as unknown as Knex,
                lightdashConfig: rotationConfig,
                featureFlagModel,
            });
            (
                model as unknown as {
                    generateUserAbilityBuilder: () => Promise<unknown>;
                }
            ).generateUserAbilityBuilder = vi.fn(async () => ({
                abilityBuilder: { rules: [], build: () => ({}) },
                lightdashUser: { userUuid: userDetails.user_uuid },
            }));
            return model;
        };

        beforeAll(() => {
            tracker = getTracker();
        });

        afterEach(() => {
            tracker.reset();
            vi.clearAllMocks();
        });

        it('performs one bcrypt hash and one grouped query for an active match', async () => {
            tracker.on
                .select('users')
                .responseOnce([patRow('bcrypt:new secret:token')]);

            const result =
                await createPatUserModel().findSessionUserByPersonalAccessToken(
                    'token',
                );

            expect(result?.cacheHit).toBe(false);
            expect(hashWithSecret).toHaveBeenCalledTimes(1);
            expect(hashWithSecret).toHaveBeenCalledWith('token', 'new secret');
            expect(tracker.history.select).toHaveLength(1);
            expect(tracker.history.select[0].bindings).toEqual(
                expect.arrayContaining([
                    'bcrypt:new secret:token',
                    'sha256:token',
                ]),
            );
        });

        it('matches a legacy sha256 hash without extra bcrypt work', async () => {
            tracker.on.select('users').responseOnce([patRow('sha256:token')]);

            const result =
                await createPatUserModel().findSessionUserByPersonalAccessToken(
                    'token',
                );

            expect(hashWithSecret).toHaveBeenCalledTimes(1);
            expect(result?.data.personalAccessToken.uuid).toEqual('pat-uuid');
        });

        it('derives fallback hashes only after a miss and matches them in one grouped query', async () => {
            tracker.on.select('users').responseOnce([]);
            tracker.on
                .select('users')
                .responseOnce([patRow('bcrypt:old secret:token')]);

            const result =
                await createPatUserModel().findSessionUserByPersonalAccessToken(
                    'token',
                );

            expect(vi.mocked(hashWithSecret).mock.calls).toEqual([
                ['token', 'new secret'],
                ['token', 'old secret'],
                ['token', 'older secret'],
            ]);
            expect(tracker.history.select).toHaveLength(2);
            expect(tracker.history.select[1].bindings).toEqual(
                expect.arrayContaining([
                    'bcrypt:old secret:token',
                    'bcrypt:older secret:token',
                ]),
            );
            expect(result?.data.personalAccessToken.uuid).toEqual('pat-uuid');
        });

        it('prefers the earliest configured fallback when several rows match', async () => {
            tracker.on.select('users').responseOnce([]);
            tracker.on
                .select('users')
                .responseOnce([
                    patRow('bcrypt:older secret:token', 'older-pat-uuid'),
                    patRow('bcrypt:old secret:token', 'old-pat-uuid'),
                ]);

            const result =
                await createPatUserModel().findSessionUserByPersonalAccessToken(
                    'token',
                );

            expect(result?.data.personalAccessToken.uuid).toEqual(
                'old-pat-uuid',
            );
        });

        it('misses with a single grouped fallback query before returning undefined', async () => {
            tracker.on.select('users').response([]);

            const result =
                await createPatUserModel().findSessionUserByPersonalAccessToken(
                    'token',
                );

            expect(result).toBeUndefined();
            expect(vi.mocked(hashWithSecret).mock.calls).toEqual([
                ['token', 'new secret'],
                ['token', 'old secret'],
                ['token', 'older secret'],
            ]);
            expect(tracker.history.select).toHaveLength(2);
        });
    });
});
