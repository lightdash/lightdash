import { LightdashUser } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';

const buildPatRow = (userUuid = 'user-uuid-1') => ({
    user_id: 1,
    user_uuid: userUuid,
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    is_active: true,
    is_setup_complete: true,
    is_marketing_opted_in: false,
    is_tracking_anonymized: false,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    organization_id: 1,
    organization_uuid: 'org-uuid-1',
    organization_name: 'Org',
    organization_created_at: new Date('2024-01-01'),
    chart_colors: null,
    needs_password: false,
    personal_access_token_uuid: 'pat-uuid-1',
    description: 'token',
    rotated_at: null,
    last_used_at: null,
    expires_at: null,
});

const stubAbilityBuilder = () => ({
    abilityBuilder: {
        rules: [],
        build: () => ({ rules: [] }),
    },
    lightdashUser: {
        userUuid: 'user-uuid-1',
        userId: 1,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: 'org-uuid-1',
        organizationName: 'Org',
        organizationCreatedAt: new Date('2024-01-01'),
        isActive: true,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        isSetupComplete: true,
        role: 'member',
        isPending: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
    } as unknown as LightdashUser,
});

describe('UserModel.findSessionUserByPersonalAccessToken cache (EXPERIMENTAL_CACHE=true)', () => {
    let UserModelClass: typeof import('./UserModel').UserModel;
    let database: Knex;
    let tracker: Tracker;
    let model: InstanceType<typeof UserModelClass>;
    let abilitySpy: jest.SpyInstance;

    beforeAll(() => {
        process.env.LIGHTDASH_SECRET = 'test-secret';
        process.env.EXPERIMENTAL_CACHE = 'true';
        jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
            UserModelClass = require('./UserModel').UserModel;
        });
    });

    beforeEach(() => {
        database = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        model = new UserModelClass({
            database,
            lightdashConfig: lightdashConfigMock,
        });
        abilitySpy = jest
            .spyOn(
                UserModelClass.prototype as unknown as {
                    generateUserAbilityBuilder: () => unknown;
                },
                'generateUserAbilityBuilder',
            )
            .mockImplementation(async () => stubAbilityBuilder());
    });

    afterEach(() => {
        tracker.reset();
        abilitySpy.mockRestore();
    });

    test('caches subsequent lookups for the same token', async () => {
        tracker.on
            .select('users')
            .responseOnce([buildPatRow('cache-hit-user')]);

        const first =
            await model.findSessionUserByPersonalAccessToken('token-cache-hit');
        const second =
            await model.findSessionUserByPersonalAccessToken('token-cache-hit');

        expect(first?.cacheHit).toBe(false);
        expect(second?.cacheHit).toBe(true);
        expect(tracker.history.select).toHaveLength(1);
        expect(abilitySpy).toHaveBeenCalledTimes(1);
        expect(second?.personalAccessToken.uuid).toBe('pat-uuid-1');
    });

    test('does not cache undefined results', async () => {
        tracker.on.select('users').response([]);

        const first =
            await model.findSessionUserByPersonalAccessToken('token-undefined');
        const second =
            await model.findSessionUserByPersonalAccessToken('token-undefined');

        expect(first).toBeUndefined();
        expect(second).toBeUndefined();
        expect(tracker.history.select).toHaveLength(2);
    });

    test('expires entries after TTL', async () => {
        jest.useFakeTimers();
        try {
            tracker.on
                .select('users')
                .response([buildPatRow('cache-ttl-user')]);

            await model.findSessionUserByPersonalAccessToken('token-ttl');
            jest.advanceTimersByTime(31_000);
            const afterExpiry =
                await model.findSessionUserByPersonalAccessToken('token-ttl');

            expect(afterExpiry?.cacheHit).toBe(false);
            expect(tracker.history.select).toHaveLength(2);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('UserModel.findSessionUserByPersonalAccessToken cache (EXPERIMENTAL_CACHE unset)', () => {
    let UserModelClass: typeof import('./UserModel').UserModel;
    let database: Knex;
    let tracker: Tracker;
    let model: InstanceType<typeof UserModelClass>;
    let abilitySpy: jest.SpyInstance;

    beforeAll(() => {
        process.env.LIGHTDASH_SECRET = 'test-secret';
        delete process.env.EXPERIMENTAL_CACHE;
        jest.isolateModules(() => {
            // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
            UserModelClass = require('./UserModel').UserModel;
        });
    });

    beforeEach(() => {
        database = knex({ client: MockClient, dialect: 'pg' });
        tracker = getTracker();
        model = new UserModelClass({
            database,
            lightdashConfig: lightdashConfigMock,
        });
        abilitySpy = jest
            .spyOn(
                UserModelClass.prototype as unknown as {
                    generateUserAbilityBuilder: () => unknown;
                },
                'generateUserAbilityBuilder',
            )
            .mockImplementation(async () => stubAbilityBuilder());
    });

    afterEach(() => {
        tracker.reset();
        abilitySpy.mockRestore();
    });

    test('hits the database every call when cache is disabled', async () => {
        tracker.on.select('users').response([buildPatRow('no-cache-user')]);

        const first =
            await model.findSessionUserByPersonalAccessToken('token-no-cache');
        const second =
            await model.findSessionUserByPersonalAccessToken('token-no-cache');

        expect(first?.cacheHit).toBe(false);
        expect(second?.cacheHit).toBe(false);
        expect(tracker.history.select).toHaveLength(2);
        expect(abilitySpy).toHaveBeenCalledTimes(2);
    });
});
