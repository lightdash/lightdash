import { Ability } from '@casl/ability';
import {
    assertRegisteredAccount,
    ForbiddenError,
    type OrganizationSettings,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiModelCatalog } from '../../../ee/clients/Ai/AiModelCatalog';
import { AiOrganizationProviderCredentialModel } from '../../../ee/models/AiOrganizationProviderCredentialModel';
import { AiOrganizationSettingsModel } from '../../../ee/models/AiOrganizationSettingsModel';
import { CommercialFeatureFlagModel } from '../../../ee/models/CommercialFeatureFlagModel';
import { OrgAiCopilotConfigResolver } from '../../../ee/services/ai/OrgAiCopilotConfigResolver';
import { AiOrganizationSettingsService } from '../../../ee/services/AiOrganizationSettingsService';
import * as auditLogger from '../../../logging/winston';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationModel } from '../../../models/OrganizationModel';
import { OrganizationSettingsModel } from '../../../models/OrganizationSettingsModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { OrganizationSettingsService } from '../../../services/OrganizationSettingsService/OrganizationSettingsService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { down, up } from '../20261022160000_add_organization_mcp_enabled';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
    await migrated?.destroy();
});

const accountFor = (organizationUuid: string, admin: boolean) => {
    const ability = new Ability<PossibleAbilities>(
        admin
            ? [
                  {
                      action: 'manage',
                      subject: 'Organization',
                      conditions: { organizationUuid },
                  },
                  {
                      action: 'manage',
                      subject: 'OrganizationAiAgent',
                      conditions: { organizationUuid },
                  },
              ]
            : [],
    );
    const account = fromSession({
        ...defaultSessionUser,
        organizationUuid,
        ability,
        abilityRules: ability.rules,
    });
    assertRegisteredAccount(account);
    return account;
};

test('organization admins can disable and restore MCP without affecting other organizations or settings', async () => {
    const audit = vi
        .spyOn(auditLogger, 'logAuditEvent')
        .mockImplementation(() => undefined);
    const { database } = migrated;
    const [first, second] = await database('organizations')
        .insert([
            { organization_name: 'MCP first organization' },
            { organization_name: 'MCP second organization' },
        ])
        .returning('organization_uuid');
    const model = new OrganizationSettingsModel({ database });
    const service = new OrganizationSettingsService({
        organizationSettingsModel: model,
        lightdashConfig: lightdashConfigMock,
        featureFlagModel: new FeatureFlagModel({
            database,
            lightdashConfig: lightdashConfigMock,
        }),
    });
    const admin = accountFor(first.organization_uuid, true);
    const otherAdmin = accountFor(second.organization_uuid, true);
    expect((await service.getOrganizationSettings(admin)).mcpEnabled).toBe(
        true,
    );

    await model.update(first.organization_uuid, {
        corsAllowedDomains: ['https://example.com'],
    });
    const saved = await service.updateOrganizationSettings(admin, {
        mcpEnabled: false,
    });
    expect(saved.mcpEnabled).toBe(false);
    expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
            actor: expect.objectContaining({
                uuid: defaultSessionUser.userUuid,
                type: 'session',
                organizationUuid: first.organization_uuid,
            }),
            action: 'update',
            resource: {
                type: 'OrganizationSettings',
                organizationUuid: first.organization_uuid,
                metadata: { mcpEnabled: { from: true, to: false } },
            },
            status: 'allowed',
            timestamp: expect.any(String),
        }),
    );
    expect(saved.corsAllowedDomains).toEqual(['https://example.com']);
    expect((await service.getOrganizationSettings(otherAdmin)).mcpEnabled).toBe(
        true,
    );
    expect(
        (
            await new OrganizationSettingsModel({ database }).get(
                first.organization_uuid,
            )
        ).mcpEnabled,
    ).toBe(false);

    await service.updateOrganizationSettings(admin, {
        inviteLinkExpirationDays: 5,
    });
    expect((await model.get(first.organization_uuid)).mcpEnabled).toBe(false);
    expect(
        (await service.updateOrganizationSettings(admin, { mcpEnabled: true }))
            .mcpEnabled,
    ).toBe(true);
    expect(
        (await service.updateOrganizationSettings(admin, { mcpEnabled: null }))
            .mcpEnabled,
    ).toBe(true);
    expect((await model.get(first.organization_uuid)).mcpEnabled).toBeNull();
    const countMcpUpdates = () =>
        audit.mock.calls.filter(
            ([event]) => event.resource.type === 'OrganizationSettings',
        ).length;
    expect(countMcpUpdates()).toBe(3);
    vi.spyOn(model, 'update').mockRejectedValueOnce(new Error('Write failed'));
    await expect(
        service.updateOrganizationSettings(admin, { mcpEnabled: false }),
    ).rejects.toThrow('Write failed');
    expect(countMcpUpdates()).toBe(3);

    await model.update(first.organization_uuid, { mcpEnabled: false });
    audit.mockImplementation((event) => {
        if (event.resource.type === 'OrganizationSettings') {
            throw new Error('Audit unavailable');
        }
    });
    await expect(
        service.updateOrganizationSettings(admin, { mcpEnabled: true }),
    ).resolves.toMatchObject({ mcpEnabled: true });
    expect((await model.get(first.organization_uuid)).mcpEnabled).toBe(true);
});

