import { subject, type AbilityBuilder, type RawRuleOf } from '@casl/ability';
import {
    LightdashMode,
    LightdashUser,
    MemberAbility,
    OrganizationMemberRole,
    projectMemberAbilities,
    ProjectMemberRole,
    ServiceAccountScope,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { type LightdashConfig } from '../config/parseConfig';
import { EmailTableName } from '../database/entities/emails';
import { PasswordLoginTableName } from '../database/entities/passwordLogins';
import { UserTableName } from '../database/entities/users';
import { type FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import {
    mapDbUserDetailsToLightdashUser,
    UserModel,
    type DbUserDetails,
} from './UserModel';

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
});
