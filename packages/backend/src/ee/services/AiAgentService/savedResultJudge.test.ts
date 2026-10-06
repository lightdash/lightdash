import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { logAiEgressBlock } from '../../../utils/aiEgress/logAiEgressBlock';
import { getModel } from '../ai/models';
import { llmAsAJudge } from '../ai/utils/llmAsAJudge';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/models', () => ({ getModel: vi.fn() }));
vi.mock('../ai/utils/llmAsAJudge', () => ({ llmAsAJudge: vi.fn() }));
vi.mock('../../../utils/aiEgress/logAiEgressBlock', () => ({
    logAiEgressBlock: vi.fn(),
}));

const makeService = (restrictionsEnabled: boolean) => {
    const service = new AiAgentService({
        lightdashConfig: lightdashConfigMock,
        projectModel: {
            getAiAccessRestrictions: vi
                .fn()
                .mockResolvedValue(restrictionsEnabled),
        },
        aiAgentModel: {
            createLlmAssessment: vi.fn(),
            getEvalResultDataForAssessment: vi.fn().mockResolvedValue({
                projectUuid: 'project',
                organizationUuid: 'org',
                query: 'Count orders',
                response: 'WAREHOUSE_ROW_SECRET',
                expectedAnswer: null,
                artifact: null,
                toolResults: [
                    {
                        toolName: 'runQuery',
                        result: '```csv\nName,Count\nWAREHOUSE_ROW_SECRET,1\n```',
                        metadata: null,
                    },
                ],
            }),
        },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.mocked(getModel).mockReturnValue({
        model: {} as never,
        callOptions: {},
        keyManagement: 'instance',
    } as never);
    vi.mocked(llmAsAJudge).mockResolvedValue({
        result: { score: 1, reason: 'Relevant' },
        meta: { passed: true },
    } as never);
    return service;
};

describe('saved result eval judge', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sends metadata and logs a block under restrictions', async () => {
        await makeService(true).assessResult('result', true);

        const payload = JSON.stringify(vi.mocked(llmAsAJudge).mock.calls);
        expect(payload).toContain('rowCount');
        expect(payload).not.toContain('WAREHOUSE_ROW_SECRET');
        expect(logAiEgressBlock).toHaveBeenCalledWith(
            expect.objectContaining({
                surface: 'agent_judge',
                reason: 'metadata_only',
            }),
        );
    });

    it('keeps the current judge payload with restrictions off', async () => {
        await makeService(false).assessResult('result', true);

        expect(JSON.stringify(vi.mocked(llmAsAJudge).mock.calls)).toContain(
            'WAREHOUSE_ROW_SECRET',
        );
        expect(logAiEgressBlock).not.toHaveBeenCalled();
    });
});