test.each([false, true])(
    'audits the committed MCP transition after a concurrent save when a settings row exists: %s',
    async (settingsRowExists) => {
        const audit = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => undefined);
        const { database } = migrated;
        const [organization] = await database('organizations')
            .insert({ organization_name: 'MCP concurrent settings test' })
            .returning('organization_uuid');
        const organizationUuid = organization.organization_uuid;
        const model = new OrganizationSettingsModel({ database });
        const service = new OrganizationSettingsService({
            organizationSettingsModel: model,
            lightdashConfig: lightdashConfigMock,
            featureFlagModel: new FeatureFlagModel({
                database,
                lightdashConfig: lightdashConfigMock,
            }),
        });
        if (settingsRowExists) {
            await model.update(organizationUuid, { mcpEnabled: true });
        }
        const holder = await database.transaction();
        let saving: Promise<OrganizationSettings> | undefined;
        try {
            const backend = await holder.raw<{ rows: { pid: number }[] }>(
                'select pg_backend_pid() as pid',
            );
            const holderPid = backend.rows[0].pid;
            if (settingsRowExists) {
                await holder('organization_settings')
                    .where('organization_uuid', organizationUuid)
                    .update({ mcp_enabled: false });
            } else {
                await holder('organization_settings').insert({
                    organization_uuid: organizationUuid,
                    mcp_enabled: false,
                });
            }
            saving = service.updateOrganizationSettings(
                accountFor(organizationUuid, true),
                { mcpEnabled: true },
            );
            await vi.waitFor(
                async () => {
                    const blockers = await database.raw<{
                        rows: { pid: number }[];
                    }>(
                        'select pid from pg_stat_activity where ? = ANY(pg_blocking_pids(pid)) and datname = current_database()',
                        [holderPid],
                    );
                    expect(blockers.rows).toHaveLength(1);
                },
                { timeout: 5000 },
            );
            await holder.commit();
            await expect(saving).resolves.toMatchObject({ mcpEnabled: true });
            expect(audit).toHaveBeenCalledWith(
                expect.objectContaining({
                    resource: {
                        type: 'OrganizationSettings',
                        organizationUuid,
                        metadata: { mcpEnabled: { from: false, to: true } },
                    },
                }),
            );
            expect((await model.get(organizationUuid)).mcpEnabled).toBe(true);
        } finally {
            if (!holder.isCompleted()) await holder.rollback();
            await saving;
        }
    },
);

