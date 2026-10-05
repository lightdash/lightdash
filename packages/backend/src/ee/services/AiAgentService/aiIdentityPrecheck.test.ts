import {
    AiIdentityState,
    type AiAccessForUser,
    type SessionUser,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', async (importOriginal) => ({
    ...(await importOriginal()),
    AiAgentMcpRuntimeClient: class {},
}));

type PrivateService = {
    prepareAgentThreadResponse: (
        user: SessionUser,
        options: { agentUuid: string; threadUuid: string; aiCreditCheck: null },
    ) => Promise<unknown>;
    checkAgentThreadAccess: () => Promise<boolean>;
    maybeCompactThreadBeforeResponse: () => Promise<null>;
    generateOrStreamAgentResponse: () => Promise<string>;
};

const access: AiAccessForUser = {
    projectUuid: 'project',
    restrictionsOn: true,
    warehouseType: 'snowflake',
    aiIdentityRequired: true,
    state: AiIdentityState.PENDING,
    aiIdentityName: null,
    lastCheckedAt: null,
    action: 'ask_admin',
    message: "Your AI identity isn't set up yet. Ask an admin to set it up.",
    rawSqlAllowed: false,
};

const setup = (state: AiIdentityState) => {
    const updateModelResponse = vi.fn().mockResolvedValue(true);
    const addEvent = vi.fn().mockResolvedValue(undefined);
    const getAiAccessForUser = vi.fn().mockResolvedValue({ ...access, state });
    const service = new AiAgentService({
        lightdashConfig: { ai: { copilot: { embeddingEnabled: false } } },
        aiIdentityService: { getAiAccessForUser },
        aiIdentityModel: { addEvent },
        aiDeepResearchRunModel: {
            findByPromptForExecution: vi.fn().mockResolvedValue(null),
        },
        aiAgentModel: {
            getThread: vi.fn().mockResolvedValue({
                agentUuid: 'agent',
                user: { uuid: defaultSessionUser.userUuid },
            }),
            getAgent: vi
                .fn()
                .mockResolvedValue({ uuid: 'agent', projectUuid: 'project' }),
            getThreadMessages: vi
                .fn()
                .mockResolvedValue([{ ai_prompt_uuid: 'prompt' }]),
            findWebAppPrompt: vi.fn().mockResolvedValue({
                promptUuid: 'prompt',
                threadUuid: 'thread',
                projectUuid: 'project',
                response: null,
                errorMessage: null,
            }),
            claimPromptExecutionMode: vi.fn().mockResolvedValue(true),
            updateModelResponse,
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const internal = service as unknown as PrivateService;
    vi.spyOn(internal, 'checkAgentThreadAccess').mockResolvedValue(true);
    const compact = vi
        .spyOn(internal, 'maybeCompactThreadBeforeResponse')
        .mockRejectedValue(new Error('Reached compaction'));
    const generate = vi.spyOn(internal, 'generateOrStreamAgentResponse');
    return {
        service,
        internal,
        updateModelResponse,
        addEvent,
        getAiAccessForUser,
        compact,
        generate,
    };
};

it.each([
    AiIdentityState.NEEDS_SIGN_IN,
    AiIdentityState.PENDING,
    AiIdentityState.FAILED,
])('stores a fixed refusal before any model work for %s', async (state) => {
    const test = setup(state);
    await expect(
        test.internal.prepareAgentThreadResponse(defaultSessionUser, {
            agentUuid: 'agent',
            threadUuid: 'thread',
            aiCreditCheck: null,
        }),
    ).rejects.toThrow('ai_identity_not_ready');
    expect(test.updateModelResponse).toHaveBeenCalledWith({
        promptUuid: 'prompt',
        errorMessage: JSON.stringify({
            code: 'ai_identity_not_ready',
            state,
            message: access.message,
        }),
    });
    expect(test.addEvent).toHaveBeenCalledWith(
        expect.objectContaining({
            action: 'ai_identity_not_ready',
            status: 'error',
        }),
    );
    expect(test.compact).not.toHaveBeenCalled();
    expect(test.generate).not.toHaveBeenCalled();
    expect(test.getAiAccessForUser).toHaveBeenCalledWith(
        expect.objectContaining({ projectUuid: 'project' }),
    );
});

it('continues to preparation for a ready identity', async () => {
    const test = setup(AiIdentityState.READY);
    await expect(
        test.internal.prepareAgentThreadResponse(defaultSessionUser, {
            agentUuid: 'agent',
            threadUuid: 'thread',
            aiCreditCheck: null,
        }),
    ).rejects.toThrow('Reached compaction');
    expect(test.updateModelResponse).not.toHaveBeenCalled();
    expect(test.addEvent).not.toHaveBeenCalled();
});

it('returns the stored typed refusal on the streaming path without overwriting it', async () => {
    const test = setup(AiIdentityState.PENDING);
    await expect(
        test.service.streamAgentThreadResponse(defaultSessionUser, {
            agentUuid: 'agent',
            threadUuid: 'thread',
            toolHints: [],
        }),
    ).rejects.toThrow('ai_identity_not_ready');
    expect(test.updateModelResponse).toHaveBeenCalledOnce();
    expect(test.compact).not.toHaveBeenCalled();
    expect(test.generate).not.toHaveBeenCalled();
});
