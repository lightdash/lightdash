import { type AiAgent } from '@lightdash/common';
import { AiAgentService } from './AiAgentService';
import {
    slackPromptAttachmentRefs,
    type SlackPromptAttachmentRef,
} from './slackPromptAttachments';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class MockAiAgentMcpRuntimeClient {},
}));

const agentConfig: AiAgent = {
    uuid: 'agent-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'organization-uuid',
    integrations: [],
    tags: null,
    name: 'Finance',
    description: null,
    createdAt: new Date('2026-11-20T10:00:00.000Z'),
    updatedAt: new Date('2026-11-20T10:00:00.000Z'),
    instruction: null,
    imageUrl: null,
    imageUrlSource: null,
    groupAccess: [],
    userAccess: [],
    userAccessDetails: [],
    spaceAccess: [],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: true,
    enableUserContext: true,
    enableSqlMode: true,
    enableSqlAutoApproval: false,
    enableComposerQueries: false,
    adminOnly: false,
    modelConfig: null,
    providerCredentialUuid: null,
    version: 1,
    threadRetentionHours: null,
};

describe('slackPromptAttachmentRefs', () => {
    it('reads the file references off an incoming Slack message, in order', () => {
        expect(
            slackPromptAttachmentRefs({
                files: [{ id: 'F-ONE' }, { id: 'F-TWO' }],
            }),
        ).toEqual([{ slackFileId: 'F-ONE' }, { slackFileId: 'F-TWO' }]);
    });

    it('is empty for a message without files', () => {
        expect(slackPromptAttachmentRefs({})).toEqual([]);
        expect(slackPromptAttachmentRefs({ files: [] })).toEqual([]);
    });

    it('skips a file Slack returned without an id', () => {
        expect(
            slackPromptAttachmentRefs({ files: [{}, { id: 'F-ONE' }] }),
        ).toEqual([{ slackFileId: 'F-ONE' }]);
    });
});

describe('Slack prompt created after the user picks an agent', () => {
    const attachments: SlackPromptAttachmentRef[] = [
        { slackFileId: 'F-ONE' },
        { slackFileId: 'F-TWO' },
    ];

    const createFromAction = async (forwardToAgent: boolean) => {
        const createSlackPrompt = vi
            .fn<AiAgentService['createSlackPrompt']>()
            .mockResolvedValue(['slack-prompt-uuid', true]);
        const setThinkingStatusAndSchedule = vi
            .fn<(args: { slackPromptUuid: string }) => Promise<void>>()
            .mockResolvedValue(undefined);
        // The deferred paths (agent picker, channel link) all create the
        // prompt through this one method.
        await AiAgentService.prototype['createSlackPromptFromAction'].call(
            { createSlackPrompt, setThinkingStatusAndSchedule },
            {
                organizationUuid: 'organization-uuid',
                slackAppId: null,
                channelId: 'C123',
                threadTs: '1700000000.000100',
                agentConfig,
                userUuid: 'user-uuid',
                slackUserId: 'U123',
                promptText: 'what were revenues last month?',
                promptSlackTs: '1700000000.000300',
                attachments,
                forwardToAgent,
            },
        );
        return { createSlackPrompt, setThinkingStatusAndSchedule };
    };

    it('hands the attachment references of the original message to prompt creation', async () => {
        const { createSlackPrompt, setThinkingStatusAndSchedule } =
            await createFromAction(true);

        expect(createSlackPrompt).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                agentUuid: 'agent-uuid',
                prompt: 'what were revenues last month?',
                promptSlackTs: '1700000000.000300',
                attachments,
            }),
        );
        expect(setThinkingStatusAndSchedule).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ slackPromptUuid: 'slack-prompt-uuid' }),
        );
    });

    it('still records them when the message is not forwarded to the agent', async () => {
        const { createSlackPrompt, setThinkingStatusAndSchedule } =
            await createFromAction(false);

        expect(createSlackPrompt).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ attachments }),
        );
        expect(setThinkingStatusAndSchedule).not.toHaveBeenCalled();
    });
});
