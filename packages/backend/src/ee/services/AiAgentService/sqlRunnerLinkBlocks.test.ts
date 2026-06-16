import { AiAgentService } from './AiAgentService';

jest.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: jest.fn().mockImplementation(() => ({})),
}));

const SITE_URL = 'https://app.example.com';

const buildService = (overrides: {
    toolCalls: unknown[];
    toolResults: unknown[];
}) => {
    const createShareUrl = jest.fn().mockResolvedValue({ nanoid: 'share123' });
    const aiAgentModel = {
        getToolCallsForPrompt: jest.fn().mockResolvedValue(overrides.toolCalls),
        getToolResultsForPrompt: jest
            .fn()
            .mockResolvedValue(overrides.toolResults),
    };
    const service = new AiAgentService({
        aiAgentModel,
        shareService: { createShareUrl },
        lightdashConfig: { siteUrl: SITE_URL },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { service, createShareUrl };
};

const runSqlCall = (toolCallId: string, sql: string, limit?: number) => ({
    tool_call_id: toolCallId,
    tool_name: 'runSql',
    tool_args: { sql, ...(limit !== undefined ? { limit } : {}) },
});

const runSqlResult = (toolCallId: string, status: string) => ({
    toolCallId,
    toolName: 'runSql',
    metadata: { status },
});

const slackPrompt = { promptUuid: 'prompt-1', projectUuid: 'proj-1' };

const callHelper = (service: AiAgentService) =>
    (
        service as unknown as {
            getSqlRunnerLinkBlocks: (
                u: unknown,
                p: unknown,
            ) => Promise<unknown[]>;
        }
    ).getSqlRunnerLinkBlocks({ userUuid: 'user-1' }, slackPrompt);

describe('AiAgentService.getSqlRunnerLinkBlocks', () => {
    it('renders an Open in SQL Runner link for the latest successful runSql', async () => {
        const { service, createShareUrl } = buildService({
            toolCalls: [
                runSqlCall('a', 'SELECT 1', 10),
                runSqlCall('b', 'SELECT 2', 20),
            ],
            toolResults: [
                runSqlResult('a', 'success'),
                runSqlResult('b', 'success'),
            ],
        });

        const blocks = (await callHelper(service)) as Array<{
            type: string;
            elements: Array<{
                type: string;
                url: string;
                text: { text: string };
            }>;
        }>;

        expect(blocks).toHaveLength(1);
        const button = blocks[0].elements[0];
        expect(button.text.text).toBe('Open in SQL Runner');
        expect(button.url).toBe(
            `${SITE_URL}/projects/proj-1/sql-runner?share=share123`,
        );

        // Latest successful query (b) is the one shared, with chartConfig present.
        const [, path, params] = createShareUrl.mock.calls[0];
        expect(path).toBe('/projects/proj-1/sql-runner');
        const parsed = JSON.parse(params);
        expect(parsed).toEqual({
            sqlRunnerState: { sql: 'SELECT 2', limit: 20 },
            chartConfig: null,
        });
    });

    it('returns no blocks when there is no runSql tool call', async () => {
        const { service } = buildService({ toolCalls: [], toolResults: [] });
        expect(await callHelper(service)).toEqual([]);
    });

    it('returns no blocks when the runSql did not succeed', async () => {
        const { service } = buildService({
            toolCalls: [runSqlCall('a', 'SELECT 1')],
            toolResults: [runSqlResult('a', 'error')],
        });
        expect(await callHelper(service)).toEqual([]);
    });
});
