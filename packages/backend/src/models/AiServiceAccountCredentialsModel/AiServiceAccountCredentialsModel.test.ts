import {
    BigqueryAuthenticationType,
    DatabricksAuthenticationType,
    ParameterError,
    WarehouseTypes,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { generateKeyPairSync } from 'node:crypto';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AiServiceAccountCredentialsModel,
    parseAiServiceAccountSecrets,
} from './AiServiceAccountCredentialsModel';
import {
    snowflakeEncryptedKey,
    snowflakeKeyPair,
    snowflakePassphrase,
    snowflakeSecrets,
    snowflakeVerification,
} from './AiServiceAccountCredentialsModel.mock';

const secrets = {
    type: WarehouseTypes.BIGQUERY,
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {
        type: 'service_account',
        private_key: 'key',
        client_email: 'agent@example.com',
    },
};
const row = {
    ai_service_account_credential_uuid: 'slot',
    identity_uuid: 'generation',
    project_uuid: 'project',
    warehouse_connection_uuid: null,
    kind: 'ai_service_account',
    scope: 'connection',
    warehouse_type: WarehouseTypes.BIGQUERY,
    authentication_method: 'private_key',
    created_by_user_uuid: 'creator',
    updated_by_user_uuid: 'updater',
    credential_subject_user_uuid: null,
    created_at: new Date(),
    updated_at: new Date(),
    encrypted_credentials: Buffer.from('encrypted'),
};

