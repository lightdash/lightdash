import {
    BigqueryAuthenticationType,
    ParameterError,
    WarehouseTypes,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { AiServiceAccountCredentialsModel } from './AiServiceAccountCredentialsModel';

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
