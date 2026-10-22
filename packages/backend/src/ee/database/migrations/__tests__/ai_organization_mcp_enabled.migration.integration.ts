import { Ability } from '@casl/ability';
import {
    assertRegisteredAccount,
    ForbiddenError,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromSession, toSessionUser } from '../../../../auth/account/account';
import { defaultSessionUser } from '../../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import * as auditLogger from '../../../../logging/winston';
import { FeatureFlagModel } from '../../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationModel } from '../../../../models/OrganizationModel';
import { ProjectModel } from '../../../../models/ProjectModel/ProjectModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../../utils/EncryptionUtil/EncryptionUtil';
import { AiModelCatalog } from '../../../clients/Ai/AiModelCatalog';
import { AiOrganizationProviderCredentialModel } from '../../../models/AiOrganizationProviderCredentialModel';
import { AiOrganizationSettingsModel } from '../../../models/AiOrganizationSettingsModel';
import { CommercialFeatureFlagModel } from '../../../models/CommercialFeatureFlagModel';
import { OrgAiCopilotConfigResolver } from '../../../services/ai/OrgAiCopilotConfigResolver';
import { AiOrganizationSettingsService } from '../../../services/AiOrganizationSettingsService';
import {
    down,
    up,
} from '../20261022180000_add_mcp_enabled_to_ai_organization_settings';

let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
    await migrated?.destroy();
});

const accountFor = (
    organizationUuid: string,
    { organization = false, ai = false } = {},
) => {
    const rules: {
        action: 'manage';
        subject: 'Organization' | 'OrganizationAiAgent';
        conditions: { organizationUuid: string };
    }[] = [];
    if (organization) {
        rules.push({
            action: 'manage',
            subject: 'Organization',
            conditions: { organizationUuid },
        });
    }
    if (ai) {
        rules.push({
            action: 'manage',
            subject: 'OrganizationAiAgent',
            conditions: { organizationUuid },
        });
    }
    const ability = new Ability<PossibleAbilities>(rules);
    const account = fromSession({
        ...defaultSessionUser,
        organizationUuid,
        ability,
        abilityRules: ability.rules,
    });
    assertRegisteredAccount(account);
    return account;
};

const createService = ({ copilotEnabled = false } = {}) => {
    const { database } = migrated;
    const lightdashConfig = {
        ...lightdashConfigMock,
        ai: {
            ...lightdashConfigMock.ai,
            copilot: {
                ...lightdashConfigMock.ai.copilot,
                enabled: copilotEnabled,
                requiresFeatureFlag: false,
            },
        },
    };
    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const model = new AiOrganizationSettingsModel({ database, encryptionUtil });
    const aiOrganizationProviderCredentialModel =
        new AiOrganizationProviderCredentialModel({ database, encryptionUtil });
    const featureFlagModel = new FeatureFlagModel({
        database,
        lightdashConfig,
    });
    const service = new AiOrganizationSettingsService({
        aiOrganizationSettingsModel: model,
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
            aiOrganizationSettingsModel: model,
            aiOrganizationProviderCredentialModel,
            aiModelCatalog: new AiModelCatalog(),
        }),
    });
    return { model, service };
};

test('AI settings administrators can disable and restore MCP through the existing settings API', async () => {
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
    await database.raw(
        'UPDATE organizations SET created_at = ? WHERE organization_uuid = ?',
        [new Date('2020-01-01'), first.organization_uuid],
    );
    const { model, service } = createService({ copilotEnabled: true });
    const admin = accountFor(first.organization_uuid, { ai: true });
    expect(await service.isMcpEnabled(first.organization_uuid)).toBe(true);
    expect(await model.findMcpEnabled(first.organization_uuid)).toBeNull();
    await model.upsert(first.organization_uuid, { mcpAgentsEnabled: false });
    await expect(
        service.upsertSettings(admin, { mcpEnabled: false }),
    ).resolves.toMatchObject({
        mcpEnabled: false,
    });
    expect(await service.isMcpEnabled(first.organization_uuid)).toBe(false);
    expect(await service.isMcpEnabled(second.organization_uuid)).toBe(true);
    await expect(
        createService().service.getRuntimeSettings(
            toSessionUser(accountFor(first.organization_uuid)),
        ),
    ).resolves.toMatchObject({
        mcpEnabled: false,
        isCopilotEnabled: false,
        isTrial: false,
    });
    expect(
        await model.findByOrganizationUuid(first.organization_uuid),
    ).toMatchObject({ mcpAgentsEnabled: false });
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
                metadata: { mcpEnabled: false },
            },
            status: 'allowed',
            timestamp: expect.any(String),
        }),
    );
    await expect(
        service.upsertSettings(admin, { mcpEnabled: true }),
    ).resolves.toMatchObject({
        mcpEnabled: true,
    });
    expect(audit).toHaveBeenCalledWith(
        expect.objectContaining({
            resource: {
                type: 'OrganizationSettings',
                organizationUuid: first.organization_uuid,
                metadata: { mcpEnabled: true },
            },
        }),
    );
    const countMcpUpdates = () =>
        audit.mock.calls.filter(
            ([event]) => event.resource.type === 'OrganizationSettings',
        ).length;
    expect(countMcpUpdates()).toBe(2);
    await service.upsertSettings(admin, { aiAgentsVisible: false });
    expect(countMcpUpdates()).toBe(2);
    vi.spyOn(model, 'upsert').mockRejectedValueOnce(new Error('Write failed'));
    await expect(
        service.upsertSettings(admin, { mcpEnabled: false }),
    ).rejects.toThrow('Write failed');
    expect(countMcpUpdates()).toBe(2);
    await model.upsert(first.organization_uuid, { mcpEnabled: false });
    audit.mockImplementation((event) => {
        if (event.resource.type === 'OrganizationSettings')
            throw new Error('Audit unavailable');
    });
    await expect(
        service.upsertSettings(admin, { mcpEnabled: true }),
    ).resolves.toMatchObject({
        mcpEnabled: true,
    });
    expect(await model.findMcpEnabled(first.organization_uuid)).toBe(true);
});

