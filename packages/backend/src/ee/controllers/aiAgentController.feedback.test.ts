import { type AnonymousAccount, type SessionUser } from '@lightdash/common';
import { type Request } from 'express';
import { type ServiceRepository } from '../../services/ServiceRepository';
import { type AiAgentService } from '../services/AiAgentService/AiAgentService';
import { AiAgentController } from './aiAgentController';

describe('AiAgentController updatePromptFeedback', () => {
    const updateHumanScoreForMessage =
        vi.fn<AiAgentService['updateHumanScoreForMessage']>();
    const updateEmbedHumanScoreForMessage =
        vi.fn<AiAgentService['updateEmbedHumanScoreForMessage']>();
    const controller = new AiAgentController({
        getAiAgentService: () => ({
            updateHumanScoreForMessage,
            updateEmbedHumanScoreForMessage,
        }),
    } as unknown as ServiceRepository);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uses embed authorization and identity for JWT feedback', async () => {
        const account = {
            authentication: { type: 'jwt' },
            user: { type: 'anonymous', externalId: 'embed-viewer' },
        } as unknown as AnonymousAccount;
        const request = { account } as unknown as Request;

        await controller.updatePromptFeedback(
            request,
            'project-1',
            'agent-1',
            'thread-1',
            'message-1',
            { humanScore: -1, humanFeedback: 'Incorrect result' },
        );

        expect(updateEmbedHumanScoreForMessage).toHaveBeenCalledWith(
            account,
            'project-1',
            {
                agentUuid: 'agent-1',
                threadUuid: 'thread-1',
                messageUuid: 'message-1',
                humanScore: -1,
                humanFeedback: 'Incorrect result',
            },
        );
        expect(updateHumanScoreForMessage).not.toHaveBeenCalled();
    });

    it('keeps registered feedback on the registered-account service path', async () => {
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

        await controller.updatePromptFeedback(
            request,
            'project-1',
            'agent-1',
            'thread-1',
            'message-1',
            { humanScore: 1 },
        );

        expect(updateHumanScoreForMessage).toHaveBeenCalledWith(
            expect.anything() as SessionUser,
            'project-1',
            'agent-1',
            'thread-1',
            'message-1',
            1,
            undefined,
        );
        expect(updateEmbedHumanScoreForMessage).not.toHaveBeenCalled();
    });
});
