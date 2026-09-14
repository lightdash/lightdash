import {
    ParameterError,
    type AiAgentSuggestionContext,
    type SessionUser,
} from '@lightdash/common';
import { type Request } from 'express';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { type AiAgentService } from '../services/AiAgentService/AiAgentService';
import { AiAgentController } from './aiAgentController';

describe('AiAgentController getAgentSuggestions', () => {
    const getAgentSuggestions = vi.fn<AiAgentService['getAgentSuggestions']>(
        async () => ({ chips: [] }),
    );
    const controller = new AiAgentController({
        getAiAgentService: () => ({ getAgentSuggestions }),
    } as unknown as ServiceRepository);
    const request = {
        account: {
            user: { type: 'registered', id: 'user-1' },
            organization: {
                organizationUuid: 'org-1',
                name: 'Org',
                createdAt: new Date('2024-01-01'),
            },
            authentication: { type: 'session' },
        },
    } as unknown as Request;

    it.each<AiAgentSuggestionContext>([
        { type: 'chart', chartUuid: 'chart-1' },
        { type: 'dashboard', dashboardUuid: 'dashboard-1' },
    ])('forwards $type context to the service', async (context) => {
        await controller.getAgentSuggestions(
            request,
            'project-1',
            'agent-1',
            undefined,
            undefined,
            false,
            JSON.stringify(context),
        );

        expect(getAgentSuggestions).toHaveBeenCalledWith(
            expect.anything() as SessionUser,
            {
                projectUuid: 'project-1',
                agentUuid: 'agent-1',
                threadUuid: undefined,
                afterMessageUuid: undefined,
                enableSqlMode: false,
                context,
            },
        );
    });

    it('rejects malformed context before calling the service', async () => {
        getAgentSuggestions.mockClear();

        await expect(
            controller.getAgentSuggestions(
                request,
                'project-1',
                'agent-1',
                undefined,
                undefined,
                false,
                JSON.stringify({ type: 'chart' }),
            ),
        ).rejects.toThrow(ParameterError);

        expect(getAgentSuggestions).not.toHaveBeenCalled();
    });
});
