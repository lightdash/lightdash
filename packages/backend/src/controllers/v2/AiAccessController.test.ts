import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    WarehouseTypes,
    type PossibleAbilities,
} from '@lightdash/common';
import { type Request } from 'express';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { buildAccount } from '../../auth/account/account.mock';
import { AiAccessService } from '../../services/AiAccessService/AiAccessService';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { AiAccessController } from './AiAccessController';

const setup = (enabled: boolean) => {
    const account = buildAccount();
    account.user.ability = new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Project' },
    ]);
    const flags = { get: vi.fn(async () => ({ enabled })) };
    const getCredentials = vi.fn(async () => ({
        type: WarehouseTypes.POSTGRES,
    }));
    const service = new AiAccessService({
        analytics: analyticsMock,
        featureFlagModel: flags,
        organizationAgentIdentityRulesModel: {
            get: vi.fn(async () => ({
                source: 'marked_person',
                required: false,
            })),
        },
        projectModel: {
            getSummary: vi.fn(async () => ({
                organizationUuid: account.organization.organizationUuid,
            })),
            getWarehouseCredentialsForBinding: getCredentials,
        },
    } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
    const runAgentMarkerProbe = vi.fn(async () => [
        { agent: 'true', application_name: 'lightdash-agent' },
    ]);
    const controller = new AiAccessController({
        getAiAccessService: () => service,
        getProjectService: () => ({ runAgentMarkerProbe }),
    } as unknown as ServiceRepository);
    return {
        controller,
        req: { account } as Request,
        getCredentials,
        runAgentMarkerProbe,
        flags,
    };
};

describe.each(['me', 'capabilities', 'marker'] as const)(
    'AI access %s',
    (route) => {
        const call = ({ controller, req }: ReturnType<typeof setup>) => {
            switch (route) {
                case 'me':
                    return controller.getMyAccess('project', req);
                case 'capabilities':
                    return controller.getCapabilities('project', req);
                case 'marker':
                    return controller.testMarker('project', req);
                default:
                    throw new Error('Unknown route');
            }
        };
        it('returns a typed 403 when the flag is off', async () => {
            const fixture = setup(false);
            await expect(call(fixture)).rejects.toMatchObject({
                name: 'FeatureNotEnabledError',
                statusCode: 403,
                data: {
                    code: 'feature_not_enabled',
                    featureFlagId: FeatureFlags.AgentIdentity,
                },
            });
            expect(fixture.getCredentials).not.toHaveBeenCalled();
            expect(fixture.runAgentMarkerProbe).not.toHaveBeenCalled();
        });
        it('returns success when the flag is on', async () => {
            await expect(call(setup(true))).resolves.toMatchObject({
                status: 'ok',
            });
        });
    },
);
