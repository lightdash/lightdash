import { ParameterError, WarehouseTypes } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { OrganizationAgentIdentityRulesModel } from './OrganizationAgentIdentityRulesModel';

const database = knex({ client: 'pg' });
const model = new OrganizationAgentIdentityRulesModel({ database });
const transaction = vi.spyOn(database, 'transaction');
afterAll(async () => {
    await database.destroy();
});

test.each([
    [WarehouseTypes.SNOWFLAKE, 'ai_service_account'],
    [WarehouseTypes.BIGQUERY, 'agent_sign_in'],
    [WarehouseTypes.DATABRICKS, 'agent_sign_in'],
    [WarehouseTypes.POSTGRES, 'agent_sign_in'],
    [WarehouseTypes.POSTGRES, 'ai_service_account'],
] as const)(
    'rejects %s source %s before opening a transaction',
    async (type, source) => {
        await expect(model.set('org', type, { source })).rejects.toBeInstanceOf(
            ParameterError,
        );
        expect(transaction).not.toHaveBeenCalled();
    },
);

test('persists the Databricks source for both actor kinds', async () => {
    const db = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    tracker.reset();
    try {
        tracker.on
            .select('organizations')
            .response([{ organization_uuid: 'org' }]);
        tracker.on.select('organization_agent_identity_rules').response([]);
        tracker.on.insert('organization_agent_identity_rules').response([]);
        const rules = new OrganizationAgentIdentityRulesModel({ database: db });
        expect(
            await rules.set('org', WarehouseTypes.DATABRICKS, {
                source: 'ai_service_account',
            }),
        ).toEqual({ previousSource: 'marked_person', changed: true });
        const { bindings } = tracker.history.insert[0];
        expect(bindings).toContain('person');
        expect(bindings).toContain('service_account');
        expect(bindings.filter((value) => value === 'databricks')).toHaveLength(
            2,
        );
        expect(
            bindings.filter((value) => value === 'ai_service_account'),
        ).toHaveLength(3);
    } finally {
        tracker.reset();
        await db.destroy();
    }
});
