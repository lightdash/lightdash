import { APP_VERSION_CANCELLED_BY_USER } from '@lightdash/common';
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
const appUuid = '11111111-2222-3333-4444-555555555555';

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
};

const makeExtra = () => ({
    signal: new AbortController().signal,
    requestId: 'request-id',
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
    authInfo: { extra: { user, account } },
});

const makeMcpService = (createRuntime: () => unknown) =>
    new McpService({
        aiAgentService: {},
        aiAgentToolsService: { createRuntime },
        aiOrganizationSettingsService: {},
        aiRouterService: {},
        aiWritebackService: {},
        analytics: { track: vi.fn() },
        asyncQueryService: {},
        catalogService: {},
        contentVerificationService: {},
        featureFlagService: {},
        lightdashConfig: {
            mcp: { runSqlMaxLimit: 500 },
            siteUrl: 'https://lightdash.example',
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

const versionRow = (
    overrides: Partial<{
        version: number;
        status: string;
        error: string | null;
        statusMessage: string | null;
    }> = {},
) => ({
    app: {
        uuid: appUuid,
        slug: 'quarterly-review',
        name: 'Quarterly review',
        spaceUuid: null,
    },
    version: {
        version: 1,
        status: 'generating',
        error: null,
        statusMessage: null,
        ...overrides,
    },
});

/** Registers the tools and returns the stubbed runtime fn so calls can be asserted. */
const createServerWithBuildStatus = async (
    source: ReturnType<typeof versionRow>,
    featureAvailability: Parameters<typeof makeMcpServerOptions>[0] = {},
) => {
    const getDataAppBuildStatus = vi.fn().mockResolvedValue(source);
    const mcpService = makeMcpService(() => ({ getDataAppBuildStatus }));
    mockRegisteredMcpTools.clear();
    await mcpService.createServer(
        makeMcpServerOptions({
            dataAppBuildsEnabled: true,
            ...featureAvailability,
        }),
    );
    return { getDataAppBuildStatus };
};

const callBuildStatus = (args: Record<string, unknown>) => {
    const callback = mockRegisteredMcpTools.get(
        McpToolName.GET_DATA_APP_BUILD_STATUS,
    );
    if (!callback) {
        throw new Error('get_data_app_build_status was not registered');
    }
    return callback({ projectUuid, ...args }, makeExtra());
};

describe('McpService get_data_app_build_status', () => {
    describe('registration', () => {
        it('registers the tool when the caller may create data apps', async () => {
            await createServerWithBuildStatus(versionRow());

            expect(
                mockRegisteredMcpTools.has(
                    McpToolName.GET_DATA_APP_BUILD_STATUS,
                ),
            ).toBe(true);
        });

        it('omits the tool when data app builds are unavailable', async () => {
            await createServerWithBuildStatus(versionRow(), {
                dataAppBuildsEnabled: false,
            });

            expect(
                mockRegisteredMcpTools.has(
                    McpToolName.GET_DATA_APP_BUILD_STATUS,
                ),
            ).toBe(false);
        });
    });

    describe('callback', () => {
        it('reports the pipeline stage of the version the runtime returned', async () => {
            await createServerWithBuildStatus(
                versionRow({ status: 'packaging' }),
            );

            const result = await callBuildStatus({
                appSlug: 'quarterly-review',
            });

            expect(result.structuredContent).toEqual({
                status: 'packaging',
                statusMessage: 'Packaging the app.',
                errorMessage: null,
                name: 'Quarterly review',
                slug: 'quarterly-review',
                href: `https://lightdash.example/projects/${projectUuid}/apps/${appUuid}`,
                nextPollAfterMs: 15000,
            });
        });

        it('returns the app URL once the build is ready', async () => {
            await createServerWithBuildStatus(versionRow({ status: 'ready' }));

            const result = await callBuildStatus({
                appSlug: 'quarterly-review',
            });

            expect(result.structuredContent).toMatchObject({
                status: 'ready',
                href: `https://lightdash.example/projects/${projectUuid}/apps/${appUuid}`,
            });
        });

        it('reports a cancelled build as cancelled, not an error', async () => {
            await createServerWithBuildStatus(
                versionRow({
                    status: 'error',
                    error: APP_VERSION_CANCELLED_BY_USER,
                }),
            );

            const result = await callBuildStatus({
                appSlug: 'quarterly-review',
            });

            expect(result.structuredContent).toMatchObject({
                status: 'cancelled',
                errorMessage: null,
            });
        });

        it('surfaces the failure reason of a failed build', async () => {
            await createServerWithBuildStatus(
                versionRow({
                    status: 'error',
                    error: 'npm install exited with code 1',
                    statusMessage: 'Build failed',
                }),
            );

            const result = await callBuildStatus({
                appSlug: 'quarterly-review',
            });

            expect(result.structuredContent).toMatchObject({
                status: 'error',
                errorMessage: 'npm install exited with code 1',
            });
        });

        it('asks the runtime for the latest version when none is given', async () => {
            const { getDataAppBuildStatus } =
                await createServerWithBuildStatus(versionRow());

            await callBuildStatus({ appSlug: 'quarterly-review' });

            expect(getDataAppBuildStatus).toHaveBeenCalledWith({
                appSlug: 'quarterly-review',
                version: undefined,
            });
        });

        it('asks the runtime for the named version', async () => {
            const { getDataAppBuildStatus } = await createServerWithBuildStatus(
                versionRow({ version: 3 }),
            );

            await callBuildStatus({ appSlug: 'quarterly-review', version: 3 });

            expect(getDataAppBuildStatus).toHaveBeenCalledWith({
                appSlug: 'quarterly-review',
                version: 3,
            });
        });

        it('returns a tool error when the app is not found', async () => {
            const mcpService = makeMcpService(() => ({
                getDataAppBuildStatus: vi
                    .fn()
                    .mockRejectedValue(
                        new Error('Data app "missing" was not found'),
                    ),
            }));
            mockRegisteredMcpTools.clear();
            await mcpService.createServer(
                makeMcpServerOptions({ dataAppBuildsEnabled: true }),
            );

            const result = await callBuildStatus({ appSlug: 'missing' });

            expect(result.isError).toBe(true);
            expect(result.content).toEqual([
                {
                    type: 'text',
                    text: 'Error getting data app build status: Data app "missing" was not found',
                },
            ]);
        });
    });
});
