import {
    AgentActorSurface,
    type AiAgent,
    type SlackPrompt,
} from '@lightdash/common';
import {
    agentExecutionContext,
    fillScopedSlackAppId,
} from '../../../services/AiAccessService/agentExecutionContext';
import { AiAgentService } from './AiAgentService';

describe('Slack agent identity', () => {
    test('carries the loaded app id in the scheduled prompt', async () => {
        const slackAiPrompt = vi.fn();
        const service = new AiAgentService({
            slackClient: {
                setAssistantStatus: vi.fn().mockResolvedValue(undefined),
            },
            schedulerClient: { slackAiPrompt },
            lightdashConfig: { ai: {} },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        await service['setThinkingStatusAndSchedule']({
            agentConfig: {
                organizationUuid: 'org',
                projectUuid: 'project',
            } as AiAgent,
            slackPromptUuid: 'prompt',
            userUuid: 'user',
            channelId: 'channel',
            threadTs: 'ts',
            slackAppId: 'A123',
        });
        expect(slackAiPrompt).toHaveBeenCalledWith(
            expect.objectContaining({ slackAppId: 'A123' }),
        );
    });
    test.each(['A123', null])(
        'scopes app id %s to the running prompt',
        async (slackAppId) => {
            const prompt = { promptUuid: 'prompt' } as SlackPrompt;
            const findSlackPrompt = vi.fn().mockResolvedValue(prompt);
            const service = new AiAgentService({
                aiAgentModel: { findSlackPrompt },
                lightdashConfig: { ai: {} },
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            const generate = vi
                .spyOn(
                    service as unknown as {
                        generateSlackPromptReply: (
                            promptUuid: string,
                            slackPrompt: SlackPrompt,
                        ) => Promise<void>;
                    },
                    'generateSlackPromptReply',
                )
                .mockImplementation(async () => {
                    expect(agentExecutionContext.getStore()).toEqual({
                        surface: AgentActorSurface.SLACK_AGENT,
                        clientId: slackAppId,
                    });
                });
            await service.replyToSlackPrompt('prompt', slackAppId);
            expect(generate).toHaveBeenCalledWith('prompt', prompt);
            expect(findSlackPrompt).toHaveBeenCalledOnce();
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );
    test('fills a missing Slack app id from the loaded installation', () => {
        const actor = {
            surface: AgentActorSurface.SLACK_AGENT,
            clientId: null,
        };
        agentExecutionContext.run(actor, () => fillScopedSlackAppId('A123'));
        expect(actor.clientId).toBe('A123');
    });
    test('keeps a Slack app id that the job already carries', () => {
        const actor = {
            surface: AgentActorSurface.SLACK_AGENT,
            clientId: 'A-job' as string | null,
        };
        agentExecutionContext.run(actor, () => fillScopedSlackAppId('A123'));
        expect(actor.clientId).toBe('A-job');
    });
    test('leaves other surfaces and unscoped work alone', () => {
        const actor = {
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: null as string | null,
        };
        agentExecutionContext.run(actor, () => fillScopedSlackAppId('A123'));
        expect(actor.clientId).toBeNull();
        expect(() => fillScopedSlackAppId('A123')).not.toThrow();
    });
});
