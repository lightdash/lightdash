import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { OrganizationAgentIdentitySettingsModel } from './OrganizationAgentIdentitySettingsModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const model = new OrganizationAgentIdentitySettingsModel({ database });
beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

test('defaults a missing organization row to false', async () => {
    tracker.on.select('organization_agent_identity_settings').response([]);
    expect(await model.get('org')).toEqual({
        requireVerifiedAgentSessions: false,
    });
    expect(tracker.history.select[0].bindings).toContain('org');
});

test.each([true, false])(
    'reads the stored organization setting %s',
    async (enabled) => {
        tracker.on
            .select('organization_agent_identity_settings')
            .response([{ require_verified_agent_sessions: enabled }]);
        expect(await model.get('org')).toEqual({
            requireVerifiedAgentSessions: enabled,
        });
    },
);

test.each([true, false])(
    'upserts and returns the stored setting %s',
    async (enabled) => {
        tracker.on
            .insert('organization_agent_identity_settings')
            .response([{ require_verified_agent_sessions: enabled }]);
        expect(
            await model.upsert('org', {
                requireVerifiedAgentSessions: enabled,
            }),
        ).toEqual({ requireVerifiedAgentSessions: enabled });
        expect(tracker.history.insert[0].sql).toContain(
            'on conflict ("organization_uuid") do update',
        );
        expect(tracker.history.insert[0].sql).toContain('"updated_at"');
        expect(tracker.history.insert[0].bindings).toContain('org');
        expect(tracker.history.insert[0].bindings).toContain(enabled);
    },
);
