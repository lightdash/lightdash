import { Ability } from '@casl/ability';
import {
    assertRegisteredAccount,
    ForbiddenError,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import * as auditLogger from '../../../logging/winston';
import { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationSettingsModel } from '../../../models/OrganizationSettingsModel';
import { OrganizationSettingsService } from '../../../services/OrganizationSettingsService/OrganizationSettingsService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
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
