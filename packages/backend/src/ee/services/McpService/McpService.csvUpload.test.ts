import {
    DimensionType,
    ExternalSourceScope,
    ExternalSourceStatus,
    ExternalSourceType,
    ParameterError,
    type ExternalSource,
} from '@lightdash/common';
import { McpService, McpToolName } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

type RegisteredToolCallback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

const mockRegisteredMcpTools = new Map<string, RegisteredToolCallback>();

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
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
                    registerCapabilities: vi.fn(),
                    setRequestHandler: vi.fn(),
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
const uploadId = '11111111-2222-3333-4444-555555555555';

const user = {
    userUuid,
    organizationUuid,
    ability: {
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => ({ inverted: false })),
        rules: [],
    },
};

const account = {
    isRegisteredUser: () => true,
    isServiceAccount: () => false,
    authentication: { type: 'pat' },
    user: { id: userUuid },
    organization: { organizationUuid },
};

const makeExtra = () => ({
    signal: new AbortController().signal,
    requestId: 'request-id',
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
    authInfo: { extra: { user, account } },
});

const source = (overrides: Partial<ExternalSource> = {}): ExternalSource => ({
    sourceUuid: uploadId,
    projectUuid,
    type: ExternalSourceType.CSV,
    scope: ExternalSourceScope.CATALOG,
    name: 'sales_targets',
    connection: {
        type: ExternalSourceType.CSV,
        originalFilename: 'targets.csv',
    },
    status: ExternalSourceStatus.SYNCING,
    errorMessage: null,
    createdByUserUuid: userUuid,
    lastRefreshedAt: null,
    tables: [],
    ...overrides,
});

const createServer = async (
    externalSourceService: Record<string, unknown>,
    csvUploadsEnabled = true,
) => {
    const mcpService = new McpService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiAgentService: {},
        aiAgentToolsService: {},
        aiOrganizationSettingsService: {
            getMcpProjectAccess: vi.fn().mockResolvedValue({ mode: 'all' }),
        },
        aiRouterService: {},
        aiWritebackService: {},
        analytics: { track: vi.fn() },
        asyncQueryService: {},
        catalogService: {},
        contentVerificationService: {},
        externalSourceService,
        featureFlagService: {},
        lightdashConfig: {
            mcp: { runSqlMaxLimit: 500 },
            siteUrl: 'https://lightdash.example',
            appRuntime: { sampleDataEnabled: true },
        },
        mcpContextModel: { getContext: vi.fn().mockResolvedValue(undefined) },
        mcpToolCallModel: {
            createToolCall: vi.fn(),
            findClientInfo: vi.fn(),
        },
        projectModel: {},
        projectService: {
            getProject: vi.fn().mockResolvedValue({ organizationUuid }),
        },
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);
    mockRegisteredMcpTools.clear();
    await mcpService.createServer(makeMcpServerOptions({ csvUploadsEnabled }));
};

const callTool = (name: McpToolName, args: Record<string, unknown>) => {
    const callback = mockRegisteredMcpTools.get(name);
    if (!callback) throw new Error(`${name} was not registered`);
    return callback({ projectUuid, ...args }, makeExtra());
};

const csvTools = [
    McpToolName.PREPARE_CSV_UPLOAD,
    McpToolName.COMMIT_CSV_UPLOAD,
    McpToolName.GET_CSV_UPLOAD_STATUS,
];