describe('AI service account credential reads', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const decrypt = vi.fn();
    const model = new AiServiceAccountCredentialsModel({
        database,
        encryptionUtil: { decrypt } as unknown as EncryptionUtil,
    });
    let tracker: Tracker;
    beforeAll(() => {
        tracker = getTracker();
    });
    beforeEach(() => {
        decrypt.mockReset().mockReturnValue(JSON.stringify(secrets));
    });
    afterEach(() => {
        tracker.reset();
    });
    afterAll(async () => {
        await database.destroy();
    });
    it('selects metadata only and never decrypts', async () => {
        tracker.on.select('ai_service_account_credentials').responseOnce([row]);
        const slot = await model.getSlot('project', null);
        expect(slot).toEqual({
            uuid: 'slot',
            identityUuid: 'generation',
            projectUuid: 'project',
            warehouseConnectionUuid: null,
            kind: 'ai_service_account',
            scope: 'connection',
            warehouseType: WarehouseTypes.BIGQUERY,
            method: 'private_key',
            createdByUserUuid: 'creator',
            updatedByUserUuid: 'updater',
            credentialSubjectUserUuid: null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
        expect(decrypt).not.toHaveBeenCalled();
        expect(tracker.history.select[0].sql).not.toContain(
            'encrypted_credentials',
        );
    });
    it('reads execution secrets and generation from one row', async () => {
        tracker.on.select('ai_service_account_credentials').responseOnce([row]);
        const saved = await model.getSecrets('project', null, true);
        expect(saved?.slot).toMatchObject({
            uuid: 'slot',
            identityUuid: 'generation',
        });
        expect(saved?.secrets).toEqual(secrets);
        expect(tracker.history.select).toHaveLength(1);
        expect(decrypt).toHaveBeenCalledOnce();
    });
    it('decrypts only through getSecrets', async () => {
        tracker.on.select('ai_service_account_credentials').responseOnce([row]);
        expect(await model.getSecrets('project', null)).toEqual(secrets);
        expect(decrypt).toHaveBeenCalledWith(row.encrypted_credentials);
    });
    it.each([
        'not json secret',
        '{"keyfileContents":{"private_key":"secret"}}',
    ])('returns a typed safe error for corrupt payloads', async (payload) => {
        tracker.on.select('ai_service_account_credentials').responseOnce([row]);
        decrypt.mockReturnValue(payload);
        await expect(model.getSecrets('project', null)).rejects.toBeInstanceOf(
            ParameterError,
        );
    });
    it('rejects metadata that disagrees with the payload', async () => {
        tracker.on
            .select('ai_service_account_credentials')
            .responseOnce([{ ...row, authentication_method: 'oauth_m2m' }]);
        await expect(model.getSecrets('project', null)).rejects.toThrow(
            'could not be read',
        );
    });
    it('returns null for absent metadata and secrets', async () => {
        tracker.on.select('ai_service_account_credentials').response([]);
        expect(await model.getSlot('project', 'extra')).toBeNull();
        expect(await model.getSecrets('project', 'extra')).toBeNull();
        expect(decrypt).not.toHaveBeenCalled();
    });
});

const databricksSecrets = {
    type: WarehouseTypes.DATABRICKS,
    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
    oauthClientId: 'client-id',
    oauthClientSecret: ' client-secret ',
} as const;
const verification = {
    ok: true,
    principal: 'principal-uuid',
    observed: { currentUser: 'principal-uuid' },
    message: 'checked',
    checkedAt: new Date('2026-10-09T00:00:00Z'),
};
describe('Databricks encrypted observations', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const decrypt = vi.fn();
    const encrypt = vi.fn().mockReturnValue(Buffer.from('new-ciphertext'));
    const model = new AiServiceAccountCredentialsModel({
        database,
        encryptionUtil: { decrypt, encrypt } as unknown as EncryptionUtil,
    });
    const databricksRow = {
        ...row,
        warehouse_type: WarehouseTypes.DATABRICKS,
        authentication_method: 'oauth_m2m',
    };
    beforeEach(() => {
        tracker.reset();
        encrypt.mockClear();
        decrypt
            .mockReset()
            .mockReturnValue(
                JSON.stringify({ ...databricksSecrets, verification }),
            );
    });
    afterAll(async () => database.destroy());
    it('keeps observations out of execution secrets and metadata', async () => {
        tracker.on
            .select('ai_service_account_credentials')
            .response([databricksRow]);
        expect(await model.getSecrets('project', null)).toEqual(
            databricksSecrets,
        );
        expect(
            await model.getVerification('project', null, 'generation'),
        ).toEqual(verification);
        const metadata = await model.getSlot('project', null);
        expect(metadata).toMatchObject({ method: 'oauth_m2m' });
        expect(JSON.stringify(metadata)).not.toMatch(
            /client-secret|client-id|verification/,
        );
    });
    it('accepts legacy slots without a verification', async () => {
        decrypt.mockReturnValue(JSON.stringify(databricksSecrets));
        tracker.on
            .select('ai_service_account_credentials')
            .response([databricksRow]);
        expect(
            await model.getVerification('project', null, 'generation'),
        ).toBeNull();
        expect(await model.getSecrets('project', null)).toEqual(
            databricksSecrets,
        );
    });
    it.each([
        { ...verification, ok: false },
        { ...verification, principal: 'different' },
        {
            ...verification,
            observed: { currentUser: 'principal-uuid', token: 'secret' },
        },
        { ...verification, observed: { currentUser: ' ' }, principal: ' ' },
        { ...verification, checkedAt: 'invalid' },
        { ...verification, token: 'secret' },
    ])(
        'rejects corrupt observations without exposing secrets',
        async (observation) => {
            decrypt.mockReturnValue(
                JSON.stringify({
                    ...databricksSecrets,
                    verification: observation,
                }),
            );
            tracker.on
                .select('ai_service_account_credentials')
                .response([databricksRow]);
            expect(
                await model.getVerification('project', null, 'generation'),
            ).toBeNull();
            expect(
                await model.getReplaceableSecrets('project', null),
            ).toBeNull();
            await expect(model.getSecrets('project', null)).rejects.toThrow(
                'could not be read',
            );
        },
    );
    it.each([false, true])(
        'changes the generation only when identity changes: %s',
        async (changed) => {
            tracker.on
                .select('projects')
                .response([{ project_uuid: 'project' }]);
            tracker.on
                .select('ai_service_account_credentials')
                .response([databricksRow]);
            tracker.on
                .insert('ai_service_account_credentials')
                .response([databricksRow]);
            await model.upsert(
                'project',
                null,
                {
                    ...databricksSecrets,
                    oauthClientSecret: changed
                        ? 'replacement'
                        : databricksSecrets.oauthClientSecret,
                },
                'actor',
                verification,
            );
            const { bindings } = tracker.history.insert[0];
            expect(bindings.includes('generation')).toBe(!changed);
            expect(bindings).not.toContain(databricksSecrets.oauthClientSecret);
            expect(JSON.parse(encrypt.mock.calls[0][0])).toMatchObject({
                verification: { principal: 'principal-uuid' },
            });
        },
    );
    it('updates only ciphertext under the expected generation row lock', async () => {
        tracker.on
            .select('ai_service_account_credentials')
            .response([databricksRow]);
        tracker.on.update('ai_service_account_credentials').response(1);
        await model.updateVerification(
            'project',
            null,
            'generation',
            verification,
        );
        expect(tracker.history.select[0].sql).toContain('for update');
        expect(tracker.history.select[0].bindings).toContain('generation');
        expect(tracker.history.update[0].sql).toContain(
            'set "encrypted_credentials" = $1',
        );
        expect(tracker.history.update[0].sql).not.toMatch(
            /"identity_uuid" = \$\d,|"updated_at" =/,
        );
        expect(tracker.history.update[0].bindings).toContain('generation');
    });
    it('ignores a late Test after replacement and a status read for an old generation', async () => {
        tracker.on.select('ai_service_account_credentials').response([]);
        await model.updateVerification(
            'project',
            null,
            'old-generation',
            verification,
        );
        expect(
            await model.getVerification('project', null, 'old-generation'),
        ).toBeNull();
        expect(encrypt).not.toHaveBeenCalled();
        expect(decrypt).not.toHaveBeenCalled();
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.select[0].bindings).toContain('old-generation');
    });
    it('does not persist a failed verification', async () => {
        await expect(
            model.updateVerification('project', null, 'generation', {
                ...verification,
                ok: false,
            }),
        ).rejects.toThrow();
        await expect(
            model.upsert('project', null, databricksSecrets, 'actor', {
                ...verification,
                ok: false,
            }),
        ).rejects.toThrow();
        expect(encrypt).not.toHaveBeenCalled();
        expect(tracker.history.select).toHaveLength(0);
    });
});

