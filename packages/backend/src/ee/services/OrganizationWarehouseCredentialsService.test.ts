import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { describe, expect, test, vi } from 'vitest';
import { buildAccount } from '../../services/ProjectService/ProjectService.mock';
import { OrganizationWarehouseCredentialsService } from './OrganizationWarehouseCredentialsService';

const account = buildAccount();
account.user.ability = new Ability<PossibleAbilities>([
    { action: 'manage', subject: 'OrganizationWarehouseCredentials' },
]);

const credentials = {
    type: WarehouseTypes.SNOWFLAKE,
    authenticationType: SnowflakeAuthenticationType.SSO,
    account: 'account',
    user: 'person',
    warehouse: 'warehouse',
    database: 'database',
    schema: 'schema',
};

const buildService = (enabled: boolean) => {
    const saved = {
        organizationWarehouseCredentialsUuid: 'credential',
        warehouseType: WarehouseTypes.SNOWFLAKE,
    };
    const create = vi.fn(async () => saved);
    const update = vi.fn(async () => saved);
    const getByUuidWithSensitiveData = vi.fn(async () => ({
        organizationUuid: account.organization.organizationUuid,
        credentials,
    }));
    const getRefreshToken = vi.fn(async () => 'person-token');
    const service = new OrganizationWarehouseCredentialsService({
        analytics: { track: vi.fn() } as never,
        organizationWarehouseCredentialsModel: {
            create,
            update,
            getByUuidWithSensitiveData,
        } as never,
        userOAuthGrantsModel: { getRefreshToken } as never,
        featureFlagModel: {
            get: vi.fn(
                async ({ featureFlagId }: { featureFlagId: string }) => ({
                    id: featureFlagId,
                    enabled:
                        enabled &&
                        featureFlagId === FeatureFlags.PersonalSignInSetup,
                }),
            ),
        } as never,
    });
    return { service, create, update, getRefreshToken };
};

describe('organization shared sign-in policy', () => {
    test('refuses new Snowflake person tokens when enabled', async () => {
        const { service, create, update, getRefreshToken } = buildService(true);
        await expect(
            service.create(account, { name: 'shared', credentials } as never),
        ).rejects.toThrow(
            'A shared connection can only use a service account.',
        );
        await expect(
            service.update(account, 'credential', { credentials } as never),
        ).rejects.toThrow(
            'A shared connection can only use a service account.',
        );
        expect(getRefreshToken).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    test('preserves a legacy shared token on a metadata edit', async () => {
        const { service, update, getRefreshToken } = buildService(true);
        await service.update(account, 'credential', { name: 'renamed' });
        expect(update).toHaveBeenCalledWith(
            'credential',
            expect.objectContaining({ name: 'renamed', credentials }),
        );
        expect(getRefreshToken).not.toHaveBeenCalled();
    });

    test('keeps flag-off token resolution', async () => {
        const { service, create, update, getRefreshToken } =
            buildService(false);
        await service.create(account, { name: 'shared', credentials } as never);
        await service.update(account, 'credential', { name: 'renamed' });
        expect(getRefreshToken).toHaveBeenCalledTimes(2);
        expect(create).toHaveBeenCalledWith(
            account.organization.organizationUuid,
            expect.objectContaining({
                credentials: expect.objectContaining({
                    refreshToken: 'person-token',
                }),
            }),
            account.user.id,
        );
        expect(update).toHaveBeenCalledWith(
            'credential',
            expect.objectContaining({
                credentials: expect.objectContaining({
                    refreshToken: 'person-token',
                }),
            }),
        );
    });
});
