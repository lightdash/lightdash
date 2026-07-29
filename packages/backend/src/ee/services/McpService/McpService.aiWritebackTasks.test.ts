import { ForbiddenError, NotFoundError } from '@lightdash/common';
import { McpError } from '@modelcontextprotocol/sdk/types.js'; // eslint-disable-line import/extensions
import { McpService, McpToolName } from './McpService';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

type RegisteredRequestHandler = (
    request: { method: string; params: Record<string, unknown> },
    extra: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();
const mockRegisteredRequestHandlers = new Map<
    string,
    RegisteredRequestHandler
>();
const mockRegisterCapabilities = vi.fn();

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    getActiveSpan: () => undefined,
    isEnabled: () => false,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockMcpServer() {
            return {
                server: {
                    registerCapabilities: mockRegisterCapabilities,
                    setRequestHandler: vi.fn(
                        (
                            schema: {
                                shape: { method: { value: string } };
                            },
                            handler: RegisteredRequestHandler,
                        ) => {
                            mockRegisteredRequestHandlers.set(
                                schema.shape.method.value,
                                handler,
                            );
                        },
                    ),
                },
                registerResource: vi.fn(),
                registerPrompt: vi.fn(),
                registerTool: vi.fn(
                    (
                        name: string,
                        _config: Record<string, unknown>,
                        callback: RegisteredToolCallback,
                    ) => {
                        mockRegisteredMcpTools.set(name, callback);
                        return {};
                    },
                ),
            };
        },
    ),
}));

const organizationUuid = 'organization-uuid';
const userUuid = 'user-uuid';
const projectUuid = 'project-uuid';
const runUuid = '11111111-1111-4111-8111-111111111111';

const user = {
    userUuid,
    organizationUuid,
    ability: {
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => undefined),
        rules: [],
    },
};

const account = {
    isRegisteredUser: () => true,
    isServiceAccount: () => false,
    authentication: { type: 'pat' },
    user: { id: userUuid },
};

const tasksOptInMeta = {
    'io.modelcontextprotocol/clientCapabilities': {
        extensions: {
            'io.modelcontextprotocol/tasks': {},
        },
    },
};

const makeExtra = (meta?: Record<string, unknown>) => ({
    signal: new AbortController().signal,
    requestId: 'request-id',
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
    ...(meta ? { _meta: meta } : {}),
    authInfo: {
        extra: {
            user,
            account,
        },
    },
});

