import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const PAYLOAD = {
    appUuid: 'app-1',
    version: 1,
    projectUuid: 'proj-1',
    organizationUuid: 'org-1',
    userUuid: 'user-1',
    prompt: 'Build a revenue app',
    isIteration: false,
    aiAgentToolCall: { promptUuid: 'prompt-1', toolCallId: 'tool-call-1' },
};

const buildService = (version: {
    status: string;
    error?: string | null;
    status_message?: string | null;
}) => {
    const updateToolResult = vi.fn().mockResolvedValue(undefined);
    const hasToolResult = vi.fn().mockResolvedValue(true);
    const service = new AiAgentService({
        lightdashConfig: { siteUrl: 'https://ld.example.com' },
        aiAgentModel: { updateToolResult, hasToolResult },
        appModel: {
            findAppByUuid: vi.fn().mockResolvedValue({ name: 'Revenue app' }),
            getVersion: vi.fn().mockResolvedValue({
                error: null,
                status_message: null,
                ...version,
            }),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { service, updateToolResult };
};

describe('AiAgentService.recordDataAppBuildOutcome', () => {
    it('does nothing for a build the AI agent did not start', async () => {
        const { service, updateToolResult } = buildService({
            status: 'ready',
        });

        await service.recordDataAppBuildOutcome({
            ...PAYLOAD,
            aiAgentToolCall: undefined,
        });

        expect(updateToolResult).not.toHaveBeenCalled();
    });

    it('patches a ready build to success with the builder link', async () => {
        const { service, updateToolResult } = buildService({
            status: 'ready',
        });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(updateToolResult).toHaveBeenCalledWith(
            'prompt-1',
            'tool-call-1',
            expect.objectContaining({
                metadata: {
                    status: 'success',
                    appUuid: 'app-1',
                    version: 1,
                    name: 'Revenue app',
                    href: 'https://ld.example.com/projects/proj-1/apps/app-1',
                },
            }),
        );
    });

    it('leaves the result pending while the version is still building', async () => {
        const { service, updateToolResult } = buildService({
            status: 'building',
        });

        await service.recordDataAppBuildOutcome(PAYLOAD);

        expect(updateToolResult).not.toHaveBeenCalled();
    });
});
