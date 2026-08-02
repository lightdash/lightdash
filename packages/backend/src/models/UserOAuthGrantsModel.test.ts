import { OpenIdIdentityIssuerType } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { UserOAuthGrantsTableName } from '../database/entities/userOAuthGrants';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { UserModel } from './UserModel';
import { UserOAuthGrantsModel } from './UserOAuthGrantsModel';

const userUuid = '11111111-1111-4111-8111-111111111111';
const secondUserUuid = '22222222-2222-4222-8222-222222222222';
const providerSubject = 'shared-google-subject';
const providerEmail = 'shared@example.com';

describe('UserOAuthGrantsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: { lightdashSecret: 'test-secret' },
    });
    const userModel = {
        getRefreshToken: vi.fn<UserModel['getRefreshToken']>(
            async () => 'legacy-refresh-token',
        ),
    };
    const model = new UserOAuthGrantsModel({
        database: database as unknown as Knex,
        encryptionUtil,
        userModel,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.clearAllMocks();
    });

    it('encrypts refresh tokens and unions scopes when upserting', async () => {
        tracker.on.insert(UserOAuthGrantsTableName).responseOnce([]);

        await model.upsertGrant({
            userUuid,
            provider: OpenIdIdentityIssuerType.GOOGLE,
            subject: providerSubject,
            email: providerEmail,
            scopes: ['scope-a', 'scope-a', 'scope-b'],
            refreshToken: 'refresh-token',
        });

        const query = tracker.history.insert[0];
        const encryptedRefreshToken = query.bindings.find((binding) =>
            Buffer.isBuffer(binding),
        );

        expect(query.sql).toContain(
            'on conflict ("user_uuid", "provider") do update',
        );
        expect(query.sql).toContain('unnest');
        expect(query.bindings).toContainEqual(['scope-a', 'scope-b']);
        expect(encryptedRefreshToken).toBeInstanceOf(Buffer);
        expect(encryptionUtil.decrypt(encryptedRefreshToken as Buffer)).toBe(
            'refresh-token',
        );
    });

    it('decrypts a stored refresh token', async () => {
        const encryptedRefreshToken = encryptionUtil.encrypt('refresh-token');
        tracker.on
            .select(UserOAuthGrantsTableName)
            .responseOnce([{ encrypted_refresh_token: encryptedRefreshToken }]);

        await expect(
            model.getRefreshToken(userUuid, OpenIdIdentityIssuerType.GOOGLE),
        ).resolves.toBe('refresh-token');
        expect(userModel.getRefreshToken).not.toHaveBeenCalled();
    });

    it('falls back to the legacy identity refresh token', async () => {
        tracker.on.select(UserOAuthGrantsTableName).responseOnce([]);

        await expect(
            model.getRefreshToken(userUuid, OpenIdIdentityIssuerType.GOOGLE),
        ).resolves.toBe('legacy-refresh-token');
        expect(userModel.getRefreshToken).toHaveBeenCalledWith(
            userUuid,
            OpenIdIdentityIssuerType.GOOGLE,
        );
    });

    it('stores grants for two users sharing one provider account', async () => {
        tracker.on.insert(UserOAuthGrantsTableName).response([]);

        await Promise.all(
            [userUuid, secondUserUuid].map((grantUserUuid) =>
                model.upsertGrant({
                    userUuid: grantUserUuid,
                    provider: OpenIdIdentityIssuerType.GOOGLE,
                    subject: providerSubject,
                    email: providerEmail,
                    scopes: ['scope-a'],
                    refreshToken: `refresh-token-${grantUserUuid}`,
                }),
            ),
        );

        expect(tracker.history.insert).toHaveLength(2);
        expect(tracker.history.insert[0].bindings).toContain(userUuid);
        expect(tracker.history.insert[1].bindings).toContain(secondUserUuid);
        expect(
            tracker.history.insert.every((query) =>
                query.bindings.includes(providerSubject),
            ),
        ).toBe(true);
    });
});
