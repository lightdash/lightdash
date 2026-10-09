import { ParameterError, WarehouseTypes } from '@lightdash/common';
import knex from 'knex';
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
