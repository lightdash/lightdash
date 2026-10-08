import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    WarehouseTypes,
    type OrganizationAgentIdentityRule,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request } from 'express';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { buildAccount } from '../../auth/account/account.mock';
import { type OrganizationAgentIdentityRulesModel } from '../../models/OrganizationAgentIdentityRulesModel';
import { type OrganizationAgentIdentitySettingsModel } from '../../models/OrganizationAgentIdentitySettingsModel';
import { AiAccessService } from '../../services/AiAccessService/AiAccessService';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { OrganizationAgentIdentityController } from './OrganizationAgentIdentityController';

const setup = () => {
    const model = {
        get: vi.fn(async () => ({ requireVerifiedAgentSessions: false })),
        upsert: vi.fn(
            async (
                _uuid: string,
                settings: { requireVerifiedAgentSessions: boolean },
            ) => ({ settings, previousSource: 'marked_person' }),
        ),
    };
    const rules = {
        get: vi.fn(async () => ({ source: 'marked_person' })),
        list: vi.fn(
            async (): Promise<OrganizationAgentIdentityRule[]> => [
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
            ],
        ),
        set: vi.fn(async () => {}),
    };
    const flags = { get: vi.fn(async () => ({ enabled: true })) };
    const service = new AiAccessService({
        analytics: analyticsMock,
        aiServiceAccountCredentialsModel: {
            findProjectsMissingSlot: vi.fn(async () => []),
        },
        featureFlagModel: flags,
        organizationAgentIdentityRulesModel:
            rules as unknown as OrganizationAgentIdentityRulesModel,
        organizationAgentIdentitySettingsModel:
            model as unknown as OrganizationAgentIdentitySettingsModel,
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const controller = new OrganizationAgentIdentityController({
        getAiAccessService: () => service,
    } as ServiceRepository);
    const account = buildAccount();
    const req = { account } as Request;
    return { controller, model, rules, account, req, flags };
};

test('allows an authenticated member to read their organization settings', async () => {
    const { controller, model, account, req } = setup();
    expect(await controller.getSettings(req)).toEqual({
        status: 'ok',
        results: {
            requireVerifiedAgentSessions: false,
            rules: [
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
            ],
        },
    });
    expect(model.get).toHaveBeenCalledWith(
        account.organization.organizationUuid,
    );
});

test('rejects a non-admin update with 403', async () => {
    const { controller, model, req } = setup();
    await expect(
        controller.updateSettings(req, { requireVerifiedAgentSessions: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(model.upsert).not.toHaveBeenCalled();
});

test('allows an organization admin to update their own settings', async () => {
    const { controller, model, rules, req, account } = setup();
    account.user.ability = new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'Organization',
            conditions: {
                organizationUuid: account.organization.organizationUuid,
            },
        },
    ]);
    const updatedRules: OrganizationAgentIdentityRule[] = [
        {
            warehouseType: WarehouseTypes.SNOWFLAKE,
            source: 'agent_sign_in',
            projectsMissingAiServiceAccount: null,
        },
        {
            warehouseType: WarehouseTypes.BIGQUERY,
            source: 'marked_person',
            projectsMissingAiServiceAccount: null,
        },
    ];
    rules.list.mockResolvedValue(updatedRules);
    expect(
        await controller.updateSettings(req, {
            requireVerifiedAgentSessions: true,
        }),
    ).toEqual({
        status: 'ok',
        results: { requireVerifiedAgentSessions: true, rules: updatedRules },
    });
    expect(model.upsert).toHaveBeenCalledWith(
        account.organization.organizationUuid,
        { requireVerifiedAgentSessions: true },
    );
});

test('rejects manage permission scoped to a different organization', async () => {
    const { controller, model, req, account } = setup();
    account.user.ability = new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'Organization',
            conditions: { organizationUuid: 'another-org' },
        },
    ]);
    await expect(
        controller.updateSettings(req, { requireVerifiedAgentSessions: true }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(model.upsert).not.toHaveBeenCalled();
});

test.each(['get', 'put'])(
    'rejects %s settings when agent identity is off',
    async (method) => {
        const { controller, model, req, flags, account } = setup();
        flags.get.mockResolvedValue({ enabled: false });
        const result =
            method === 'get'
                ? controller.getSettings(req)
                : controller.updateSettings(req, {
                      requireVerifiedAgentSessions: true,
                  });
        await expect(result).rejects.toMatchObject({
            name: 'FeatureNotEnabledError',
            statusCode: 403,
            data: {
                code: 'feature_not_enabled',
                featureFlagId: FeatureFlags.AgentIdentity,
            },
        });
        expect(flags.get).toHaveBeenCalledWith({
            user: {
                userUuid: account.user.id,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        expect(model.get).not.toHaveBeenCalled();
        expect(model.upsert).not.toHaveBeenCalled();
    },
);

test.each([
    [WarehouseTypes.SNOWFLAKE, 'agent_sign_in'],
    [WarehouseTypes.BIGQUERY, 'ai_service_account'],
] as const)('returns the updated %s rule', async (warehouseType, source) => {
    const { controller, rules, account, req } = setup();
    account.user.ability = new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'Organization',
            conditions: {
                organizationUuid: account.organization.organizationUuid,
            },
        },
    ]);
    expect(
        await controller.updateRule(req, warehouseType, {
            source,
        }),
    ).toEqual({
        status: 'ok',
        results: {
            warehouseType,
            source,
            projectsMissingAiServiceAccount:
                source === 'ai_service_account' ? [] : null,
        },
    });
    expect(rules.set).toHaveBeenCalledWith(
        account.organization.organizationUuid,
        warehouseType,
        { source },
    );
});

test('rejects a rule update scoped to another organization', async () => {
    const { controller, rules, account, req } = setup();
    account.user.ability = new Ability<PossibleAbilities>([
        {
            action: 'manage',
            subject: 'Organization',
            conditions: { organizationUuid: 'other-org' },
        },
    ]);
    await expect(
        controller.updateRule(req, WarehouseTypes.BIGQUERY, {
            source: 'ai_service_account',
        }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(rules.set).not.toHaveBeenCalled();
});

test('gates the per-warehouse PUT before writing', async () => {
    const { controller, rules, req, flags } = setup();
    flags.get.mockResolvedValue({ enabled: false });
    await expect(
        controller.updateRule(req, WarehouseTypes.BIGQUERY, {
            source: 'ai_service_account',
        }),
    ).rejects.toMatchObject({
        name: 'FeatureNotEnabledError',
        statusCode: 403,
    });
    expect(rules.set).not.toHaveBeenCalled();
});
