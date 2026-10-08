import { WarehouseTypes, type AiActorKind } from '@lightdash/common';
import { OrganizationAgentIdentityRulesModel } from '../../../models/OrganizationAgentIdentityRulesModel';
import { OrganizationAgentIdentitySettingsModel } from '../../../models/OrganizationAgentIdentitySettingsModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261008120100_add_organization_agent_identity_rules';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterAll(async () => {
    await migrated?.destroy();
});

const fixture = async () => {
    const { database } = migrated;
    const [org] = await database('organizations')
        .insert({ organization_name: 'Identity rules' })
        .returning('organization_uuid');
    return {
        organizationUuid: org.organization_uuid,
        model: new OrganizationAgentIdentityRulesModel({ database }),
        settings: new OrganizationAgentIdentitySettingsModel({
            database,
            rulesModel: new OrganizationAgentIdentityRulesModel({ database }),
        }),
    };
};
const actors: AiActorKind[] = ['person', 'service_account'];

test('copies only existing Snowflake settings, preserves the legacy table on down, and reapplies', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const organizations = await trx('organizations')
            .insert([
                { organization_name: 'Required identity' },
                { organization_name: 'Optional identity' },
                { organization_name: 'No identity settings' },
            ])
            .returning('organization_uuid');
        const [required, optional, absent] = organizations.map(
            (org) => org.organization_uuid,
        );
        await trx('organization_agent_identity_settings').insert([
            {
                organization_uuid: required,
                require_verified_agent_sessions: true,
            },
            {
                organization_uuid: optional,
                require_verified_agent_sessions: false,
            },
        ]);
        const legacyBefore = await trx(
            'organization_agent_identity_settings',
        ).orderBy('organization_uuid');
        await up(trx);
        const rows = await trx('organization_agent_identity_rules').whereIn(
            'organization_uuid',
            [required, optional, absent],
        );
        expect(rows).toHaveLength(4);
        for (const actorKind of actors) {
            expect(rows).toContainEqual(
                expect.objectContaining({
                    organization_uuid: required,
                    warehouse_type: 'snowflake',
                    actor_kind: actorKind,
                    source: 'agent_sign_in',
                    required: true,
                }),
            );
            expect(rows).toContainEqual(
                expect.objectContaining({
                    organization_uuid: optional,
                    warehouse_type: 'snowflake',
                    actor_kind: actorKind,
                    source: 'marked_person',
                    required: false,
                }),
            );
        }
        expect(rows.some((row) => row.organization_uuid === absent)).toBe(
            false,
        );
        expect(rows.some((row) => row.warehouse_type === 'bigquery')).toBe(
            false,
        );
        expect(rows[0].created_at).toBeInstanceOf(Date);
        expect(rows[0].updated_at).toBeInstanceOf(Date);
        await down(trx);
        expect(
            await trx.schema.hasTable('organization_agent_identity_rules'),
        ).toBe(false);
        expect(
            await trx('organization_agent_identity_settings').orderBy(
                'organization_uuid',
            ),
        ).toEqual(legacyBefore);
        await up(trx);
        expect(
            await trx('organization_agent_identity_rules')
                .whereIn('organization_uuid', [required, optional, absent])
                .select(
                    'organization_uuid',
                    'warehouse_type',
                    'actor_kind',
                    'source',
                    'required',
                )
                .orderBy(['organization_uuid', 'actor_kind']),
        ).toEqual(
            rows
                .map(
                    ({
                        organization_uuid,
                        warehouse_type,
                        actor_kind,
                        source,
                        required: isRequired,
                    }) => ({
                        organization_uuid,
                        warehouse_type,
                        actor_kind,
                        source,
                        required: isRequired,
                    }),
                )
                .sort(
                    (a, b) =>
                        a.organization_uuid.localeCompare(
                            b.organization_uuid,
                        ) || a.actor_kind.localeCompare(b.actor_kind),
                ),
        );
    });
});

test('defaults every missing actor and type and lists only enforceable warehouses', async () => {
    const { model, organizationUuid } = await fixture();
    await Promise.all(
        Object.values(WarehouseTypes).flatMap((warehouseType) =>
            actors.map(async (actorKind) => {
                expect(
                    await model.get(organizationUuid, warehouseType, actorKind),
                ).toEqual({ source: 'marked_person', required: false });
            }),
        ),
    );
    expect(await model.list(organizationUuid)).toEqual([
        {
            warehouseType: WarehouseTypes.SNOWFLAKE,
            source: 'marked_person',
            required: false,
        },
        {
            warehouseType: WarehouseTypes.BIGQUERY,
            source: 'marked_person',
            required: false,
        },
    ]);
});

test.each([
    { source: 'agent_sign_in', required: true },
    { source: 'agent_sign_in', required: false },
    { source: 'marked_person', required: true },
    { source: 'marked_person', required: false },
] as const)(
    'writes both Snowflake actors and legacy settings for $source/$required',
    async (rule) => {
        const { model, settings, organizationUuid } = await fixture();
        await settings.upsert(organizationUuid, {
            requireVerifiedAgentSessions: !rule.required,
        });
        await model.set(organizationUuid, WarehouseTypes.SNOWFLAKE, rule);
        await Promise.all(
            actors.map(async (actor) => {
                expect(
                    await model.get(
                        organizationUuid,
                        WarehouseTypes.SNOWFLAKE,
                        actor,
                    ),
                ).toEqual(rule);
            }),
        );
        expect(await settings.get(organizationUuid)).toEqual({
            requireVerifiedAgentSessions:
                rule.source === 'agent_sign_in' && rule.required,
        });
        expect((await model.list(organizationUuid))[0]).toEqual({
            warehouseType: WarehouseTypes.SNOWFLAKE,
            ...rule,
        });
        expect(
            await migrated
                .database('organization_agent_identity_rules')
                .where('organization_uuid', organizationUuid),
        ).toHaveLength(2);
    },
);

