import { ParameterError, type AiAgent } from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import type { AiAgentModel } from '../../models/AiAgentModel';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class MockAiAgentMcpRuntimeClient {},
}));

const PROJECT_UUID = 'project-uuid';
const VISIBLE_THREAD_UUID = '11111111-1111-4111-8111-111111111111';
const HIDDEN_THREAD_UUID = '22222222-2222-4222-8222-222222222222';

const visibleAgent: AiAgent = {
    uuid: 'agent-uuid',
    projectUuid: PROJECT_UUID,
    organizationUuid: defaultSessionUser.organizationUuid!,
    integrations: [],
    tags: null,
    name: 'Agent',
    description: null,
    createdAt: new Date('2026-08-26T10:00:00.000Z'),
    updatedAt: new Date('2026-08-26T10:00:00.000Z'),
    instruction: null,
    imageUrl: null,
    imageUrlSource: null,
    groupAccess: [],
    userAccess: [],
    spaceAccess: [],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: true,
    enableUserContext: true,
    enableSqlMode: true,
    adminOnly: false,
    modelConfig: null,
    version: 1,
    threadRetentionHours: null,
};

const buildService = () => {
    const findThreadLiveStateSignals =
        vi.fn<AiAgentModel['findThreadLiveStateSignals']>();
    const service = new AiAgentService({
        aiAgentModel: { findThreadLiveStateSignals },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const listAgents = vi.spyOn(service, 'listAgents');

    return {
        service,
        findThreadLiveStateSignals: vi.mocked(findThreadLiveStateSignals),
        listAgents: vi.mocked(listAgents),
    };
};

describe('AiAgentService.getAgentThreadLiveStatuses', () => {
    it('returns statuses only for caller-owned threads on visible agents', async () => {
        const { service, findThreadLiveStateSignals, listAgents } =
            buildService();
        listAgents.mockResolvedValue([visibleAgent]);
        findThreadLiveStateSignals.mockResolvedValue([
            {
                threadUuid: VISIBLE_THREAD_UUID,
                threadCreatedAt: new Date('2026-08-26T10:00:00.000Z'),
                latestPrompt: {
                    createdAt: new Date('2026-08-26T11:58:00.000Z'),
                    respondedAt: new Date('2026-08-26T11:59:00.000Z'),
                    response: 'Done',
                    errorMessage: null,
                    interruptedAt: null,
                },
                runSqlToolCalls: [],
                pendingWritebackCreatedAt: null,
                activeDeepResearchRun: null,
            },
        ]);

        const result = await service.getAgentThreadLiveStatuses(
            defaultSessionUser,
            PROJECT_UUID,
            [VISIBLE_THREAD_UUID, HIDDEN_THREAD_UUID],
        );

        expect(result).toEqual([
            {
                threadUuid: VISIBLE_THREAD_UUID,
                state: 'idle',
                stateChangedAt: '2026-08-26T11:59:00.000Z',
                source: 'deterministic',
            },
        ]);
        expect(findThreadLiveStateSignals).toHaveBeenCalledWith({
            organizationUuid: defaultSessionUser.organizationUuid,
            threadUuids: [VISIBLE_THREAD_UUID, HIDDEN_THREAD_UUID],
            projectUuid: PROJECT_UUID,
            userUuid: defaultSessionUser.userUuid,
            agentUuids: [visibleAgent.uuid],
        });
    });

    it.each([[[]], [Array.from({ length: 101 }, (_, index) => `${index}`)]])(
        'rejects a request with %s thread UUIDs',
        async (threadUuids) => {
            const { service, findThreadLiveStateSignals, listAgents } =
                buildService();

            await expect(
                service.getAgentThreadLiveStatuses(
                    defaultSessionUser,
                    PROJECT_UUID,
                    threadUuids,
                ),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(listAgents).not.toHaveBeenCalled();
            expect(findThreadLiveStateSignals).not.toHaveBeenCalled();
        },
    );
});
