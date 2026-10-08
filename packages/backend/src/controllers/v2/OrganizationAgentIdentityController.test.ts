import { Ability } from '@casl/ability';
import { FeatureFlags, type PossibleAbilities } from '@lightdash/common';
import { type Request } from 'express';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { buildAccount } from '../../auth/account/account.mock';
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
            ) => ({ settings, previousRequired: false }),
        ),
    };
    const flags = { get: vi.fn(async () => ({ enabled: true })) };
    const service = new AiAccessService({
        analytics: analyticsMock,
        featureFlagModel: flags,
        organizationAgentIdentitySettingsModel:
            model as unknown as OrganizationAgentIdentitySettingsModel,
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const controller = new OrganizationAgentIdentityController({
        getAiAccessService: () => service,
    } as ServiceRepository);
    const account = buildAccount();
    const req = { account } as Request;
    return { controller, model, account, req, flags };
};

test('allows an authenticated member to read their organization settings', async () => {
    const { controller, model, account, req } = setup();
    expect(await controller.getSettings(req)).toEqual({
        status: 'ok',
        results: { requireVerifiedAgentSessions: false },
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
    const { controller, model, req, account } = setup();
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
        await controller.updateSettings(req, {
            requireVerifiedAgentSessions: true,
        }),
    ).toEqual({
        status: 'ok',
        results: { requireVerifiedAgentSessions: true },
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
