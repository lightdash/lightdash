import knex, { type Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { type LightdashConfig } from '../../config/parseConfig';
import { deprecatedHash, hashWithSecret } from '../../utils/hash';
import { ServiceAccountModel } from './ServiceAccountModel';

vi.mock('../../utils/hash', () => ({
    hash: vi.fn(async (s: string) => `bcrypt:env:${s}`),
    hashWithSecret: vi.fn(
        async (s: string, secret: string) => `bcrypt:${secret}:${s}`,
    ),
    deprecatedHash: vi.fn((s: string) => `sha256:${s}`),
}));

const lightdashConfig = {
    lightdashSecrets: {
        active: 'new secret',
        fallbacks: ['old secret', 'older secret'],
        all: ['new secret', 'old secret', 'older secret'],
    },
} as unknown as Pick<LightdashConfig, 'lightdashSecrets'>;

const serviceAccountRow = (tokenHash: string, uuid: string = 'sa-uuid') => ({
    service_account_uuid: uuid,
    token_hash: tokenHash,
    organization_uuid: 'org-uuid',
    created_at: new Date('2024-01-01'),
    description: 'test account',
    expires_at: null,
    created_by_user_uuid: null,
    rotated_at: null,
    rotated_by_user_uuid: null,
    last_used_at: null,
    scopes: [],
    service_account_user_uuid: 'sa-user-uuid',
    role_uuid: null,
    creator_user_uuid: null,
    creator_first_name: null,
    creator_last_name: null,
});

describe('ServiceAccountModel token lookup', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new ServiceAccountModel({
        database: database as unknown as Knex,
        lightdashConfig,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.clearAllMocks();
    });

    test('an active-hash match performs one bcrypt hash and one query', async () => {
        tracker.on
            .select('service_accounts')
            .responseOnce([serviceAccountRow('bcrypt:new secret:token')]);

        const match = await model.findByToken('token');

        expect(match?.uuid).toEqual('sa-uuid');
        expect(hashWithSecret).toHaveBeenCalledTimes(1);
        expect(hashWithSecret).toHaveBeenCalledWith('token', 'new secret');
        expect(tracker.history.select).toHaveLength(1);
    });

    test('the first query groups the active and legacy hashes', async () => {
        tracker.on
            .select('service_accounts')
            .responseOnce([serviceAccountRow('bcrypt:new secret:token')]);

        await model.findByToken('token');

        expect(tracker.history.select[0].bindings).toEqual(
            expect.arrayContaining(['bcrypt:new secret:token', 'sha256:token']),
        );
    });

    test('a legacy sha256 match performs one bcrypt hash', async () => {
        tracker.on
            .select('service_accounts')
            .responseOnce([serviceAccountRow('sha256:token')]);

        const match = await model.findByToken('token');

        expect(hashWithSecret).toHaveBeenCalledTimes(1);
        expect(deprecatedHash).toHaveBeenCalledWith('token');
        expect(match?.uuid).toEqual('sa-uuid');
    });

    test('fallback hashes are derived only after a miss and matched in one grouped query', async () => {
        tracker.on.select('service_accounts').responseOnce([]);
        tracker.on
            .select('service_accounts')
            .responseOnce([serviceAccountRow('bcrypt:old secret:token')]);

        const match = await model.findByToken('token');

        expect(vi.mocked(hashWithSecret).mock.calls).toEqual([
            ['token', 'new secret'],
            ['token', 'old secret'],
            ['token', 'older secret'],
        ]);
        expect(tracker.history.select).toHaveLength(2);
        expect(tracker.history.select[1].bindings).toEqual(
            expect.arrayContaining([
                'bcrypt:old secret:token',
                'bcrypt:older secret:token',
            ]),
        );
        expect(match?.uuid).toEqual('sa-uuid');
    });

    test('the earliest configured fallback wins when several rows match', async () => {
        tracker.on.select('service_accounts').responseOnce([]);
        tracker.on
            .select('service_accounts')
            .responseOnce([
                serviceAccountRow('bcrypt:older secret:token', 'older-sa-uuid'),
                serviceAccountRow('bcrypt:old secret:token', 'old-sa-uuid'),
            ]);

        const match = await model.findByToken('token');

        expect(match?.uuid).toEqual('old-sa-uuid');
    });

    test('a full miss uses a single grouped fallback query and returns undefined', async () => {
        tracker.on.select('service_accounts').response([]);

        const match = await model.findByToken('token');

        expect(match).toBeUndefined();
        expect(vi.mocked(hashWithSecret).mock.calls).toEqual([
            ['token', 'new secret'],
            ['token', 'old secret'],
            ['token', 'older secret'],
        ]);
        expect(tracker.history.select).toHaveLength(2);
    });
});
