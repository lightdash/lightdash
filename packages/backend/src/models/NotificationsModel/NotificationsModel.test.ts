import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { NotificationsTableName } from '../../database/entities/notifications';
import { NotificationsModel } from './NotificationsModel';

describe('NotificationsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new NotificationsModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('only updates allowed notification fields', async () => {
        tracker.on.update(NotificationsTableName).responseOnce(1);

        await model.updateNotification('notification-uuid', {
            viewed: true,
            user_uuid: 'attacker-user-uuid',
        } as unknown as Parameters<
            NotificationsModel['updateNotification']
        >[1]);

        const [query] = tracker.history.update;
        expect(query.sql).toContain(NotificationsTableName);
        expect(query.sql).toContain('viewed');
        expect(query.sql).not.toContain('user_uuid');
        expect(query.bindings).not.toContain('attacker-user-uuid');
    });
});
