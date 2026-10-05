import { LightdashMode } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { LightdashConfig } from '../config/parseConfig';
import { FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import { UserModel } from './UserModel';

const database = knex({ client: MockClient, dialect: 'pg' }) as Knex;
const model = new UserModel({
    database,
    lightdashConfig: { mode: LightdashMode.DEFAULT } as LightdashConfig,
    featureFlagModel: {} as FeatureFlagModel,
});
let tracker: Tracker;

beforeAll(() => {
    tracker = getTracker();
});
afterEach(() => {
    tracker.reset();
    vi.restoreAllMocks();
});

describe('UserModel AI identity cleanup', () => {
    it('deletes identities in the transaction that deactivates the user', async () => {
        tracker.on.update('users').responseOnce([{ user_id: 1 }]);
        tracker.on.delete('ai_identities').responseOnce(2);
        vi.spyOn(model, 'getUserDetailsByUuid').mockResolvedValue({
            userUuid: 'user',
        } as Awaited<ReturnType<UserModel['getUserDetailsByUuid']>>);
        await model.updateUser('user', 'person@example.com', {
            isActive: false,
        });
        expect(tracker.history.update[0].bindings).toContain(false);
        expect(tracker.history.delete[0].sql).toContain('ai_identities');
        expect(tracker.history.delete[0].bindings).toContain('user');
    });
});
