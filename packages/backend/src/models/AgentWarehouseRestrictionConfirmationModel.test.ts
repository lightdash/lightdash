import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { AgentWarehouseRestrictionConfirmationModel } from './AgentWarehouseRestrictionConfirmationModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const tracker = getTracker();
const model = new AgentWarehouseRestrictionConfirmationModel({ database });
const row = {
    project_uuid: 'project',
    binding_fingerprint: 'binding',
    confirmed_by_user_uuid: 'user',
    confirmed_at: new Date(),
};
const confirmation = {
    projectUuid: 'project',
    bindingFingerprint: 'binding',
    confirmedByUserUuid: 'user',
    confirmedAt: row.confirmed_at,
};
beforeEach(() => tracker.reset());
afterAll(async () => database.destroy());

test('returns no confirmation for a project without a stored assurance', async () => {
    tracker.on.select('agent_warehouse_restriction_confirmations').response([]);
    expect(await model.get('project')).toBeNull();
});

test('reads the binding fingerprint and confirming user', async () => {
    tracker.on
        .select('agent_warehouse_restriction_confirmations')
        .response([row]);
    expect(await model.get('project')).toEqual(confirmation);
    expect(tracker.history.select[0].bindings).toContain('project');
});

test('replaces the stored fingerprint and refreshes the confirmation time', async () => {
    tracker.on
        .insert('agent_warehouse_restriction_confirmations')
        .response([row]);
    expect(
        await model.upsert({
            projectUuid: 'project',
            bindingFingerprint: 'binding',
            confirmedByUserUuid: 'user',
        }),
    ).toEqual(confirmation);
    expect(tracker.history.insert[0].sql).toContain(
        'on conflict ("project_uuid") do update',
    );
    expect(tracker.history.insert[0].sql).toContain('"confirmed_at"');
});

test('deletes only the target project confirmation', async () => {
    tracker.on.delete('agent_warehouse_restriction_confirmations').response(1);
    await model.delete('project');
    expect(tracker.history.delete[0].bindings).toEqual(['project']);
});
