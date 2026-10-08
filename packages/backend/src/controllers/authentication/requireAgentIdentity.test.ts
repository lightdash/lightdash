import { FeatureFlags } from '@lightdash/common';
import { type NextFunction, type Request, type Response } from 'express';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { AiAccessService } from '../../services/AiAccessService/AiAccessService';
import { requireAgentIdentity } from './requireAgentIdentity';

it.each([false, true])(
    'checks the agent identity flag before OAuth with enabled=%s',
    async (enabled) => {
        const get = vi.fn(async () => ({ enabled }));
        const service = new AiAccessService({
            analytics: analyticsMock,
            featureFlagModel: { get },
        } as unknown as ConstructorParameters<typeof AiAccessService>[0]);
        const user = { userUuid: 'user', organizationUuid: 'org' };
        const request = {
            user,
            services: { getAiAccessService: () => service },
        } as unknown as Request;
        const next = vi.fn();
        await requireAgentIdentity(
            request,
            {} as Response,
            next as NextFunction,
        );
        expect(get).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.AgentIdentity,
        });
        if (enabled) {
            expect(next).toHaveBeenCalledExactlyOnceWith();
        } else {
            expect(next).toHaveBeenCalledExactlyOnceWith(
                expect.objectContaining({
                    name: 'FeatureNotEnabledError',
                    statusCode: 403,
                    data: {
                        code: 'feature_not_enabled',
                        featureFlagId: FeatureFlags.AgentIdentity,
                    },
                }),
            );
        }
    },
);
