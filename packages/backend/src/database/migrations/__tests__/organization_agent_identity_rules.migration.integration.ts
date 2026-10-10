import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    QueryExecutionContext,
    QuerySurface,
    WarehouseTypes,
    type AiActorKind,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { OrganizationAgentIdentityRulesModel } from '../../../models/OrganizationAgentIdentityRulesModel';
import { OrganizationAgentIdentitySettingsModel } from '../../../models/OrganizationAgentIdentitySettingsModel';
import { AiAccessService } from '../../../services/AiAccessService/AiAccessService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261008120100_add_organization_agent_identity_rules';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

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
        expect(
            await trx.schema.hasColumn(
                'organization_agent_identity_rules',
                'required',
            ),
        ).toBe(false);
        for (const actorKind of actors) {
            expect(rows).toContainEqual(
                expect.objectContaining({
                    organization_uuid: required,
                    warehouse_type: 'snowflake',
                    actor_kind: actorKind,
                    source: 'agent_sign_in',
                }),
            );
            expect(rows).toContainEqual(
                expect.objectContaining({
                    organization_uuid: optional,
                    warehouse_type: 'snowflake',
                    actor_kind: actorKind,
                    source: 'marked_person',
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
                    }) => ({
                        organization_uuid,
                        warehouse_type,
                        actor_kind,
                        source,
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
                ).toEqual({ source: 'marked_person' });
            }),
        ),
    );
    expect(await model.list(organizationUuid)).toEqual([
        {
            warehouseType: WarehouseTypes.SNOWFLAKE,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.BIGQUERY,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.POSTGRES,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.REDSHIFT,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.DATABRICKS,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.ATHENA,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        },
    ]);
});