test('writes both BigQuery actors without creating or changing legacy settings', async () => {
    const { model, settings, organizationUuid } = await fixture();
    const rule = { source: 'ai_service_account', required: true } as const;
    await model.set(organizationUuid, WarehouseTypes.BIGQUERY, rule);
    expect(
        await migrated
            .database('organization_agent_identity_settings')
            .where('organization_uuid', organizationUuid),
    ).toHaveLength(0);
    await Promise.all(
        actors.map(async (actor) => {
            expect(
                await model.get(
                    organizationUuid,
                    WarehouseTypes.BIGQUERY,
                    actor,
                ),
            ).toEqual(rule);
        }),
    );
    await settings.upsert(organizationUuid, {
        requireVerifiedAgentSessions: true,
    });
    const before = await migrated
        .database('organization_agent_identity_settings')
        .where('organization_uuid', organizationUuid)
        .first();
    await model.set(organizationUuid, WarehouseTypes.BIGQUERY, {
        source: 'marked_person',
        required: false,
    });
    expect(
        await migrated
            .database('organization_agent_identity_settings')
            .where('organization_uuid', organizationUuid)
            .first(),
    ).toEqual(before);
});

test.each([true, false])(
    'legacy %s writes the Snowflake pair',
    async (required) => {
        const { model, settings, organizationUuid } = await fixture();
        await settings.upsert(organizationUuid, {
            requireVerifiedAgentSessions: !required,
        });
        expect(
            await settings.upsert(organizationUuid, {
                requireVerifiedAgentSessions: required,
            }),
        ).toEqual({ requireVerifiedAgentSessions: required });
        await Promise.all(
            actors.map(async (actor) => {
                expect(
                    await model.get(
                        organizationUuid,
                        WarehouseTypes.SNOWFLAKE,
                        actor,
                    ),
                ).toEqual({
                    source: required ? 'agent_sign_in' : 'marked_person',
                    required,
                });
            }),
        );
    },
);

test('rolls back both actor rows when the legacy write fails', async () => {
    const { organizationUuid } = await fixture();
    await migrated.database.transaction(async (trx) => {
        await trx.raw(
            'ALTER TABLE organization_agent_identity_settings ADD CONSTRAINT reject_required_test CHECK (NOT require_verified_agent_sessions) NOT VALID',
        );
        const model = new OrganizationAgentIdentityRulesModel({
            database: trx,
        });
        const settings = new OrganizationAgentIdentitySettingsModel({
            database: trx,
            rulesModel: new OrganizationAgentIdentityRulesModel({
                database: trx,
            }),
        });
        await expect(
            model.set(organizationUuid, WarehouseTypes.SNOWFLAKE, {
                source: 'agent_sign_in',
                required: true,
            }),
        ).rejects.toMatchObject({ code: '23514' });
        expect(
            await trx('organization_agent_identity_rules').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toHaveLength(0);
        await expect(
            settings.upsert(organizationUuid, {
                requireVerifiedAgentSessions: true,
            }),
        ).rejects.toMatchObject({ code: '23514' });
        expect(
            await trx('organization_agent_identity_rules').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toHaveLength(0);
        expect(
            await trx('organization_agent_identity_settings').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toHaveLength(0);
        await trx.raw(
            'ALTER TABLE organization_agent_identity_settings DROP CONSTRAINT reject_required_test',
        );
    });
});

test('honors a caller transaction and rolls back rules and legacy settings together', async () => {
    const { model, organizationUuid } = await fixture();
    await expect(
        migrated.database.transaction(async (trx) => {
            await model.set(
                organizationUuid,
                WarehouseTypes.SNOWFLAKE,
                { source: 'agent_sign_in', required: true },
                trx,
            );
            expect(
                await trx('organization_agent_identity_rules').where(
                    'organization_uuid',
                    organizationUuid,
                ),
            ).toHaveLength(2);
            expect(
                await trx('organization_agent_identity_settings')
                    .where('organization_uuid', organizationUuid)
                    .first(),
            ).toMatchObject({ require_verified_agent_sessions: true });
            throw new Error('roll back caller');
        }),
    ).rejects.toThrow('roll back caller');
    expect(
        await migrated
            .database('organization_agent_identity_rules')
            .where('organization_uuid', organizationUuid),
    ).toHaveLength(0);
    expect(
        await migrated
            .database('organization_agent_identity_settings')
            .where('organization_uuid', organizationUuid),
    ).toHaveLength(0);
});

test('serializes concurrent writes and cascades organization deletion', async () => {
    const { model, settings, organizationUuid } = await fixture();
    await Promise.all([
        model.set(organizationUuid, WarehouseTypes.SNOWFLAKE, {
            source: 'agent_sign_in',
            required: true,
        }),
        settings.upsert(organizationUuid, {
            requireVerifiedAgentSessions: false,
        }),
    ]);
    const person = await model.get(
        organizationUuid,
        WarehouseTypes.SNOWFLAKE,
        'person',
    );
    expect(
        await model.get(
            organizationUuid,
            WarehouseTypes.SNOWFLAKE,
            'service_account',
        ),
    ).toEqual(person);
    expect(await settings.get(organizationUuid)).toEqual({
        requireVerifiedAgentSessions:
            person.source === 'agent_sign_in' && person.required,
    });
    await migrated
        .database('organizations')
        .where('organization_uuid', organizationUuid)
        .delete();
    expect(
        await migrated
            .database('organization_agent_identity_rules')
            .where('organization_uuid', organizationUuid),
    ).toHaveLength(0);
});
