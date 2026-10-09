import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    OrganizationSnowflakeAgentClientsTableName as table,
    type DbOrganizationSnowflakeAgentClient,
} from '../database/entities/organizationSnowflakeAgentClients';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { OrganizationSnowflakeAgentClientModel } from './OrganizationSnowflakeAgentClientModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const encryptionUtil = new EncryptionUtil({
    lightdashConfig: lightdashConfigMock,
});
const model = new OrganizationSnowflakeAgentClientModel({
    database,
    encryptionUtil,
});
const input = {
    organizationUuid: 'org',
    accountUrl: 'https://abc.snowflakecomputing.com',
    accountIdentifier: 'abc',
    clientId: 'client',
    clientSecret: 'test-client-secret',
    userUuid: 'user',
};
const row = (): DbOrganizationSnowflakeAgentClient => ({
    organization_snowflake_agent_client_uuid: 'row',
    organization_uuid: input.organizationUuid,
    account_url: input.accountUrl,
    account_identifier: input.accountIdentifier,
    client_id: input.clientId,
    encrypted_client_secret: encryptionUtil.encrypt(input.clientSecret),
    client_version: 'original-version',
    created_at: new Date(),
    updated_at: new Date(),
    created_by_user_uuid: 'user',
    updated_by_user_uuid: 'user',
});
beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

test('reads metadata without selecting or returning the secret', async () => {
    tracker.on.select(table).response([row()]);
    const metadata = await model.getMetadata('org');
    expect(metadata).toMatchObject({
        accountUrl: input.accountUrl,
        clientId: input.clientId,
    });
    expect(metadata).not.toHaveProperty('encrypted_client_secret');
    expect(metadata).not.toHaveProperty('clientSecret');
    expect(tracker.history.select[0].sql).not.toContain(
        'encrypted_client_secret',
    );
});

test('returns null for a missing organization client', async () => {
    tracker.on.select(table).response([]);
    expect(await model.getMetadata('org')).toBeNull();
    expect(await model.getWithSecret('org')).toBeNull();
});

test('decrypts a saved secret with EncryptionUtil', async () => {
    tracker.on.select(table).response([row()]);
    expect(await model.getWithSecret('org')).toMatchObject({
        clientSecret: input.clientSecret,
    });
});

test('reports unreadable credentials without exposing ciphertext', async () => {
    tracker.on
        .select(table)
        .response([
            { ...row(), encrypted_client_secret: Buffer.from('corrupt') },
        ]);
    await expect(model.getWithSecret('org')).rejects.toThrow(
        'The saved Snowflake client secret could not be read. Replace the client credentials.',
    );
});

test.each([
    'identical',
    'accountUrl',
    'clientId',
    'clientSecret',
    'corrupt',
    'new',
] as const)(
    'encrypts a %s save and preserves only an unchanged client version',
    async (change) => {
        const existing = row();
        if (change === 'corrupt')
            existing.encrypted_client_secret = Buffer.from('corrupt');
        tracker.on.select(table).response(change === 'new' ? [] : [existing]);
        tracker.on.insert(table).response(change === 'new' ? [existing] : []);
        tracker.on.update(table).response([existing]);
        const changed = {
            ...input,
            ...(['accountUrl', 'clientId', 'clientSecret'].includes(change)
                ? { [change]: 'replacement' }
                : {}),
        };
        const result = await model.upsert(changed);
        const actions = {
            new: 'created',
            identical: 'unchanged',
            accountUrl: 'replaced',
            clientId: 'replaced',
            clientSecret: 'replaced',
            corrupt: 'replaced',
        };
        expect(result.action).toBe(actions[change]);
        expect(tracker.history.select).toHaveLength(change === 'new' ? 0 : 1);
        const query =
            change === 'new'
                ? tracker.history.insert[0]
                : tracker.history.update[0];
        const ciphertext = query.bindings.find((binding) =>
            Buffer.isBuffer(binding),
        );
        expect(ciphertext).toBeInstanceOf(Buffer);
        expect(encryptionUtil.decrypt(ciphertext as Buffer)).toBe(
            changed.clientSecret,
        );
        expect(query.bindings).not.toContain(changed.clientSecret);
        expect(tracker.history.insert[0].sql).toContain(
            'on conflict ("organization_uuid") do nothing returning *',
        );
        if (change !== 'new') {
            expect(tracker.history.select[0].sql).toContain('for update');
            expect(tracker.history.all.map(({ method }) => method)).toEqual([
                'insert',
                'select',
                'update',
            ]);
        }
        expect(query.bindings.includes('original-version')).toBe(
            change === 'identical',
        );
    },
);
