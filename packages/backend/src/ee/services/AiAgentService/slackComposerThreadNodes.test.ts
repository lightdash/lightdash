import { type SlackPrompt } from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { AiAgentService } from './AiAgentService';

const buildService = (
    listComposerQueryNodes: () => Promise<unknown>,
    toolName: string,
) =>
    new AiAgentService({
        lightdashConfig: {
            siteUrl: 'https://lightdash.example',
            ai: { copilot: { maxQueryLimit: 500 } },
        },
        aiAgentModel: {
            findThreadReferencedArtifacts: vi.fn().mockResolvedValue(new Map()),
            findArtifactsByThreadUuid: vi.fn().mockResolvedValue([]),
            findArtifactVersionsByPromptUuid: vi.fn().mockResolvedValue([]),
            listComposerQueryNodes,
            getToolCallsForPrompt: vi.fn().mockResolvedValue([
                {
                    tool_call_id: 'composer-call',
                    tool_name: toolName,
                    tool_args: { queries: [], terminalNodeId: null },
                },
            ]),
            getToolResultsForPrompt: vi.fn().mockResolvedValue([
                {
                    toolCallId: 'composer-call',
                    toolName,
                    metadata: {
                        status: 'success',
                        queryUuid: 'query-1',
                        terminalNodeId: 'orders',
                        title: 'Orders',
                        description: null,
                    },
                },
            ]),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);

test.each(['query', 'runComposerQueries'])(
    'Slack final blocks still build when the composer node registry cannot be read (%s)',
    async (toolName) => {
        const listComposerQueryNodes = vi
            .fn()
            .mockRejectedValue(new Error('registry unavailable'));
        const service = buildService(listComposerQueryNodes, toolName);
        vi.spyOn(service, 'getDecisionClient').mockResolvedValue(undefined);
        await expect(
            service['getSlackAgentFinalBlocks']({
                user: defaultSessionUser,
                slackPrompt: {
                    promptUuid: 'prompt',
                    projectUuid: 'project',
                    threadUuid: 'thread',
                    organizationUuid: defaultSessionUser.organizationUuid,
                } as SlackPrompt,
                agent: undefined,
                response: 'Orders are up <slack-table queryUuid="query-1" />',
                runtimeTableResults: new Map(),
                accessRefusal: null,
            }),
        ).resolves.toEqual([]);
        expect(listComposerQueryNodes).toHaveBeenCalledOnce();
    },
);
