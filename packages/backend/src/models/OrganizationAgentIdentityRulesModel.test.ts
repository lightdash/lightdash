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
        ['marked_person', true, true, 'agent_sign_in'],
        ['marked_person', true, false, 'agent_sign_in'],
        ['agent_sign_in', false, true, 'marked_person'],
        ['agent_sign_in', false, false, 'marked_person'],
        ['ai_service_account', false, true, 'ai_service_account'],
        ['ai_service_account', true, true, 'ai_service_account'],
        ['ai_service_account', true, false, 'agent_sign_in'],
        ['ai_service_account', false, false, 'marked_person'],
        [null, true, null, 'agent_sign_in'],
        [null, false, null, 'marked_person'],
    ] as const)(
        'resolves %s with legacy %s and matching timestamps %s to %s',
        async (source, enabled, timestampsMatch, expectedSource) => {
            tracker.on.select('organization_agent_identity_settings').response([
                {
                    source,
                    require_verified_agent_sessions: enabled,
                    timestamps_match: timestampsMatch,
                },
            ]);
            tracker.on
                .select('organization_agent_identity_rules')
                .response([
                    { warehouse_type: WarehouseTypes.SNOWFLAKE, source },
                ]);
            const actors = ['person', 'service_account'] as const;
            await Promise.all(
                actors.map(async (actor) => {
                    expect(
                        await rules.get('org', WarehouseTypes.SNOWFLAKE, actor),
                    ).toEqual({ source: expectedSource });
                }),
            );
            actors.forEach((actor, index) => {
                const query = tracker.history.select[index];
                expect(query.bindings).toEqual(
                    expect.arrayContaining(['org', 'snowflake', actor]),
                );
                expect(query.sql).toContain('left join');
                expect(query.sql).toContain(
                    '"rules"."updated_at" = "legacy"."updated_at"',
                );
            });
            expect(
                (await rules.list('org')).find(
                    (rule) => rule.warehouseType === WarehouseTypes.SNOWFLAKE,
                )?.source,
            ).toBe(expectedSource);
            tracker.on
                .select('organizations')
                .response([{ organization_uuid: 'org' }]);
            tracker.on.insert('organization_agent_identity_rules').response([]);
            tracker.on
                .insert('organization_agent_identity_settings')
                .response([]);
            expect(
                await rules.set('org', WarehouseTypes.SNOWFLAKE, {
                    source: 'marked_person',
                }),
            ).toEqual({
                previousSource: expectedSource,
                changed: expectedSource !== 'marked_person',
            });
        },
    );
    test.each([
        'marked_person',
        'agent_sign_in',
        'ai_service_account',
    ] as const)(
        'ignores a stale %s rule without a legacy row',
        async (source) => {
            tracker.on
                .select('organization_agent_identity_settings')
                .response([]);
            tracker.on
                .select('organization_agent_identity_rules')
                .response([
                    { warehouse_type: WarehouseTypes.SNOWFLAKE, source },
                ]);
            await Promise.all(
                (['person', 'service_account'] as const).map(async (actor) => {
                    expect(
                        await rules.get('org', WarehouseTypes.SNOWFLAKE, actor),
                    ).toEqual({ source: 'marked_person' });
                }),
            );
            expect((await rules.list('org'))[0].source).toBe('marked_person');
            tracker.on
                .select('organizations')
                .response([{ organization_uuid: 'org' }]);
            tracker.on.insert('organization_agent_identity_rules').response([]);
            tracker.on
                .insert('organization_agent_identity_settings')
                .response([]);
            expect(
                await rules.set('org', WarehouseTypes.SNOWFLAKE, {
                    source: 'marked_person',
                }),
            ).toEqual({ previousSource: 'marked_person', changed: false });
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
                .select('organization_agent_identity_settings')
                .responseOnce([
                    {
                        source: 'ai_service_account',
                        require_verified_agent_sessions: false,
                        timestamps_match: true,
                    },
                ]);
            tracker.on.select('organization_agent_identity_settings').response([
                {
                    source,
                    require_verified_agent_sessions: source === 'agent_sign_in',
                    timestamps_match: true,
                },
            ]);
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
            for (const query of tracker.history.insert) {
                expect(query.sql).toContain('"created_at"');
                expect(query.sql).toContain('"updated_at"');
                expect(query.sql.match(/CURRENT_TIMESTAMP/g)).toHaveLength(
                    query.sql.includes('"actor_kind"') ? 5 : 3,
                );
                expect(query.sql).toContain('"updated_at" = CURRENT_TIMESTAMP');
            }
            expect(tracker.history.insert[0].bindings).toEqual(
                expect.arrayContaining(['person', 'service_account', source]),
            );
            expect(tracker.history.insert[1].bindings).toContain(
                source === 'agent_sign_in',
            );
        },
    );
});
