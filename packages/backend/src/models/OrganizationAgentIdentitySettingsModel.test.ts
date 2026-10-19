import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { OrganizationAgentIdentityRulesModel } from './OrganizationAgentIdentityRulesModel';
import { OrganizationAgentIdentitySettingsModel } from './OrganizationAgentIdentitySettingsModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const model = new OrganizationAgentIdentitySettingsModel({
    database,
    rulesModel: new OrganizationAgentIdentityRulesModel({ database }),
});
beforeEach(() => {
    tracker.reset();
});
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

test.each([
    { previous: undefined, required: true, previousRequired: false },
    { previous: undefined, required: false, previousRequired: false },
    { previous: false, required: true, previousRequired: false },
    { previous: true, required: false, previousRequired: true },
    { previous: true, required: true, previousRequired: true },
])(
    'upserts $previous -> $required and returns the previous value',
    async ({ previous, required, previousRequired }) => {
        tracker.on
            .select('organizations')
            .response([{ organization_uuid: 'org' }]);
        tracker.on
            .select('organization_agent_identity_settings')
            .response(
                previous === undefined
                    ? []
                    : [{ require_verified_agent_sessions: previous }],
            );
        tracker.on.insert('organization_agent_identity_rules').response([]);
        tracker.on
            .insert('organization_agent_identity_settings')
            .response([{ require_verified_agent_sessions: required }]);
        expect(
            await model.upsert('org', {
                requireVerifiedAgentSessions: required,
            }),
        ).toEqual({
            settings: { requireVerifiedAgentSessions: required },
            changed: previousRequired !== required,
            previousSource: previousRequired
                ? 'agent_sign_in'
                : 'marked_person',
        });
        expect(tracker.history.select[0].sql).toContain('for update');
        expect(tracker.history.select[0].bindings).toContain('org');
        expect(tracker.history.select[1].bindings).toContain('org');
        expect(tracker.history.insert[1].sql).toContain(
            'on conflict ("organization_uuid") do update',
        );
        expect(tracker.history.insert[1].sql).toContain('"updated_at"');
        expect(tracker.history.insert[1].bindings).toContain('org');
        expect(tracker.history.insert[1].bindings).toContain(required);
        expect(tracker.history.insert[0].bindings).toContain(
            required ? 'agent_sign_in' : 'marked_person',
        );
        expect(tracker.history.insert[0].sql).not.toContain('"required"');
    },
);

test('legacy false replaces an AI slot rule and reports the actual prior source', async () => {
    tracker.reset();
    tracker.on.select('organizations').response([{ organization_uuid: 'org' }]);
    tracker.on.select('organization_agent_identity_settings').response([
        {
            source: 'ai_service_account',
            require_verified_agent_sessions: false,
            timestamps_match: true,
        },
    ]);
    tracker.on.insert('organization_agent_identity_rules').response([]);
    tracker.on.insert('organization_agent_identity_settings').response([]);
    expect(
        await model.upsert('org', { requireVerifiedAgentSessions: false }),
    ).toEqual({
        settings: { requireVerifiedAgentSessions: false },
        previousSource: 'ai_service_account',
        changed: true,
    });
    expect(tracker.history.insert[0].bindings).toContain('marked_person');
});
