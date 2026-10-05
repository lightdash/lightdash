import {
    AiIdentityFailureReason,
    AiIdentitySort,
    AiIdentityState,
    AiIdentityStatus,
} from '@lightdash/common';
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
    ai_identity_account_uuid: 'account',
    user_uuid: 'user',
    snowflake_login: 'LOGIN',
    twin_name_override: null,
    public_key: 'KEY',
    public_key_fingerprint: 'SHA256:KEY',
    encrypted_private_key: Buffer.from('PRIVATE'),
    status: AiIdentityStatus.PENDING,
    failure_reason: null,
    status_message: null,
    checked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    email: 'person@example.com',
    first_name: 'First',
    last_name: 'Last',
    snowflake_account: 'ACCT',
    twin_name_template: '{snowflake_login}_AI',
};

const filter = {
    aiIdentityAccountUuid: 'account',
    states: [] as AiIdentityState[],
    reasons: [] as AiIdentityFailureReason[],
    projectUuid: null,
    search: null,
    staleOnly: false,
};

describe('AiIdentityModel', () => {
    it('finds an identity by account and person without returning its private key', async () => {
        tracker.on.select('ai_identities').responseOnce([row]);
        const identity = await model.find({
            aiIdentityAccountUuid: 'account',
            userUuid: 'user',
        });
        expect(identity).toMatchObject({
            twinName: 'LOGIN_AI',
            snowflakeAccount: 'ACCT',
        });
        expect(identity).not.toHaveProperty('privateKey');
        expect(tracker.history.select[0].sql).toContain(
            'ai_identity_account_uuid',
        );
        expect(tracker.history.select[0].sql).not.toContain(
            'encrypted_private_key',
        );
    });

    it('derives needs_sign_in when neither login nor override exists', async () => {
        tracker.on
            .select('ai_identities')
            .responseOnce([{ ...row, snowflake_login: null }]);
        expect(
            await model.find({
                aiIdentityAccountUuid: 'account',
                userUuid: 'user',
            }),
        ).toMatchObject({
            state: AiIdentityState.NEEDS_SIGN_IN,
            publicKey: 'KEY',
        });
    });

    it('decrypts only for a private lookup', async () => {
        tracker.on.select('ai_identities').responseOnce([row]);
        expect(
            await model.findWithPrivateKey({
                aiIdentityAccountUuid: 'account',
                userUuid: 'user',
            }),
        ).toMatchObject({ privateKey: 'PRIVATE' });
        expect(tracker.history.select[0].sql).toContain(
            'encrypted_private_key',
        );
    });

    it('applies state, reason, search and stale filters in SQL before pagination', async () => {
        tracker.on.select('ai_identities').responseOnce([]);
        tracker.on.select('ai_identities').responseOnce([]);
        await model.list(
            {
                ...filter,
                states: [AiIdentityState.FAILED],
                reasons: [AiIdentityFailureReason.PUBLIC_KEY_NOT_SET],
                search: 'first',
                staleOnly: true,
            },
            AiIdentitySort.SEVERITY,
            'asc',
            2,
            20,
        );
        const sql = tracker.history.select.map((query) => query.sql).join(' ');
        expect(sql).toContain('ILIKE');
        expect(sql).toContain('failure_reason');
        expect(sql).toContain('INTERVAL');
        expect(sql).toContain('limit');
        expect(tracker.history.select.at(-1)?.bindings).toContain(20);
    });

    it('filters project members through the existing access SQL', async () => {
        tracker.on.select('ai_identities').responseOnce([]);
        tracker.on.select('ai_identities').responseOnce([]);
        await model.list(
            { ...filter, projectUuid: 'project' },
            AiIdentitySort.SEVERITY,
            'asc',
            1,
            20,
        );
        const sql = tracker.history.select.map((query) => query.sql).join(' ');
        expect(sql).toContain('project_group_access');
        expect(tracker.history.select[0].bindings).toContain('project');
    });

    it('stores encrypted keys and resets the prior check', async () => {
        tracker.on.update('ai_identities').responseOnce(1);
        tracker.on
            .select('ai_identities')
            .responseOnce([{ ...row, public_key: 'TkVX' }]);
        await model.setKeys('identity', {
            publicKey: 'TkVX',
            privateKey: 'NEW PRIVATE',
        });
        expect(tracker.history.update[0].bindings).toContain(
            AiIdentityStatus.PENDING,
        );
        expect(tracker.history.update[0].bindings).not.toContain('NEW PRIVATE');
    });
});