test('materializing an AI settings row for MCP preserves every other effective default', async () => {
    const [organization] = await migrated
        .database('organizations')
        .insert({ organization_name: 'MCP defaults test' })
        .returning('organization_uuid');
    const { model, service } = createService({ copilotEnabled: true });
    const admin = accountFor(organization.organization_uuid, {
        organization: true,
        ai: true,
    });
    const before = await service.getSettings(toSessionUser(admin));
    expect(
        await model.findByOrganizationUuid(organization.organization_uuid),
    ).toBeNull();
    await service.upsertSettings(admin, { mcpEnabled: false });
    expect(await service.getSettings(toSessionUser(admin))).toEqual({
        ...before,
        mcpEnabled: false,
    });
});

test('MCP preference writes honor consent and reject mixed changes atomically', async () => {
    const [first, second] = await migrated
        .database('organizations')
        .insert([
            { organization_name: 'MCP disabled preferences' },
            { organization_name: 'MCP enabled preferences' },
        ])
        .returning('organization_uuid');
    const { model, service } = createService({ copilotEnabled: true });
    const admin = accountFor(first.organization_uuid, {
        organization: true,
        ai: true,
    });
    await model.upsert(first.organization_uuid, {
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: true,
    });
    await service.upsertSettings(admin, { mcpEnabled: false });
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
        await model.findByOrganizationUuid(first.organization_uuid),
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
    await expect(
        service.upsertSettings(admin, { aiAgentsVisible: false }),
    ).resolves.toMatchObject({ aiAgentsVisible: false });
    expect(await service.isMcpEnabled(first.organization_uuid)).toBe(false);
    await expect(
        service.upsertSettings(
            accountFor(second.organization_uuid, { ai: true }),
            { mcpContentWritesEnabled: false },
        ),
    ).resolves.toMatchObject({ mcpContentWritesEnabled: false });
    await service.upsertSettings(admin, { mcpEnabled: true });
    await expect(
        service.upsertSettings(admin, { mcpContentWritesEnabled: false }),
    ).resolves.toMatchObject({
        mcpAgentsEnabled: true,
        mcpContentWritesEnabled: false,
    });
    await service.upsertSettings(admin, { mcpEnabled: false });
    await expect(
        service.upsertSettings(admin, { mcpContentWritesEnabled: true }),
    ).rejects.toThrow(ForbiddenError);
    expect(
        await model.findByOrganizationUuid(first.organization_uuid),
    ).toMatchObject({ mcpContentWritesEnabled: false });
});

test.each([false, true])(
    'members and organization-only managers cannot change MCP access (organization manager: %s)',
    async (organizationManager) => {
        const audit = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => undefined);
        const [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: 'MCP permissions test' })
            .returning('organization_uuid');
        const { model, service } = createService({ copilotEnabled: true });
        const account = accountFor(organization.organization_uuid, {
            organization: organizationManager,
        });
        await Promise.all(
            [false, true].map((enabled) =>
                expect(
                    service.upsertSettings(account, { mcpEnabled: enabled }),
                ).rejects.toThrow(ForbiddenError),
            ),
        );
        expect(
            await model.findMcpEnabled(organization.organization_uuid),
        ).toBeNull();
        expect(
            audit.mock.calls.filter(
                ([event]) => event.resource.type === 'OrganizationSettings',
            ),
        ).toHaveLength(0);
    },
);

test('the EE MCP migration defaults existing rows to true and has a real reversal', async () => {
    await migrated.database.transaction(async (trx) => {
        await down(trx);
        const [organization] = await trx('organizations')
            .insert({ organization_name: 'MCP upgrade test' })
            .returning('organization_uuid');
        await trx('ai_organization_settings').insert({
            organization_uuid: organization.organization_uuid,
            mcp_agents_enabled: false,
            mcp_content_writes_enabled: false,
        });
        await up(trx);
        const row = await trx('ai_organization_settings')
            .where('organization_uuid', organization.organization_uuid)
            .first();
        expect(row).toMatchObject({
            mcp_enabled: true,
            mcp_agents_enabled: false,
            mcp_content_writes_enabled: false,
        });
        await down(trx);
        expect(
            await trx.schema.hasColumn(
                'ai_organization_settings',
                'mcp_enabled',
            ),
        ).toBe(false);
        expect(
            await trx.schema.hasColumn('organization_settings', 'mcp_enabled'),
        ).toBe(false);
        expect(
            await trx('ai_organization_settings')
                .where('organization_uuid', organization.organization_uuid)
                .first(),
        ).toMatchObject({
            mcp_agents_enabled: false,
            mcp_content_writes_enabled: false,
        });
        await up(trx);
    });
});
