import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const SITE_URL = 'https://app.example.com';

const buildService = (overrides: {
    toolCalls: unknown[];
    toolResults: unknown[];
}) => {
    const createShareUrl = vi.fn().mockResolvedValue({ nanoid: 'share123' });
    const aiAgentModel = {
        getToolCallsForPrompt: vi.fn().mockResolvedValue(overrides.toolCalls),
        getToolResultsForPrompt: vi
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

const getShareUrl = (service: AiAgentService) =>
    (
        service as unknown as {
            getSqlRunnerShareUrl: (
                u: unknown,
                p: unknown,
            ) => Promise<string | undefined>;
        }
    ).getSqlRunnerShareUrl({ userUuid: 'user-1' }, slackPrompt);

const applyLink = (text: string, url: string | undefined) =>
    (
        AiAgentService as unknown as {
            applySqlRunnerLinkForSlack: (t: string, u?: string) => string;
        }
    ).applySqlRunnerLinkForSlack(text, url);

describe('AiAgentService SQL Runner link', () => {
    describe('getSqlRunnerShareUrl', () => {
        it('builds a share URL for the latest successful runSql', async () => {
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

            const url = await getShareUrl(service);
            expect(url).toBe(
                `${SITE_URL}/projects/proj-1/sql-runner?share=share123`,
            );

            // Latest successful query (b) is shared, with chartConfig present.
            const [, path, params] = createShareUrl.mock.calls[0];
            expect(path).toBe('/projects/proj-1/sql-runner');
            expect(JSON.parse(params)).toEqual({
                sqlRunnerState: { sql: 'SELECT 2', limit: 20 },
                chartConfig: null,
            });
        });

        it('returns undefined when there is no runSql call', async () => {
            const { service } = buildService({
                toolCalls: [],
                toolResults: [],
            });
            expect(await getShareUrl(service)).toBeUndefined();
        });

        it('returns undefined when the runSql did not succeed', async () => {
            const { service } = buildService({
                toolCalls: [runSqlCall('a', 'SELECT 1')],
                toolResults: [runSqlResult('a', 'error')],
            });
            expect(await getShareUrl(service)).toBeUndefined();
        });
    });

    describe('applySqlRunnerLinkForSlack', () => {
        const url = `${SITE_URL}/projects/proj-1/sql-runner?share=share123`;

        it('resolves the anchor to the real share URL', () => {
            const text =
                'Here you go.\n\n[Open in SQL Runner](#sql-runner-link)';
            expect(applyLink(text, url)).toBe(
                `Here you go.\n\n[Open in SQL Runner](${url})`,
            );
        });

        it('drops the dead anchor when there is no share URL', () => {
            const text =
                'Here you go.\n\n[Open in SQL Runner](#sql-runner-link)';
            expect(applyLink(text, undefined)).toBe('Here you go.');
        });

        it('leaves text without the anchor untouched', () => {
            expect(applyLink('Just an answer.', url)).toBe('Just an answer.');
        });
    });
});