describe('McpService CSV upload tools', () => {
    it.each([true, false])(
        'registers the tools only when uploads are available (%s)',
        async (enabled) => {
            await createServer({}, enabled);

            csvTools.forEach((name) =>
                expect(mockRegisteredMcpTools.has(name)).toBe(enabled),
            );
        },
    );

    it('prepares an upload and hands back a ready curl command', async () => {
        const prepareCsvUpload = vi.fn().mockResolvedValue({
            uploadId,
            uploadRequest: {
                method: 'PUT',
                url: 'https://lightdash.example/upload',
                headers: {
                    'Content-Type': 'text/csv',
                    'x-lightdash-upload-token': 'signed-token',
                },
            },
            expiresAt: new Date('2026-11-24T12:05:00Z'),
        });
        await createServer({ prepareCsvUpload });

        const result = await callTool(McpToolName.PREPARE_CSV_UPLOAD, {
            filename: 'targets.csv',
            sizeBytes: 12,
        });

        expect(prepareCsvUpload).toHaveBeenCalledWith(account, projectUuid, {
            filename: 'targets.csv',
            sizeBytes: 12,
        });
        expect(result.structuredContent).toEqual({
            uploadId,
            uploadRequest: {
                method: 'PUT',
                url: 'https://lightdash.example/upload',
                headers: {
                    'Content-Type': 'text/csv',
                    'x-lightdash-upload-token': 'signed-token',
                },
            },
            curlCommand:
                "curl -sS --fail-with-body -T <path-to-file> -H 'Content-Type: text/csv' -H 'x-lightdash-upload-token: signed-token' 'https://lightdash.example/upload'",
            expiresAt: '2026-11-24T12:05:00.000Z',
        });
    });

    it('commits an upload and reports the columns it found', async () => {
        const commitPreparedCsvUpload = vi.fn().mockResolvedValue({
            source: source(),
            inferredColumns: {
                region: { reference: 'region', type: DimensionType.STRING },
                target: { reference: 'target', type: DimensionType.NUMBER },
            },
            sampleRows: [{ region: 'EMEA', target: 100 }],
        });
        await createServer({ commitPreparedCsvUpload });

        const result = await callTool(McpToolName.COMMIT_CSV_UPLOAD, {
            uploadId,
            tableName: 'sales_targets',
        });

        expect(commitPreparedCsvUpload).toHaveBeenCalledWith(
            account,
            projectUuid,
            uploadId,
            { tableName: 'sales_targets', label: null },
        );
        expect(result.structuredContent).toEqual({
            uploadId,
            tableName: 'sales_targets',
            columns: [
                { name: 'region', type: DimensionType.STRING },
                { name: 'target', type: DimensionType.NUMBER },
            ],
            sampleRows: [{ region: 'EMEA', target: 100 }],
        });
    });

    it('names the explore once the table is ready', async () => {
        await createServer({
            get: vi.fn().mockResolvedValue(
                source({
                    status: ExternalSourceStatus.READY,
                    tables: [
                        {
                            tableUuid: 'table-uuid',
                            sourceUuid: uploadId,
                            name: 'sales_targets',
                            label: 'Sales targets',
                            columns: {
                                region: {
                                    reference: 'region',
                                    type: DimensionType.STRING,
                                },
                            },
                            rowCount: 42,
                            totalBytes: 1024,
                            version: 1,
                            lastIngestedAt: new Date(),
                        },
                    ],
                }),
            ),
        });

        const result = await callTool(McpToolName.GET_CSV_UPLOAD_STATUS, {
            uploadId,
        });

        expect(result.structuredContent).toEqual({
            uploadId,
            status: 'ready',
            exploreName: 'sales_targets',
            rowCount: 42,
            columns: [{ name: 'region', type: DimensionType.STRING }],
            errorMessage: null,
        });
    });

    it('reports a table still being built as processing, with no explore yet', async () => {
        await createServer({ get: vi.fn().mockResolvedValue(source()) });

        const result = await callTool(McpToolName.GET_CSV_UPLOAD_STATUS, {
            uploadId,
        });

        expect(result.structuredContent).toMatchObject({
            status: 'processing',
            exploreName: null,
        });
    });

    it('surfaces a rejected upload as a tool error', async () => {
        await createServer({
            prepareCsvUpload: vi
                .fn()
                .mockRejectedValue(
                    new ParameterError('File exceeds the 100 MB upload limit'),
                ),
        });

        const result = await callTool(McpToolName.PREPARE_CSV_UPLOAD, {
            filename: 'huge.csv',
            sizeBytes: 200_000_000,
        });

        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
            { type: 'text', text: 'File exceeds the 100 MB upload limit' },
        ]);
    });
});
