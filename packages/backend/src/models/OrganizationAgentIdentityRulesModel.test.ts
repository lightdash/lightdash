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

describe('Snowflake persisted rules', () => {
    const db = knex({ client: MockClient, dialect: 'pg' });
    const tracker = getTracker();
    const rules = new OrganizationAgentIdentityRulesModel({ database: db });
    beforeEach(() => tracker.reset());
    afterAll(async () => db.destroy());
    test.each([
        'marked_person',
        'agent_sign_in',
        'ai_service_account',
    ] as const)(
        'stored %s wins over the legacy flag for both actors and list',
        async (source) => {
            tracker.on
                .select('organization_agent_identity_rules')
                .response([
                    { warehouse_type: WarehouseTypes.SNOWFLAKE, source },
                ]);
            tracker.on.select('organization_agent_identity_settings').response([
                {
                    require_verified_agent_sessions: source !== 'agent_sign_in',
                },
            ]);
            await Promise.all(
                (['person', 'service_account'] as const).map(async (actor) => {
                    expect(
                        await rules.get('org', WarehouseTypes.SNOWFLAKE, actor),
                    ).toEqual({ source });
                }),
            );
            expect(
                (await rules.list('org')).find(
                    (rule) => rule.warehouseType === WarehouseTypes.SNOWFLAKE,
                )?.source,
            ).toBe(source);
        },
    );
    test.each([true, false])(
        'uses legacy %s only without a row',
        async (enabled) => {
            tracker.on.select('organization_agent_identity_rules').response([]);
            tracker.on
                .select('organization_agent_identity_settings')
                .response([{ require_verified_agent_sessions: enabled }]);
            expect(
                await rules.get('org', WarehouseTypes.SNOWFLAKE, 'person'),
            ).toEqual({ source: enabled ? 'agent_sign_in' : 'marked_person' });
        },
    );
    test.each([
        'marked_person',
        'agent_sign_in',
        'ai_service_account',
    ] as const)(
        'writes both actors and mirrors %s, with accurate repeat metadata',
        async (source) => {
            tracker.on
                .select('organizations')
                .response([{ organization_uuid: 'org' }]);
            tracker.on
                .select('organization_agent_identity_rules')
                .responseOnce([{ source: 'ai_service_account' }]);
            tracker.on
                .select('organization_agent_identity_rules')
                .response([{ source }]);
            tracker.on.insert('organization_agent_identity_rules').response([]);
            tracker.on
                .insert('organization_agent_identity_settings')
                .response([]);
            expect(
                await rules.set('org', WarehouseTypes.SNOWFLAKE, { source }),
            ).toEqual({
                previousSource: 'ai_service_account',
                changed: source !== 'ai_service_account',
            });
            expect(
                await rules.set('org', WarehouseTypes.SNOWFLAKE, { source }),
            ).toEqual({ previousSource: source, changed: false });
            expect(tracker.history.insert[0].bindings).toEqual(
                expect.arrayContaining(['person', 'service_account', source]),
            );
            expect(tracker.history.insert[1].bindings).toContain(
                source === 'agent_sign_in',
            );
        },
    );
});
