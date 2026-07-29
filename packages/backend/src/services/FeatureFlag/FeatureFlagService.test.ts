import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    type PossibleAbilities,
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

const buildService = () => {
    const ensureOrganizationOverrideEnabled = vi.fn(async () => 'enabled');
    const featureFlagModel = {
        ensureOrganizationOverrideEnabled,
    } as unknown as FeatureFlagModel;
    const service = new FeatureFlagService({
        lightdashConfig: lightdashConfigMock,
        featureFlagModel,
    });
    return { service, ensureOrganizationOverrideEnabled };
};

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
});