test('MCP preference writes honor persisted organization consent and reject mixed patches atomically', async () => {
    const { database } = migrated;
    const [first, second] = await database('organizations')
        .insert([
            { organization_name: 'MCP disabled preferences' },
            { organization_name: 'MCP enabled preferences' },
        ])
        .returning('organization_uuid');
    const lightdashConfig = {
        ...lightdashConfigMock,
        ai: {
            ...lightdashConfigMock.ai,
            copilot: {
                ...lightdashConfigMock.ai.copilot,
                enabled: true,
                requiresFeatureFlag: false,
            },
        },
    };
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const organizationSettingsModel = new OrganizationSettingsModel({
        database,
    });
    const aiOrganizationSettingsModel = new AiOrganizationSettingsModel({
        database,
        encryptionUtil,
    });
    const aiOrganizationProviderCredentialModel =
        new AiOrganizationProviderCredentialModel({ database, encryptionUtil });
    const featureFlagModel = new FeatureFlagModel({
        database,
        lightdashConfig,
    });
    const service = new AiOrganizationSettingsService({
        organizationSettingsModel,
        aiOrganizationSettingsModel,
        aiOrganizationProviderCredentialModel,
        organizationModel: new OrganizationModel(database, lightdashConfig),
        projectModel: new ProjectModel({
            database,
            lightdashConfig,
            encryptionUtil,
        }),
        commercialFeatureFlagModel: new CommercialFeatureFlagModel({
            database,
            lightdashConfig,
        }),
        featureFlagModel,
        lightdashConfig,
        orgAiCopilotConfigResolver: new OrgAiCopilotConfigResolver({
            lightdashConfig,
            featureFlagModel,
            aiOrganizationSettingsModel,
            aiOrganizationProviderCredentialModel,
            aiModelCatalog: new AiModelCatalog(),
        }),
    });
    const admin = accountFor(first.organization_uuid, true);
    await aiOrganizationSettingsModel.upsert(first.organization_uuid, {
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: true,
    });
    await organizationSettingsModel.update(first.organization_uuid, {
        mcpEnabled: false,
    });
    await Promise.all(
        (['mcpAgentsEnabled', 'mcpContentWritesEnabled'] as const).map(
            (setting) =>
                expect(
                    service.upsertSettings(admin, {
                        [setting]: false,
                        deepResearchRawSqlEnabled: true,
                    }),
                ).rejects.toThrow(
                    'MCP access is disabled for this organization',
                ),
        ),
    );
    expect(
        await aiOrganizationSettingsModel.findByOrganizationUuid(
            first.organization_uuid,
        ),
    ).toMatchObject({
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: true,
        deepResearchRawSqlEnabled: false,
    });
    await expect(
        service.upsertSettings(admin, {
            mcpAgentsEnabled: true,
            mcpContentWritesEnabled: true,
            deepResearchRawSqlEnabled: true,
        }),
    ).resolves.toMatchObject({
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: true,
        deepResearchRawSqlEnabled: true,
    });
    expect(
        await aiOrganizationSettingsModel.findByOrganizationUuid(
            first.organization_uuid,
        ),
    ).toMatchObject({ deepResearchRawSqlEnabled: true });
    await expect(
        service.upsertSettings(admin, { aiAgentsVisible: false }),
    ).resolves.toMatchObject({ aiAgentsVisible: false });
    await expect(
        service.upsertSettings(accountFor(second.organization_uuid, true), {
            mcpContentWritesEnabled: false,
        }),
    ).resolves.toMatchObject({ mcpContentWritesEnabled: false });
    await organizationSettingsModel.update(first.organization_uuid, {
        mcpEnabled: true,
    });
    await expect(
        service.upsertSettings(admin, {
            mcpContentWritesEnabled: false,
        }),
    ).resolves.toMatchObject({
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: false,
    });
});

test('members cannot read, disable or re-enable MCP organization settings', async () => {
    const { database } = migrated;
    const [organization] = await database('organizations')
        .insert({ organization_name: 'MCP authorization test' })
        .returning('organization_uuid');
    const model = new OrganizationSettingsModel({ database });
    const service = new OrganizationSettingsService({
        organizationSettingsModel: model,
        lightdashConfig: lightdashConfigMock,
        featureFlagModel: new FeatureFlagModel({
            database,
            lightdashConfig: lightdashConfigMock,
        }),
    });
    const member = accountFor(organization.organization_uuid, false);
    await expect(service.getOrganizationSettings(member)).rejects.toThrow(
        ForbiddenError,
    );
    await Promise.all(
        [false, true].map(async (mcpEnabled) => {
            await expect(
                service.updateOrganizationSettings(member, { mcpEnabled }),
            ).rejects.toThrow(ForbiddenError);
        }),
    );
    expect(
        (await model.get(organization.organization_uuid)).mcpEnabled,
    ).toBeNull();
});

test('the MCP setting migration is additive and reversible', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const [organization] = await trx('organizations')
            .insert({ organization_name: 'MCP upgrade test' })
            .returning('organization_uuid');
        await trx('organization_settings').insert({
            organization_uuid: organization.organization_uuid,
            oidc_linking_enabled: true,
        });
        await up(trx);
        const model = new OrganizationSettingsModel({ database: trx });
        expect(await model.get(organization.organization_uuid)).toMatchObject({
            mcpEnabled: null,
            oidcLinkingEnabled: true,
        });
        await model.update(organization.organization_uuid, {
            mcpEnabled: false,
        });
        await down(trx);
        expect(
            await trx.schema.hasColumn('organization_settings', 'mcp_enabled'),
        ).toBe(false);
        expect(
            (
                await trx('organization_settings')
                    .where('organization_uuid', organization.organization_uuid)
                    .first()
            )?.oidc_linking_enabled,
        ).toBe(true);
        await up(trx);
    });
});
