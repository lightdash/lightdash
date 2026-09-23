import { defineUserAbility, OrganizationMemberRole } from '@lightdash/common';
import type { SlackStreamChunk } from '../../../clients/Slack/SlackClient';
import { AiAgentService } from './AiAgentService';

describe('Slack SQL approval progress', () => {
    it('completes every task before closing the card to wait for SQL approval', async () => {
        const user = {
            userUuid: 'user-uuid',
            organizationUuid: 'org-uuid',
            role: OrganizationMemberRole.DEVELOPER,
        };
        const taskStatuses = new Map<string, string>();
        const recordChunks = ({ chunks }: { chunks: SlackStreamChunk[] }) => {
            for (const chunk of chunks) {
                if (chunk.type === 'task_update') {
                    taskStatuses.set(chunk.id, chunk.status);
                }
            }
        };
        let statusesAtStop: Map<string, string> | undefined;
        const slackClient = {
            setAssistantStatus: vi.fn().mockResolvedValue(undefined),
            startAgentStream: vi.fn().mockImplementation(async (args) => {
                recordChunks(args);
                return { ts: '102.0' };
            }),
            appendAgentStream: vi.fn().mockImplementation(async (args) => {
                recordChunks(args);
            }),
            stopAgentStream: vi.fn().mockImplementation(async () => {
                statusesAtStop = new Map(taskStatuses);
            }),
            postMessage: vi.fn().mockResolvedValue({ ts: '103.0' }),
        };
        const service = new AiAgentService({
            lightdashConfig: {
                siteUrl: 'https://app.example.com',
                ai: { copilot: {}, decisions: {} },
            },
            userModel: {
                findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue({
                    ...user,
                    ability: defineUserAbility(user, []),
                }),
            },
            aiAgentModel: {
                findSlackPrompt: vi.fn().mockResolvedValue({
                    promptUuid: 'prompt-uuid',
                    threadUuid: 'thread-uuid',
                    projectUuid: 'project-uuid',
                    organizationUuid: user.organizationUuid,
                    createdByUserUuid: user.userUuid,
                    prompt: 'Run SQL',
                    slackChannelId: 'channel-id',
                    slackThreadTs: '100.0',
                    promptSlackTs: '101.0',
                }),
                findThread: vi.fn().mockResolvedValue({ agentUuid: null }),
                getThreadMessages: vi.fn().mockResolvedValue([]),
                getContextForPromptUuids: vi.fn().mockResolvedValue(new Map()),
                getPendingSqlApprovalForPrompt: vi.fn().mockResolvedValue({
                    toolCallId: 'sql-call',
                    sql: 'SELECT 1',
                }),
                updateSlackResponseTs: vi.fn().mockResolvedValue(undefined),
            },
            slackClient,
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        // Simulate the generation boundary pausing for native SQL approval.
        vi.spyOn(service, 'generateOrStreamAgentResponse').mockImplementation(
            async (_user, _conversation, options) => {
                await options.onSlackStepProgress?.(
                    'Reviewing tables',
                    'listWarehouseTables',
                    'tables-call',
                    'in_progress',
                );
                return '';
            },
        );

        await service.replyToSlackPrompt('prompt-uuid');

        expect(statusesAtStop).toEqual(
            new Map([
                ['agent_reasoning', 'complete'],
                ['listWarehouseTables', 'complete'],
            ]),
        );
        expect(slackClient.stopAgentStream).toHaveBeenCalledWith(
            expect.objectContaining({
                text: 'Waiting for approval to run SQL.',
            }),
        );
        expect(slackClient.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'Awaiting approval to run SQL' }),
        );
    });
});
