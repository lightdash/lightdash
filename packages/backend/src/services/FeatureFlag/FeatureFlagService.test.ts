import { Ability } from '@casl/ability';
import {
    ALL_FEATURE_FLAG_IDS,
    OrganizationMemberRole,
    type PossibleAbilities,
    type RegisteredAccount,
    type SessionUser,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { FeatureFlagService } from './FeatureFlagService';

const organizationUuid = '00000000-0000-0000-0000-000000000001';
const now = new Date('2026-07-29T00:00:00Z');

const buildUser = (ability: Ability<PossibleAbilities>): SessionUser =>
    ({
        userUuid: '00000000-0000-0000-0000-000000000002',
        organizationUuid,
        organizationName: 'Organization',
        organizationCreatedAt: now,
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        userId: 1,
        role: OrganizationMemberRole.ADMIN,
        ability,
        abilityRules: [],
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        avatarUrl: null,
        avatarGradient: null,
        isSetupComplete: true,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        timezone: null,
    }) as unknown as SessionUser;

const buildService = ({
    previewFeatureFlagsEnabled = false,
}: { previewFeatureFlagsEnabled?: boolean } = {}) => {
    const ensureOrganizationOverrideEnabled = vi.fn(async () => 'enabled');
    const upsertOrganizationOverride = vi.fn(async () => {});
    const deleteOrganizationOverride = vi.fn(async () => {});
    const get = vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
        id: featureFlagId,
        enabled: true,
    }));
    const featureFlagModel = {
        ensureOrganizationOverrideEnabled,
        upsertOrganizationOverride,
        deleteOrganizationOverride,
        get,
    } as unknown as FeatureFlagModel;
    const service = new FeatureFlagService({
        lightdashConfig: {
            ...lightdashConfigMock,
            previewFeatureFlags: { enabled: previewFeatureFlagsEnabled },
        },
        featureFlagModel,
    });
    return {
        service,
        ensureOrganizationOverrideEnabled,
        upsertOrganizationOverride,
        deleteOrganizationOverride,
        get,
    };
};

const adminAbility = () =>
    new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Organization' },
    ]);

const buildAccount = (ability: Ability<PossibleAbilities>) =>
    ({
        organization: { organizationUuid, name: 'Organization' },
        user: { userUuid: '00000000-0000-0000-0000-000000000002', ability },
        authentication: { type: 'session' },
        isAnonymousUser: () => false,
        isServiceAccount: () => false,
    }) as unknown as RegisteredAccount;

describe('FeatureFlagService', () => {
    describe('ensureOrganizationOverrideEnabled', () => {
        it('delegates to the model for an organization admin', async () => {
            const { service, ensureOrganizationOverrideEnabled } =
                buildService();
            const user = buildUser(
                new Ability<PossibleAbilities>([
                    { action: 'manage', subject: 'Organization' },
                ]),
            );

            await expect(
                service.ensureOrganizationOverrideEnabled({
                    user,
                    featureFlagId: 'homepage-builder',
                }),
            ).resolves.toBe('enabled');
            expect(
                ensureOrganizationOverrideEnabled,
            ).toHaveBeenCalledExactlyOnceWith(
                'homepage-builder',
                organizationUuid,
            );
        });

        it('rejects a user without manage permission on the organization', async () => {
            const { service, ensureOrganizationOverrideEnabled } =
                buildService();
            const user = buildUser(
                new Ability<PossibleAbilities>([
                    { action: 'view', subject: 'Project' },
                ]),
            );

            expect(() =>
                service.ensureOrganizationOverrideEnabled({
                    user,
                    featureFlagId: 'homepage-builder',
                }),
            ).toThrow("You don't have access to this resource or action");
            expect(ensureOrganizationOverrideEnabled).not.toHaveBeenCalled();
        });

        it('rejects a user without an organization', async () => {
            const { service, ensureOrganizationOverrideEnabled } =
                buildService();
            const user = {
                ...buildUser(
                    new Ability<PossibleAbilities>([
                        { action: 'manage', subject: 'Organization' },
                    ]),
                ),
                organizationUuid: undefined,
            } as unknown as SessionUser;

            expect(() =>
                service.ensureOrganizationOverrideEnabled({
                    user,
                    featureFlagId: 'homepage-builder',
                }),
            ).toThrow('User is not part of an organization');
            expect(ensureOrganizationOverrideEnabled).not.toHaveBeenCalled();
        });
    });

    describe('preview flag management', () => {
        it('upserts an organization override and returns the resolved flag', async () => {
            const { service, upsertOrganizationOverride } = buildService({
                previewFeatureFlagsEnabled: true,
            });

            await expect(
                service.setOrganizationOverride({
                    account: buildAccount(adminAbility()),
                    featureFlagId: 'enable-data-apps',
                    enabled: false,
                }),
            ).resolves.toEqual({ id: 'enable-data-apps', enabled: true });
            expect(upsertOrganizationOverride).toHaveBeenCalledExactlyOnceWith(
                'enable-data-apps',
                organizationUuid,
                false,
            );
        });

        it('deletes an organization override', async () => {
            const { service, deleteOrganizationOverride } = buildService({
                previewFeatureFlagsEnabled: true,
            });

            await service.deleteOrganizationOverride({
                account: buildAccount(adminAbility()),
                featureFlagId: 'enable-data-apps',
            });
            expect(deleteOrganizationOverride).toHaveBeenCalledExactlyOnceWith(
                'enable-data-apps',
                organizationUuid,
            );
        });

        it('rejects an unknown flag id without writing', async () => {
            const { service, upsertOrganizationOverride } = buildService({
                previewFeatureFlagsEnabled: true,
            });

            await expect(
                service.setOrganizationOverride({
                    account: buildAccount(adminAbility()),
                    featureFlagId: 'enable-data-app',
                    enabled: true,
                }),
            ).rejects.toThrow('Unknown feature flag "enable-data-app"');
            expect(upsertOrganizationOverride).not.toHaveBeenCalled();
        });

        it('lists every known flag without recording a flag check', async () => {
            const { service, get } = buildService({
                previewFeatureFlagsEnabled: true,
            });

            const results = await service.list(buildAccount(adminAbility()));

            expect(results.map(({ id }) => id)).toEqual([
                ...ALL_FEATURE_FLAG_IDS,
            ]);
            expect(get).toHaveBeenCalledTimes(ALL_FEATURE_FLAG_IDS.length);
            expect(get).toHaveBeenLastCalledWith(expect.anything(), {
                recordCheck: false,
            });
        });

        it('is unavailable outside preview environments', async () => {
            const { service, upsertOrganizationOverride } = buildService();
            const account = buildAccount(adminAbility());

            await expect(service.list(account)).rejects.toThrow(
                'only available in preview environments',
            );
            await expect(
                service.setOrganizationOverride({
                    account,
                    featureFlagId: 'enable-data-apps',
                    enabled: true,
                }),
            ).rejects.toThrow('only available in preview environments');
            expect(upsertOrganizationOverride).not.toHaveBeenCalled();
        });

        it('rejects a user without manage permission on the organization', async () => {
            const { service, upsertOrganizationOverride } = buildService({
                previewFeatureFlagsEnabled: true,
            });
            const account = buildAccount(
                new Ability<PossibleAbilities>([
                    { action: 'view', subject: 'Project' },
                ]),
            );

            await expect(
                service.setOrganizationOverride({
                    account,
                    featureFlagId: 'enable-data-apps',
                    enabled: true,
                }),
            ).rejects.toThrow(
                "You don't have access to this resource or action",
            );
            expect(upsertOrganizationOverride).not.toHaveBeenCalled();
        });
    });
});