describe('Snowflake credential payloads', () => {
    it.each([
        snowflakeSecrets,
        {
            ...snowflakeSecrets,
            privateKey: snowflakeEncryptedKey,
            privateKeyPass: snowflakePassphrase,
        },
    ])(
        'accepts usable RSA private keys without changing stored material',
        (credentials) => {
            expect(parseAiServiceAccountSecrets(credentials)).toEqual(
                credentials,
            );
        },
    );
    it.each([
        { privateKey: 'malformed' },
        {
            privateKey: snowflakeKeyPair.publicKey
                .export({ format: 'pem', type: 'spki' })
                .toString(),
        },
        {
            privateKey: generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
                .privateKey.export({ format: 'pem', type: 'pkcs8' })
                .toString(),
        },
        { privateKey: snowflakeEncryptedKey },
        { privateKey: snowflakeEncryptedKey, privateKeyPass: 'wrong' },
        { user: ' ' },
        { role: '' },
        { warehouse: '\t' },
        { account: 'routing' },
        { database: 'routing' },
        { token: 'unknown' },
        { verification: snowflakeVerification },
    ])(
        'rejects invalid or non-credential fields without exposing values',
        (override) => {
            expect(() =>
                parseAiServiceAccountSecrets({
                    ...snowflakeSecrets,
                    ...override,
                }),
            ).toThrow(ParameterError);
            try {
                parseAiServiceAccountSecrets({
                    ...snowflakeSecrets,
                    ...override,
                });
            } catch (error) {
                expect(String(error)).not.toMatch(/BEGIN|wrong|routing/);
            }
        },
    );
    const database = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const decrypt = vi.fn();
    const encrypt = vi.fn().mockReturnValue(Buffer.from('new-ciphertext'));
    const model = new AiServiceAccountCredentialsModel({
        database,
        encryptionUtil: { decrypt, encrypt } as unknown as EncryptionUtil,
    });
    const snowRow = { ...row, warehouse_type: WarehouseTypes.SNOWFLAKE };
    beforeEach(() => {
        tracker.reset();
        encrypt.mockClear();
        decrypt.mockReset().mockReturnValue(
            JSON.stringify({
                ...snowflakeSecrets,
                verification: snowflakeVerification,
            }),
        );
    });
    afterAll(async () => database.destroy());
    it('projects the observation separately from execution secrets', async () => {
        tracker.on.select('ai_service_account_credentials').response([snowRow]);
        expect(await model.getSecrets('project', null)).toEqual(
            snowflakeSecrets,
        );
        expect(
            await model.getVerification('project', null, 'generation'),
        ).toEqual(snowflakeVerification);
    });
    it.each([true, false])(
        'reports readability without an observation, readable=%s',
        async (readable) => {
            decrypt.mockReturnValue(
                readable ? JSON.stringify(snowflakeSecrets) : 'bad payload',
            );
            tracker.on
                .select('ai_service_account_credentials')
                .response([snowRow]);
            expect(
                await model.getCredentialsReadable(
                    'project',
                    null,
                    'generation',
                ),
            ).toBe(readable);
            expect(
                await model.getVerification('project', null, 'generation'),
            ).toBeNull();
            expect(tracker.history.select[0].sql).toContain(
                '"identity_uuid" =',
            );
            expect(tracker.history.select[0].bindings).toContain('generation');
        },
    );
    it('reports absent or replaced credentials as unreadable', async () => {
        expect(await model.getCredentialsReadable('project', null, null)).toBe(
            false,
        );
        expect(tracker.history.select).toHaveLength(0);
        tracker.on.select('ai_service_account_credentials').response([]);
        expect(
            await model.getCredentialsReadable(
                'project',
                null,
                'old-generation',
            ),
        ).toBe(false);
        expect(decrypt).not.toHaveBeenCalled();
    });
    it('reports inconsistent credential metadata as unreadable', async () => {
        tracker.on
            .select('ai_service_account_credentials')
            .response([{ ...snowRow, authentication_method: 'oauth_m2m' }]);
        expect(
            await model.getCredentialsReadable('project', null, 'generation'),
        ).toBe(false);
    });
    it('propagates database errors while checking readability', async () => {
        tracker.on
            .select('ai_service_account_credentials')
            .simulateError('database unavailable');
        await expect(
            model.getCredentialsReadable('project', null, 'generation'),
        ).rejects.toThrow('database unavailable');
    });
    it('reads a Snowflake payload without an observation', async () => {
        decrypt.mockReturnValue(JSON.stringify(snowflakeSecrets));
        tracker.on.select('ai_service_account_credentials').response([snowRow]);
        expect(
            await model.getVerification('project', null, 'generation'),
        ).toBeNull();
        expect(await model.getSecrets('project', null)).toEqual(
            snowflakeSecrets,
        );
    });
    it('keeps corrupt slots repairable but refuses execution', async () => {
        decrypt.mockReturnValue('bad payload');
        tracker.on.select('ai_service_account_credentials').response([snowRow]);
        expect(
            await model.getVerification('project', null, 'generation'),
        ).toBeNull();
        expect(await model.getReplaceableSecrets('project', null)).toBeNull();
        expect(await model.getSlot('project', null)).toMatchObject({
            uuid: 'slot',
        });
        await expect(model.getSecrets('project', null)).rejects.toThrow(
            'could not be read',
        );
    });
    it.each([false, true])(
        'rotates generation only when credentials change: %s',
        async (changed) => {
            tracker.on
                .select('projects')
                .response([{ project_uuid: 'project' }]);
            tracker.on
                .select('ai_service_account_credentials')
                .response([snowRow]);
            tracker.on
                .insert('ai_service_account_credentials')
                .response([snowRow]);
            await model.upsert(
                'project',
                null,
                {
                    ...snowflakeSecrets,
                    role: changed ? 'NEW_ROLE' : snowflakeSecrets.role,
                },
                'actor',
                { ...snowflakeVerification, checkedAt: new Date() },
            );
            const { bindings } = tracker.history.insert[0];
            if (changed) expect(bindings).not.toContain('generation');
            else expect(bindings).toContain('generation');
            expect(bindings).not.toContain(snowflakeSecrets.privateKey);
            expect(JSON.parse(encrypt.mock.calls[0][0])).toMatchObject({
                privateKey: snowflakeSecrets.privateKey,
                verification: { principal: 'OBSERVED_USER' },
            });
        },
    );
    it('writes observations under a generation lock without changing identity', async () => {
        tracker.on.select('ai_service_account_credentials').response([snowRow]);
        tracker.on.update('ai_service_account_credentials').response(1);
        await model.updateVerification(
            'project',
            null,
            'generation',
            snowflakeVerification,
        );
        expect(tracker.history.select[0].sql).toContain('for update');
        expect(tracker.history.select[0].bindings).toContain('generation');
        expect(tracker.history.update[0].sql).toContain(
            'set "encrypted_credentials" = $1',
        );
        expect(tracker.history.update[0].bindings).toContain('generation');
    });
    it('does not annotate a replacement after an old test completes', async () => {
        tracker.on.select('ai_service_account_credentials').response([]);
        await model.updateVerification(
            'project',
            null,
            'old-generation',
            snowflakeVerification,
        );
        expect(encrypt).not.toHaveBeenCalled();
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.select[0].bindings).toContain('old-generation');
    });
    it('requires the slot warehouse to match the original connection in missing-slot lookup', async () => {
        tracker.on
            .select('projects')
            .response([{ projectUuid: 'missing', name: 'Missing' }]);
        expect(
            await model.findProjectsMissingSlot(
                'org',
                WarehouseTypes.SNOWFLAKE,
            ),
        ).toEqual([{ projectUuid: 'missing', name: 'Missing' }]);
        expect(tracker.history.select[0].sql).toContain(
            '"ai_service_account_credentials"."warehouse_type" = $4',
        );
        expect(
            tracker.history.select[0].bindings.filter(
                (value) => value === WarehouseTypes.SNOWFLAKE,
            ),
        ).toHaveLength(2);
    });
});
