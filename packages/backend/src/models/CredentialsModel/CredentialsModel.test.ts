import {
    NotFoundError,
    sensitiveCredentialsFieldNames,
    type CredentialMetadata,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { createEncryptionUtil } from './credentialCodec.mock';
import { CredentialsModel } from './CredentialsModel';

type AssertNever<T extends never> = T;
type SensitiveMetadataKey = AssertNever<
    Extract<
        keyof CredentialMetadata,
        (typeof sensitiveCredentialsFieldNames)[number] | 'identity'
    >
>;

const row = {
    credential_uuid: 'credential',
    organization_uuid: 'organization',
    owner_kind: 'organization',
    owner_user_uuid: null,
    owner_project_uuid: null,
    owner_warehouse_connection_uuid: null,
    purpose: 'shared_login',
    warehouse_type: 'snowflake',
    auth_mode: 'password',
    subject_user_uuid: null,
    subject_label: null,
    issuer_credential_uuid: null,
    oauth_grant_uuid: null,
    generation: 'generation',
    expires_at: null,
    rotated_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    created_by_user_uuid: null,
    updated_by_user_uuid: null,
};

describe('CredentialsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new CredentialsModel({
        database,
        encryptionUtil: createEncryptionUtil(),
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    afterEach(() => tracker.reset());
    afterAll(async () => database.destroy());

    test('returns only API metadata and does not select identity or ciphertext', async () => {
        expectTypeOf<SensitiveMetadataKey>().toEqualTypeOf<never>();
        tracker.on.select('credentials').response([row]);
        const metadata = await model.getMetadata('credential');
        expect(metadata).toMatchObject({
            uuid: 'credential',
            generation: 'generation',
        });
        expect(metadata).not.toHaveProperty('identity');
        for (const key of sensitiveCredentialsFieldNames)
            expect(metadata).not.toHaveProperty(key);
        expect(Object.keys(metadata)).toHaveLength(20);
        expect(tracker.history.select[0].sql).not.toContain('identity');
        expect(tracker.history.select[0].sql).not.toContain(
            'encrypted_secrets',
        );
        expect(tracker.history.select[0].sql).not.toContain('*');
    });
    test('throws NotFoundError for a missing credential', async () => {
        tracker.on.select('credentials').response([]);
        await expect(model.getMetadata('missing')).rejects.toThrow(
            NotFoundError,
        );
        await expect(model.getIdentity('missing')).rejects.toThrow(
            NotFoundError,
        );
        await expect(model.getSecretsForResolution('missing')).rejects.toThrow(
            NotFoundError,
        );
    });
    test('returns null for missing bindings and token state', async () => {
        tracker.on.select('credential_bindings').response([]);
        tracker.on.select('credential_token_state').response([]);
        expect(
            await model.findBinding({
                projectUuid: 'project',
                warehouseConnectionUuid: null,
                slot: 'shared_login',
                userUuid: null,
            }),
        ).toBeNull();
        expect(await model.findTokenState('missing')).toBeNull();
    });
    test('compares the token version in SQL and reports a stale write', async () => {
        tracker.on.update('credential_token_state').responseOnce(0);
        expect(
            await model.compareAndSwapRefreshToken(
                'credential',
                '9007199254740993',
                'secret-refresh',
                null,
            ),
        ).toBe(false);
        const query = tracker.history.update[0];
        expect(query.sql).toContain('"credential_uuid" =');
        expect(query.sql).toContain('"version" =');
        expect(query.sql).toContain('version + 1');
        expect(query.bindings).toContain('9007199254740993');
        expect(query.bindings).not.toContain('secret-refresh');
    });
    test.each(['-1', '1.5', '9007199254740993.5', '9223372036854775808'])(
        'rejects an invalid bigint version %s',
        async (version) => {
            await expect(
                model.compareAndSwapRefreshToken(
                    'credential',
                    version,
                    'secret-refresh',
                    null,
                ),
            ).rejects.toThrow('nonnegative bigint');
            expect(tracker.history.update).toHaveLength(0);
        },
    );
});
