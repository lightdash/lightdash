import { NotFoundError } from '@lightdash/common';
import { defaultSessionUser as user } from '../../../auth/account/account.mock';
import {
    SemanticStudioChatService,
    type SemanticStudioChatServiceArguments,
} from './SemanticStudioChatService';

const PROJECT_UUID = 'project-uuid';
const THREAD_UUID = 'thread-uuid';
const MESSAGE_UUID = 'message-uuid';
const thread = { projectUuid: PROJECT_UUID, threadUuid: THREAD_UUID };
const message = { ...thread, messageUuid: MESSAGE_UUID };

const setup = (threadAgentUuid: string | null) => {
    const ai = {
        getAgentThread: vi.fn(),
        createAgentThread: vi.fn(),
        createAgentThreadMessage: vi.fn(),
        streamAgentThreadResponse: vi.fn(),
        interruptAgentThreadMessage: vi.fn(),
        createAgentThreadMessageSteer: vi.fn(),
        generateThreadTitle: vi.fn(),
    } satisfies SemanticStudioChatServiceArguments['ai'];
    const getBuilderAgent = vi.fn(async () => ({ uuid: 'built-in-agent' }));
    const findStudioThreadAgentUuid = vi.fn(async () => threadAgentUuid);
    const service = new SemanticStudioChatService({
        ai,
        checkout: { getBuilderAgent },
        workspaceModel: { findStudioThreadAgentUuid },
    });
    return { service, ai, getBuilderAgent, findStudioThreadAgentUuid };
};

describe('SemanticStudioChatService', () => {
    it('starts a conversation on the built-in agent as a Studio thread', async () => {
        const { service, ai, getBuilderAgent } = setup(null);

        await service.createThread(
            user,
            PROJECT_UUID,
            { prompt: 'Add a revenue metric' },
            'web_app',
        );

        expect(getBuilderAgent).toHaveBeenCalledWith(user, PROJECT_UUID);
        expect(ai.createAgentThread).toHaveBeenCalledWith(
            user,
            'built-in-agent',
            { prompt: 'Add a revenue metric', createdFrom: 'semantic_studio' },
            'web_app',
        );
    });

    it('does not start a conversation when the built-in agent is refused', async () => {
        const { service, ai, getBuilderAgent } = setup(null);
        getBuilderAgent.mockRejectedValueOnce(new Error('refused'));

        await expect(
            service.createThread(
                user,
                PROJECT_UUID,
                { prompt: 'Hi' },
                'web_app',
            ),
        ).rejects.toThrow('refused');
        expect(ai.createAgentThread).not.toHaveBeenCalled();
    });

    it('reads a conversation through the agent it runs on, built-in or not', async () => {
        const { service, ai, findStudioThreadAgentUuid } =
            setup('older-user-agent');

        await service.getThread(user, thread);

        expect(findStudioThreadAgentUuid).toHaveBeenCalledWith(
            PROJECT_UUID,
            THREAD_UUID,
        );
        expect(ai.getAgentThread).toHaveBeenCalledWith(
            user,
            'older-user-agent',
            THREAD_UUID,
        );
    });

    it('passes a message, a title request and the stream options to that agent', async () => {
        const { service, ai } = setup('agent-uuid');

        await service.createMessage(user, thread, { prompt: 'And a margin' });
        await service.generateTitle(user, thread);
        await service.streamResponse(user, thread, { autoApproveSql: true });
        await service.streamResponse(user, thread, undefined);

        expect(ai.createAgentThreadMessage).toHaveBeenCalledWith(
            user,
            'agent-uuid',
            THREAD_UUID,
            { prompt: 'And a margin' },
        );
        expect(ai.generateThreadTitle).toHaveBeenCalledWith(user, {
            agentUuid: 'agent-uuid',
            threadUuid: THREAD_UUID,
        });
        expect(ai.streamAgentThreadResponse).toHaveBeenNthCalledWith(1, user, {
            agentUuid: 'agent-uuid',
            threadUuid: THREAD_UUID,
            enableSqlMode: undefined,
            enableFastDecisions: true,
            autoApproveSql: true,
            toolHints: [],
        });
        expect(ai.streamAgentThreadResponse).toHaveBeenNthCalledWith(2, user, {
            agentUuid: 'agent-uuid',
            threadUuid: THREAD_UUID,
            enableSqlMode: undefined,
            enableFastDecisions: true,
            autoApproveSql: false,
            toolHints: [],
        });
    });

    it('interrupts and steers a message on that agent', async () => {
        const { service, ai } = setup('agent-uuid');

        await service.interruptMessage(user, message);
        await service.steerMessage(user, message, 'Use net revenue');

        expect(ai.interruptAgentThreadMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                user: expect.objectContaining({ id: user.userUuid }),
            }),
            { ...message, agentUuid: 'agent-uuid' },
        );
        expect(ai.createAgentThreadMessageSteer).toHaveBeenCalledWith(
            expect.anything(),
            { ...message, agentUuid: 'agent-uuid', message: 'Use net revenue' },
        );
    });

    it('answers not found for a thread that is not a Studio one in this project', async () => {
        const { service, ai } = setup(null);

        await expect(service.getThread(user, thread)).rejects.toThrow(
            NotFoundError,
        );
        await expect(
            service.createMessage(user, thread, { prompt: 'Hi' }),
        ).rejects.toThrow(NotFoundError);
        await expect(
            service.streamResponse(user, thread, undefined),
        ).rejects.toThrow(NotFoundError);
        await expect(service.interruptMessage(user, message)).rejects.toThrow(
            NotFoundError,
        );
        expect(ai.getAgentThread).not.toHaveBeenCalled();
        expect(ai.createAgentThreadMessage).not.toHaveBeenCalled();
        expect(ai.streamAgentThreadResponse).not.toHaveBeenCalled();
        expect(ai.interruptAgentThreadMessage).not.toHaveBeenCalled();
    });
});
