import { AiIdentityStatus } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { AiIdentityModel } from './AiIdentityModel';

const database = knex({ client: MockClient, dialect: 'pg' }) as Knex;
const encryptionUtil = {
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
} as EncryptionUtil;
const model = new AiIdentityModel({ database, encryptionUtil });
let tracker: Tracker;

beforeAll(() => {
    tracker = getTracker();
});
afterEach(() => {
    tracker.reset();
});

const row = {
    ai_identity_uuid: 'identity',
    project_uuid: 'project',
    user_uuid: 'user',
    snowflake_login: 'LOGIN',
    twin_name_override: null,
    public_key: 'KEY',
    public_key_fingerprint: 'SHA256:KEY',
    encrypted_private_key: Buffer.from('PRIVATE'),
    status: AiIdentityStatus.PENDING,
    status_message: null,
    checked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    email: 'person@example.com',
    first_name: 'First',
    last_name: 'Last',
    ai_twin_name_template: '{snowflake_login}_AI',
};

describe('AiIdentityModel', () => {
    it('lists identities with a resolved name and without private keys', async () => {
        tracker.on.select('ai_identities').responseOnce([row]);
        const identities = await model.list('project');
        expect(identities).toMatchObject([
            { twinName: 'LOGIN_AI', email: 'person@example.com' },
        ]);
        expect(identities[0]).not.toHaveProperty('privateKey');
    });

    it('decrypts the private key only for the private lookup', async () => {
        tracker.on.select('ai_identities').responseOnce([row]);
        expect(
            await model.findWithPrivateKey({
                projectUuid: 'project',
                userUuid: 'user',
            }),
        ).toMatchObject({ privateKey: 'PRIVATE' });
    });

    it('resets checks when the naming template changes', async () => {
        tracker.on.update('projects').responseOnce(1);
        tracker.on.update('ai_identities').responseOnce(2);
        await expect(
            model.updateSettings('project', {
                twinNameTemplate: 'AI_{snowflake_login}',
            }),
        ).resolves.toEqual({ twinNameTemplate: 'AI_{snowflake_login}' });
        expect(tracker.history.update[1].bindings).toContain(
            AiIdentityStatus.PENDING,
        );
    });

    it('ignores a duplicate insert and returns the existing identity', async () => {
        tracker.on.insert('ai_identities').responseOnce([]);
        tracker.on.select('ai_identities').responseOnce([row]);
        const identity = await model.create({
            projectUuid: 'project',
            userUuid: 'user',
            snowflakeLogin: null,
            publicKey: 'KEY',
            privateKey: 'PRIVATE',
        });
        expect(identity.aiIdentityUuid).toBe('identity');
        expect(tracker.history.insert[0].sql).toContain('on conflict');
        expect(tracker.history.insert[0].bindings).not.toContain('PRIVATE');
    });

    it('regenerates the key and clears the prior check', async () => {
        tracker.on.update('ai_identities').responseOnce(1);
        tracker.on
            .select('ai_identities')
            .responseOnce([{ ...row, public_key: 'NEW' }]);
        await model.regenerateKey('identity', {
            publicKey: 'TkVX',
            privateKey: 'NEW PRIVATE',
        });
        expect(tracker.history.update[0].bindings).toContain(
            AiIdentityStatus.PENDING,
        );
        expect(tracker.history.update[0].bindings).not.toContain('NEW PRIVATE');
    });
});
