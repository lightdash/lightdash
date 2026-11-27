import { OpenIdIdentityIssuerType, SEED_ORG_1_ADMIN } from '@lightdash/common';
import { Knex } from 'knex';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserOAuthGrantsModel } from '../../models/UserOAuthGrantsModel';
import { UserOAuthGrantsTableName } from '../entities/userOAuthGrants';
import { UserTableName } from '../entities/users';
import { seed } from './development/19_google_sheets_dev_grant';

vi.mock('../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

const mockDatabase = (
    admin: { user_uuid: string } | undefined,
    grant?: { provider_subject: string },
) => {
    const where = vi.fn((table: string) => ({
        where: vi.fn().mockReturnThis(),
        first: vi
            .fn()
            .mockResolvedValue(table === UserTableName ? admin : grant),
    }));
    return { database: where as unknown as Knex, query: where };
};

const admin = { user_uuid: SEED_ORG_1_ADMIN.user_uuid };

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('Google Sheets development grant seed', () => {
    it('does not query the database without a token', async () => {
        vi.stubEnv('GOOGLE_SHEETS_DEV_REFRESH_TOKEN', undefined);
        const { database, query } = mockDatabase(admin);
        await seed(database);
        expect(query).not.toHaveBeenCalled();
    });

    it('does not write a grant if the seeded admin is missing', async () => {
        vi.stubEnv('GOOGLE_SHEETS_DEV_REFRESH_TOKEN', 'fake-refresh');
        const { database, query } = mockDatabase(undefined);
        const upsert = vi.spyOn(UserOAuthGrantsModel.prototype, 'upsertGrant');
        await seed(database);
        expect(query).toHaveBeenCalledExactlyOnceWith(UserTableName);
        expect(upsert).not.toHaveBeenCalled();
    });

    it('preserves a grant that was connected through the UI', async () => {
        vi.stubEnv('GOOGLE_SHEETS_DEV_REFRESH_TOKEN', 'fake-refresh');
        const { database, query } = mockDatabase(admin, {
            provider_subject: 'connected-account',
        });
        const upsert = vi.spyOn(UserOAuthGrantsModel.prototype, 'upsertGrant');
        await seed(database);
        expect(query).toHaveBeenCalledWith(UserOAuthGrantsTableName);
        expect(upsert).not.toHaveBeenCalled();
    });

    it.each([undefined, { provider_subject: 'rainbow-sheets-test' }])(
        'upserts the seeded grant with the Sheets consent scopes',
        async (grant) => {
            vi.stubEnv('GOOGLE_SHEETS_DEV_REFRESH_TOKEN', 'fake-refresh');
            const { database } = mockDatabase(admin, grant);
            const upsert = vi
                .spyOn(UserOAuthGrantsModel.prototype, 'upsertGrant')
                .mockResolvedValue(undefined);
            await seed(database);
            expect(upsert).toHaveBeenCalledExactlyOnceWith({
                userUuid: admin.user_uuid,
                provider: OpenIdIdentityIssuerType.GOOGLE,
                subject: 'rainbow-sheets-test',
                email: 'rainbow-sheets-test@example.invalid',
                scopes: [
                    'https://www.googleapis.com/auth/drive.file',
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/userinfo.email',
                    'https://www.googleapis.com/auth/userinfo.profile',
                    'openid',
                ],
                refreshToken: 'fake-refresh',
            });
        },
    );
});