test.each([{ source: 'agent_sign_in' }, { source: 'marked_person' }] as const)(
    'writes both Snowflake actors and legacy settings for $source',
    async (rule) => {
        const { model, settings, organizationUuid } = await fixture();
        await settings.upsert(organizationUuid, {
            requireVerifiedAgentSessions: rule.source !== 'agent_sign_in',
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
            requireVerifiedAgentSessions: rule.source === 'agent_sign_in',
        });
        expect((await model.list(organizationUuid))[0]).toEqual({
            warehouseType: WarehouseTypes.SNOWFLAKE,
            ...rule,
            projectsMissingAiServiceAccount: null,
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
    const rule = { source: 'ai_service_account' } as const;
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
        ).toEqual({
            settings: { requireVerifiedAgentSessions: required },
            previousSource: required ? 'marked_person' : 'agent_sign_in',
            changed: true,
        });
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
                { source: 'agent_sign_in' },
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
        requireVerifiedAgentSessions: person.source === 'agent_sign_in',
    });
    const rows = await migrated
        .database('organization_agent_identity_rules')
        .where({
            organization_uuid: organizationUuid,
            warehouse_type: WarehouseTypes.SNOWFLAKE,
        });
    expect(
        rows
            .map(({ actor_kind, source }) => ({ actor_kind, source }))
            .sort((a, b) => a.actor_kind.localeCompare(b.actor_kind)),
    ).toEqual(
        actors.map((actor_kind) => ({ actor_kind, source: person.source })),
    );
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

const writeLegacySettings = async (
    database: Knex,
    organizationUuid: string,
    required: boolean,
) =>
    database.raw(
        `INSERT INTO organization_agent_identity_settings
        (organization_uuid, require_verified_agent_sessions)
     VALUES (?, ?)
     ON CONFLICT (organization_uuid) DO UPDATE
     SET require_verified_agent_sessions = EXCLUDED.require_verified_agent_sessions,
         updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
        [organizationUuid, required],
    );

test.each([true, false])(
    'reads an old pod legacy write of %s instead of stale Snowflake rules',
    async (required) => {
        const { organizationUuid } = await fixture();
        await migrated.database.transaction(async (trx) => {
            await down(trx);
            await writeLegacySettings(trx, organizationUuid, !required);
            await up(trx);
            const model = new OrganizationAgentIdentityRulesModel({
                database: trx,
            });
            await model.set(organizationUuid, WarehouseTypes.BIGQUERY, {
                source: 'ai_service_account',
            });
            await writeLegacySettings(trx, organizationUuid, required);
            const staleSource = required ? 'marked_person' : 'agent_sign_in';
            const source = required ? 'agent_sign_in' : 'marked_person';
            expect(
                await trx('organization_agent_identity_rules')
                    .where({
                        organization_uuid: organizationUuid,
                        warehouse_type: WarehouseTypes.SNOWFLAKE,
                    })
                    .pluck('source'),
            ).toEqual([staleSource, staleSource]);
            await Promise.all(
                actors.map(async (actor) => {
                    expect(
                        await model.get(
                            organizationUuid,
                            WarehouseTypes.SNOWFLAKE,
                            actor,
                        ),
                    ).toEqual({ source });
                    expect(
                        await model.get(
                            organizationUuid,
                            WarehouseTypes.BIGQUERY,
                            actor,
                        ),
                    ).toEqual({ source: 'ai_service_account' });
                }),
            );
            expect(await model.list(organizationUuid)).toEqual([
                {
                    warehouseType: WarehouseTypes.SNOWFLAKE,
                    source,
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.BIGQUERY,
                    source: 'ai_service_account',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.POSTGRES,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.REDSHIFT,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.DATABRICKS,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
                {
                    warehouseType: WarehouseTypes.ATHENA,
                    source: 'marked_person',
                    projectsMissingAiServiceAccount: null,
                },
            ]);
        });
    },
);

test('ignores stale Snowflake rules when the legacy row is absent', async () => {
    const { model, organizationUuid } = await fixture();
    await model.set(organizationUuid, WarehouseTypes.SNOWFLAKE, {
        source: 'agent_sign_in',
    });
    await migrated
        .database('organization_agent_identity_settings')
        .where('organization_uuid', organizationUuid)
        .delete();
    await Promise.all(
        actors.map(async (actor) => {
            expect(
                await model.get(
                    organizationUuid,
                    WarehouseTypes.SNOWFLAKE,
                    actor,
                ),
            ).toEqual({ source: 'marked_person' });
        }),
    );
    expect((await model.list(organizationUuid))[0].source).toBe(
        'marked_person',
    );
});

test('resolvePlan refuses needs_sign_in after an old pod enables the legacy switch', async () => {
    const { model, settings, organizationUuid } = await fixture();
    await model.set(organizationUuid, WarehouseTypes.SNOWFLAKE, {
        source: 'marked_person',
    });
    await writeLegacySettings(migrated.database, organizationUuid, true);
    const mint = vi
        .fn()
        .mockRejectedValue(
            new AiAccessRefusedError(AiAccessRefusalReason.NEEDS_SIGN_IN),
        );
    const service = new AiAccessService({
        organizationAgentIdentityRulesModel: model,
        organizationAgentIdentitySettingsModel: settings,
        featureFlagModel: { get: vi.fn().mockResolvedValue({ enabled: true }) },
        userModel: {
            getUserDetailsByUuid: vi
                .fn()
                .mockResolvedValue({ email: 'person@example.com' }),
        },
        lightdashConfig: { siteUrl: 'https://lightdash.example' },
        analytics: { track: vi.fn() },
        agentSignInCredentialResolver: {
            inspectClient: () => null,
            resolve: mint,
        },
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    await expect(
        service.resolvePlan({
            organizationUuid,
            projectUuid: 'project',
            warehouseConnectionUuid: null,
            userUuid: 'person',
            isRegisteredUser: true,
            isServiceAccount: false,
            context: QueryExecutionContext.AI,
            evaluation: { kind: 'query', surface: QuerySurface.APP },
            connection: {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'person',
                password: 'test',
                database: 'test',
                warehouse: 'test',
                schema: 'public',
            },
        }),
    ).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.NEEDS_SIGN_IN },
    });
    expect(mint).toHaveBeenCalledOnce();
});

test.each([WarehouseTypes.BIGQUERY, WarehouseTypes.SNOWFLAKE])(
    'round 11 %s serializes the previous source and detects repeated saves',
    async (warehouseType) => {
        const { model, organizationUuid } = await fixture();
        const source =
            warehouseType === WarehouseTypes.BIGQUERY
                ? 'ai_service_account'
                : 'agent_sign_in';
        expect(
            await model.set(organizationUuid, warehouseType, { source }),
        ).toEqual({
            previousSource: 'marked_person',
            changed: true,
        });
        expect(
            await model.set(organizationUuid, warehouseType, { source }),
        ).toEqual({
            previousSource: source,
            changed: false,
        });
        const results = await Promise.all([
            model.set(organizationUuid, warehouseType, {
                source: 'marked_person',
            }),
            model.set(organizationUuid, warehouseType, {
                source: 'marked_person',
            }),
        ]);
        expect(results.filter((result) => result.changed)).toEqual([
            { previousSource: source, changed: true },
        ]);
        expect(results.filter((result) => !result.changed)).toEqual([
            { previousSource: 'marked_person', changed: false },
        ]);
    },
);

test('round 11 legacy saves return transaction change metadata', async () => {
    const { settings, organizationUuid } = await fixture();
    expect(
        await settings.upsert(organizationUuid, {
            requireVerifiedAgentSessions: true,
        }),
    ).toEqual({
        settings: { requireVerifiedAgentSessions: true },
        previousSource: 'marked_person',
        changed: true,
    });
    expect(
        await settings.upsert(organizationUuid, {
            requireVerifiedAgentSessions: true,
        }),
    ).toEqual({
        settings: { requireVerifiedAgentSessions: true },
        previousSource: 'agent_sign_in',
        changed: false,
    });
});
