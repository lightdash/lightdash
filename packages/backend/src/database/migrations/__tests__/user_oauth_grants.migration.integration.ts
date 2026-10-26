import { NotFoundError, OpenIdIdentityIssuerType } from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { UserModel } from '../../../models/UserModel';
import { UserOAuthGrantsModel } from '../../../models/UserOAuthGrantsModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { UserOAuthGrantsTableName } from '../../entities/userOAuthGrants';

let migrated: MigratedDatabase;

beforeAll(async () => {
    migrated = await createMigratedDatabase();
});

afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [user] = await database('users')
        .insert({
            first_name: 'user_a',
            last_name: 'user_a',
            is_marketing_opted_in: false,
            is_tracking_anonymized: true,
            is_setup_complete: true,
            is_active: true,
        })
        .returning('*');
    const encryptionUtil = new EncryptionUtil({
        lightdashConfig: lightdashConfigMock,
    });
    const userModel = new UserModel({
        database,
        lightdashConfig: lightdashConfigMock,
        featureFlagModel: new FeatureFlagModel({
            database,
            lightdashConfig: lightdashConfigMock,
        }),
    });
    const model = new UserOAuthGrantsModel({
        database,
        encryptionUtil,
        userModel,
    });
    const grant = {
        userUuid: user.user_uuid,
        provider: OpenIdIdentityIssuerType.GOOGLE as const,
        subject: 'subject_a',
        email: 'email_a',
        scopes: ['scope_a'],
        refreshToken: 'token_a',
    };
    const getRow = () =>
        database(UserOAuthGrantsTableName)
            .where({ user_uuid: grant.userUuid, provider: grant.provider })
            .first();
    return { database, user, userModel, encryptionUtil, model, grant, getRow };
};

test('replaces a stored token and its identity when a new token is returned', async () => {
    const f = await fixture();
    await f.model.upsertGrant(f.grant);
    await f.model.upsertGrant({
        ...f.grant,
        subject: 'subject_b',
        email: 'email_b',
        scopes: ['scope_b'],
        refreshToken: 'token_b',
    });

    expect(
        await f.model.getRefreshToken(f.grant.userUuid, f.grant.provider),
    ).toBe('token_b');
    const row = await f.getRow();
    expect(row).toMatchObject({
        provider_subject: 'subject_b',
        provider_email: 'email_b',
    });
    expect(row!.scopes.sort()).toEqual(['scope_a', 'scope_b']);
});

test.each([
    { subject: 'subject_a', email: 'email_a' },
    { subject: 'subject_b', email: 'email_b' },
])(
    'keeps a stored token bound to its saved identity for an empty response from $subject',
    async (identity) => {
        const f = await fixture();
        await f.model.upsertGrant(f.grant);
        const original = await f.getRow();

        await f.model.upsertGrant({
            ...f.grant,
            ...identity,
            scopes: ['scope_b'],
            refreshToken: '',
        });

        expect(
            await f.model.getRefreshToken(f.grant.userUuid, f.grant.provider),
        ).toBe('token_a');
        expect(await f.getRow()).toEqual(original);
    },
);

test.each(['legacy_token_a', ''])(
    'keeps the current fallback behaviour for legacy token %s',
    async (legacyToken) => {
        const f = await fixture();
        await f.database('openid_identities').insert({
            issuer: f.user.user_uuid,
            issuer_type: f.grant.provider,
            subject: 'subject_a',
            email: 'email_a',
            user_id: f.user.user_id,
            refresh_token: legacyToken,
        });

        await f.model.upsertGrant({ ...f.grant, refreshToken: '' });

        expect(
            await f.model.getRefreshToken(f.grant.userUuid, f.grant.provider),
        ).toBe(legacyToken);
        if (legacyToken) {
            expect(await f.getRow()).toBeUndefined();
        } else {
            expect(await f.getRow()).toMatchObject({
                provider_subject: 'subject_a',
                provider_email: 'email_a',
            });
        }
    },
);

test('keeps the current empty-token insert behaviour when no token exists', async () => {
    const f = await fixture();
    await expect(
        f.model.getRefreshToken(f.grant.userUuid, f.grant.provider),
    ).rejects.toBeInstanceOf(NotFoundError);

    await f.model.upsertGrant({ ...f.grant, refreshToken: '' });

    expect(
        await f.model.getRefreshToken(f.grant.userUuid, f.grant.provider),
    ).toBe('');
    expect(await f.getRow()).toMatchObject({
        provider_subject: 'subject_a',
        provider_email: 'email_a',
        scopes: ['scope_a'],
    });
    await f.model.upsertGrant(f.grant);
    expect(
        await f.model.getRefreshToken(f.grant.userUuid, f.grant.provider),
    ).toBe('token_a');
});