const makeMcpService = ({
    aiWritebackService,
}: {
    aiWritebackService: Record<string, unknown>;
}) =>
    new McpService({
        aiAgentService: {},
        aiAgentToolsService: { createRuntime: vi.fn() },
        aiOrganizationSettingsService: {},
        aiRouterService: {},
        aiWritebackService,
        analytics: { track: vi.fn() },
        asyncQueryService: {},
        catalogService: {},
        contentVerificationService: {},
        featureFlagService: {},
        lightdashConfig: {
            mcp: { runSqlMaxLimit: 500 },
            siteUrl: 'https://lightdash.example',
        },
        mcpContextModel: {
            getContext: vi.fn().mockResolvedValue({
                context: {
                    projectUuid,
                    projectName: 'Project',
                    agentUuid: null,
                    agentName: null,
                    tags: null,
                },
            }),
        },
        mcpToolCallModel: {
            createToolCall: vi.fn(),
            findClientInfo: vi.fn(),
        },
        projectModel: {},
        projectService: {},
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);

const runSnapshot = (overrides: Record<string, unknown> = {}) => ({
    status: 'agent',
    prUrl: null,
    errorMessage: null,
    createdAt: new Date('2026-07-01T10:00:00Z'),
    updatedAt: new Date('2026-07-01T10:05:00Z'),
    source: 'mcp',
    ...overrides,
});

const createServerWithWriteback = async (
    aiWritebackService: Record<string, unknown>,
) => {
    mockRegisteredMcpTools.clear();
    mockRegisteredRequestHandlers.clear();
    mockRegisterCapabilities.mockClear();
    const mcpService = makeMcpService({ aiWritebackService });
    await mcpService.createServer({ aiWritebackEnabled: true });
};

describe('McpService AI writeback MCP tasks', () => {
    describe('registration', () => {
        it('registers tasks/get and tasks/cancel handlers and advertises the extension', async () => {
            await createServerWithWriteback({});

            expect([...mockRegisteredRequestHandlers.keys()]).toEqual(
                expect.arrayContaining(['tasks/get', 'tasks/cancel']),
            );
            expect(mockRegisterCapabilities).toHaveBeenCalledWith(
                expect.objectContaining({
                    tasks: {},
                    extensions: expect.objectContaining({
                        'io.modelcontextprotocol/tasks': {},
                    }),
                }),
            );
        });

        it('does not register task handlers when writeback is disabled', async () => {
            mockRegisteredRequestHandlers.clear();
            const mcpService = makeMcpService({ aiWritebackService: {} });
            await mcpService.createServer({ aiWritebackEnabled: false });

            expect(mockRegisteredRequestHandlers.size).toBe(0);
        });
    });

    describe('run_ai_writeback task augmentation', () => {
        it('returns the legacy uuid response when the client did not opt in', async () => {
            const enqueueWriteback = vi.fn().mockResolvedValue({
                aiWritebackRunUuid: runUuid,
                createdAt: new Date('2026-07-01T10:00:00Z'),
                updatedAt: new Date('2026-07-01T10:00:00Z'),
            });
            await createServerWithWriteback({ enqueueWriteback });

            const callback = mockRegisteredMcpTools.get(
                McpToolName.RUN_AI_WRITEBACK,
            )!;
            const result = await callback(
                { prompt: 'add a metric' },
                makeExtra(),
            );

            expect(result).not.toHaveProperty('resultType');
            expect(result.structuredContent).toEqual({
                aiWritebackRunUuid: runUuid,
            });
        });

        it('returns a CreateTaskResult when the client declared the tasks extension', async () => {
            const enqueueWriteback = vi.fn().mockResolvedValue({
                aiWritebackRunUuid: runUuid,
                createdAt: new Date('2026-07-01T10:00:00Z'),
                updatedAt: new Date('2026-07-01T10:00:00Z'),
            });
            await createServerWithWriteback({ enqueueWriteback });

            const callback = mockRegisteredMcpTools.get(
                McpToolName.RUN_AI_WRITEBACK,
            )!;
            const result = await callback(
                { prompt: 'add a metric' },
                makeExtra(tasksOptInMeta),
            );

            expect(result).toEqual(
                expect.objectContaining({
                    resultType: 'task',
                    taskId: runUuid,
                    status: 'working',
                    ttlMs: null,
                    pollIntervalMs: 5000,
                    // Row timestamps, not wall-clock: the handle must match
                    // what tasks/get later reports
                    createdAt: '2026-07-01T10:00:00.000Z',
                    lastUpdatedAt: '2026-07-01T10:00:00.000Z',
                }),
            );
            // A CreateTaskResult replaces the tool result entirely
            expect(result).not.toHaveProperty('content');
        });
    });

    describe('tasks/get', () => {
        const getTask = (taskId: string, extra = makeExtra(tasksOptInMeta)) =>
            mockRegisteredRequestHandlers.get('tasks/get')!(
                { method: 'tasks/get', params: { taskId } },
                extra,
            );

        it('rejects requests that do not declare the tasks capability with -32003', async () => {
            const getRunSnapshot = vi.fn();
            await createServerWithWriteback({ getRunSnapshot });

            await expect(getTask(runUuid, makeExtra())).rejects.toMatchObject({
                code: -32003,
            });
            expect(getRunSnapshot).not.toHaveBeenCalled();
        });

        it('normalizes non-mcp-sourced runs to task-not-found', async () => {
            const getRunSnapshot = vi
                .fn()
                .mockResolvedValue(runSnapshot({ source: 'web' }));
            await createServerWithWriteback({ getRunSnapshot });

            await expect(getTask(runUuid)).rejects.toThrow(
                `Task ${runUuid} not found`,
            );
        });

        it('maps an in-progress run to a working task', async () => {
            const getRunSnapshot = vi.fn().mockResolvedValue(runSnapshot());
            await createServerWithWriteback({ getRunSnapshot });

            const result = await getTask(runUuid);

            expect(result).toEqual({
                resultType: 'complete',
                taskId: runUuid,
                status: 'working',
                statusMessage:
                    'Running the coding agent against the dbt project.',
                createdAt: '2026-07-01T10:00:00.000Z',
                lastUpdatedAt: '2026-07-01T10:05:00.000Z',
                ttlMs: null,
                pollIntervalMs: 5000,
            });
            expect(getRunSnapshot).toHaveBeenCalledWith(user, runUuid);
        });

        it('maps a ready run to a completed task carrying the tool result', async () => {
            const prUrl = 'https://github.com/acme/analytics/pull/1';
            const getRunSnapshot = vi
                .fn()
                .mockResolvedValue(runSnapshot({ status: 'ready', prUrl }));
            await createServerWithWriteback({ getRunSnapshot });

            const result = await getTask(runUuid);

            expect(result).toEqual(
                expect.objectContaining({
                    resultType: 'complete',
                    status: 'completed',
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: `AI writeback complete. Pull request opened: ${prUrl}`,
                            },
                        ],
                        structuredContent: {
                            aiWritebackRunUuid: runUuid,
                            status: 'ready',
                            prUrl,
                            errorMessage: null,
                        },
                        isError: false,
                    },
                }),
            );
        });

        it('maps an errored run to a completed task whose result carries isError', async () => {
            const getRunSnapshot = vi.fn().mockResolvedValue(
                runSnapshot({
                    status: 'error',
                    errorMessage: 'dbt compile failed',
                }),
            );
            await createServerWithWriteback({ getRunSnapshot });

            const result = await getTask(runUuid);

            // Tool-level failures are completed tasks with an isError result;
            // the 'failed' status is reserved for JSON-RPC protocol faults
            expect(result).toEqual(
                expect.objectContaining({
                    status: 'completed',
                    result: {
                        content: [
                            {
                                type: 'text',
                                text: 'AI writeback failed: dbt compile failed',
                            },
                        ],
                        structuredContent: {
                            aiWritebackRunUuid: runUuid,
                            status: 'error',
                            prUrl: null,
                            errorMessage: 'dbt compile failed',
                        },
                        isError: true,
                    },
                }),
            );
            expect(result).not.toHaveProperty('error');
        });

        it('maps a cancelled run to a cancelled task', async () => {
            const getRunSnapshot = vi
                .fn()
                .mockResolvedValue(runSnapshot({ status: 'cancelled' }));
            await createServerWithWriteback({ getRunSnapshot });

            const result = await getTask(runUuid);

            expect(result).toEqual(
                expect.objectContaining({ status: 'cancelled' }),
            );
        });

        it('normalizes unknown and unauthorized runs to a task-not-found invalid-params error', async () => {
            const getRunSnapshot = vi
                .fn()
                .mockRejectedValueOnce(new NotFoundError('missing'))
                .mockRejectedValueOnce(new ForbiddenError());
            await createServerWithWriteback({ getRunSnapshot });

            await expect(getTask(runUuid)).rejects.toThrow(McpError);
            await expect(getTask(runUuid)).rejects.toThrow('not found');
        });

        it('rejects a non-uuid taskId without hitting the service', async () => {
            const getRunSnapshot = vi.fn();
            await createServerWithWriteback({ getRunSnapshot });

            await expect(getTask('not-a-uuid')).rejects.toThrow(McpError);
            expect(getRunSnapshot).not.toHaveBeenCalled();
        });
    });

    describe('tasks/cancel', () => {
        const cancelTask = (
            taskId: string,
            extra = makeExtra(tasksOptInMeta),
        ) =>
            mockRegisteredRequestHandlers.get('tasks/cancel')!(
                { method: 'tasks/cancel', params: { taskId } },
                extra,
            );

        it('rejects requests that do not declare the tasks capability with -32003', async () => {
            const cancelRun = vi.fn();
            await createServerWithWriteback({ cancelRun });

            await expect(
                cancelTask(runUuid, makeExtra()),
            ).rejects.toMatchObject({ code: -32003 });
            expect(cancelRun).not.toHaveBeenCalled();
        });

        it('reports a finalizing run as no longer cancellable', async () => {
            const cancelRun = vi
                .fn()
                .mockResolvedValue({ cancelled: false, status: 'push' });
            await createServerWithWriteback({ cancelRun });

            await expect(cancelTask(runUuid)).rejects.toThrow(
                'can no longer be cancelled: its pull request is being finalized',
            );
        });

        it('acknowledges cancellation of a non-terminal run with an empty result', async () => {
            const cancelRun = vi
                .fn()
                .mockResolvedValue({ cancelled: true, status: 'cancelled' });
            await createServerWithWriteback({ cancelRun });

            const result = await cancelTask(runUuid);

            expect(result).toEqual({ resultType: 'complete' });
            expect(cancelRun).toHaveBeenCalledWith(user, runUuid);
        });

        it('rejects cancelling an already-terminal run with invalid params', async () => {
            const cancelRun = vi
                .fn()
                .mockResolvedValue({ cancelled: false, status: 'ready' });
            await createServerWithWriteback({ cancelRun });

            await expect(cancelTask(runUuid)).rejects.toThrow(McpError);
            await expect(cancelTask(runUuid)).rejects.toThrow(
                "terminal status 'completed'",
            );
        });

        it('normalizes unknown runs to a task-not-found invalid-params error', async () => {
            const cancelRun = vi
                .fn()
                .mockRejectedValue(new NotFoundError('missing'));
            await createServerWithWriteback({ cancelRun });

            await expect(cancelTask(runUuid)).rejects.toThrow('not found');
        });

        it('normalizes authorization failures to the identical task-not-found error', async () => {
            const cancelRun = vi.fn().mockRejectedValue(new ForbiddenError());
            await createServerWithWriteback({ cancelRun });

            await expect(cancelTask(runUuid)).rejects.toThrow(McpError);
            await expect(cancelTask(runUuid)).rejects.toThrow(
                `Task ${runUuid} not found`,
            );
        });
    });
});