test('an empty callback cannot overwrite a concurrently inserted fresh token', async () => {
    const f = await fixture();
    const transaction = await f.database.transaction();
    const writer = new UserOAuthGrantsModel({
        database: transaction,
        encryptionUtil: f.encryptionUtil,
        userModel: f.userModel,
    });
    let emptyWrite: Promise<void> | undefined;
    try {
        const { rows } = await transaction.raw<{ rows: { pid: number }[] }>(
            'SELECT pg_backend_pid() AS pid',
        );
        await writer.upsertGrant({ ...f.grant, refreshToken: 'token_b' });
        emptyWrite = f.model.upsertGrant({
            ...f.grant,
            subject: 'subject_b',
            email: 'email_b',
            refreshToken: '',
        });
        await expect
            .poll(
                async () => {
                    const result = await f.database.raw<{
                        rows: { blocked: boolean }[];
                    }>(
                        'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))) AS blocked',
                        [rows[0].pid],
                    );
                    return result.rows[0].blocked;
                },
                { timeout: 5000 },
            )
            .toBe(true);
        await transaction.commit();
        await emptyWrite;
    } finally {
        await transaction.rollback();
        await emptyWrite;
    }

    expect(
        await f.model.getRefreshToken(f.grant.userUuid, f.grant.provider),
    ).toBe('token_b');
    expect(await f.getRow()).toMatchObject({
        provider_subject: 'subject_a',
        provider_email: 'email_a',
    });
});

test('updates an observed empty grant to the callback identity with main merge semantics', async () => {
    const f = await fixture();
    await f.model.upsertGrant({ ...f.grant, refreshToken: '' });
    await f
        .database(UserOAuthGrantsTableName)
        .where({ user_uuid: f.grant.userUuid })
        .update({ updated_at: new Date(0) });
    const original = await f.getRow();

    await f.model.upsertGrant({
        ...f.grant,
        subject: 'subject_b',
        email: 'email_b',
        scopes: ['scope_b'],
        refreshToken: '',
    });

    const row = await f.getRow();
    expect(row!.user_oauth_grant_uuid).toBe(original!.user_oauth_grant_uuid);
    expect(row!.created_at).toEqual(original!.created_at);
    expect(row!.provider_subject).toBe('subject_b');
    expect(row!.provider_email).toBe('email_b');
    expect(row!.scopes.sort()).toEqual(['scope_a', 'scope_b']);
    expect(row!.updated_at.getTime()).toBeGreaterThan(
        original!.updated_at.getTime(),
    );
    expect(
        row!.encrypted_refresh_token.equals(original!.encrypted_refresh_token),
    ).toBe(false);
    expect(f.encryptionUtil.decrypt(row!.encrypted_refresh_token) === '').toBe(
        true,
    );
    expect(
        (await f.model.getRefreshToken(f.grant.userUuid, f.grant.provider)) ===
            '',
    ).toBe(true);
});

test('a fresh update wins over a paused callback that observed an empty grant', async () => {
    const f = await fixture();
    await f.model.upsertGrant({ ...f.grant, refreshToken: '' });
    const decrypt = f.encryptionUtil.decrypt.bind(f.encryptionUtil);
    let observed!: () => void;
    const observation = new Promise<void>((resolve) => {
        observed = resolve;
    });
    const encrypt = f.encryptionUtil.encrypt.bind(f.encryptionUtil);
    const emptyEncryption = vi
        .spyOn(f.encryptionUtil, 'encrypt')
        .mockImplementationOnce((value) => {
            observed();
            return encrypt(value);
        });
    const transaction = await f.database.transaction();
    const writer = new UserOAuthGrantsModel({
        database: transaction,
        encryptionUtil: new EncryptionUtil({
            lightdashConfig: lightdashConfigMock,
        }),
        userModel: f.userModel,
    });
    let emptyWrite: Promise<void> | undefined;
    try {
        const { rows } = await transaction.raw<{ rows: { pid: number }[] }>(
            'SELECT pg_backend_pid() AS pid',
        );
        await writer.upsertGrant({
            ...f.grant,
            subject: 'subject_fresh',
            email: 'email_fresh',
            scopes: ['scope_fresh'],
            refreshToken: 'token_fresh',
        });
        const fresh = await transaction(UserOAuthGrantsTableName)
            .where({ user_uuid: f.grant.userUuid })
            .first();
        emptyWrite = f.model.upsertGrant({
            ...f.grant,
            subject: 'subject_stale',
            email: 'email_stale',
            scopes: ['scope_stale'],
            refreshToken: '',
        });
        await observation;
        await expect
            .poll(
                async () => {
                    const result = await f.database.raw<{
                        rows: { blocked: boolean }[];
                    }>(
                        'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ? = ANY(pg_blocking_pids(pid))) AS blocked',
                        [rows[0].pid],
                    );
                    return result.rows[0].blocked;
                },
                { timeout: 5000 },
            )
            .toBe(true);
        await transaction.commit();
        await emptyWrite;
        expect(JSON.stringify(await f.getRow()) === JSON.stringify(fresh)).toBe(
            true,
        );
        expect(
            decrypt((await f.getRow())!.encrypted_refresh_token) ===
                'token_fresh',
        ).toBe(true);
    } finally {
        await transaction.rollback();
        await emptyWrite;
        emptyEncryption.mockRestore();
    }
});
