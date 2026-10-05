import {
    AiIdentityNotReadyError,
    AiIdentityState,
    FeatureFlags,
    ForbiddenError,
    getAiIdentityPersonMessage,
    type AiAccessForUser,
} from '@lightdash/common';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { isProjectScopedMcpTool, McpService, McpToolName } from './McpService';
import { makeMcpServerOptions } from './McpService.mock';

type Callback = (
    args: Record<string, unknown>,
    extra: Record<string, unknown>,
) => Promise<CallToolResult>;
const registered = new Map<string, Callback>();
const configs = new Map<string, Record<string, unknown>>();
vi.mock('@sentry/node', () => ({
    wrapMcpServerWithSentry: (server: unknown) => server,
    getActiveSpan: () => undefined,
    startSpan: (_options: unknown, callback: CallableFunction) =>
        callback({ spanContext: () => ({ spanId: 'span' }) }),
    isEnabled: () => false,
    startSpanManual: (_options: unknown, callback: CallableFunction) =>
        callback({ spanContext: () => ({ spanId: 'span' }) }, vi.fn()),
}));
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class {
        server = { registerCapabilities: vi.fn(), setRequestHandler: vi.fn() };
        registerResource = vi.fn();
        registerPrompt = vi.fn();
        registerTool = (
            name: string,
            config: Record<string, unknown>,
            callback: Callback,
        ) => {
            registered.set(name, callback);
            configs.set(name, config);
            return {};
        };
    },
}));

const user = {
    userUuid: 'user',
    organizationUuid: 'org',
    ability: {
        can: () => true,
        cannot: () => false,
        relevantRuleFor: () => ({ inverted: false }),
        rules: [],
    },
};
const account = {
    user,
    authentication: { type: 'pat' },
    organization: { organizationUuid: 'org' },
};
const extra = { authInfo: { extra: { user, account } } };
const access: AiAccessForUser = {
    projectUuid: 'project',
    restrictionsOn: true,
    warehouseType: 'snowflake',
    aiIdentityRequired: true,
    state: AiIdentityState.PENDING,
    aiIdentityName: 'PERSON_AI',
    lastCheckedAt: null,
    action: 'ask_admin',
    message: getAiIdentityPersonMessage(AiIdentityState.PENDING),
    rawSqlAllowed: false,
};

type Internals = {
    wrapToolCallback: (name: string, callback: Callback) => Callback;
    setupSkillResourceHandlers: () => Promise<void>;
    recordToolCall: (args: unknown) => void;
};

const makeService = () => {
    const aiIdentityService = {
        getAiAccessForUser: vi.fn().mockResolvedValue(access),
    };
    const featureFlagService = {
        get: vi.fn().mockResolvedValue({ enabled: false }),
    };
    const projectService = {
        getProject: vi.fn().mockResolvedValue({ organizationUuid: 'org' }),
    };
    const asyncQueryService = { executeAsyncSqlQuery: vi.fn() };
    const service = new McpService({
        asyncQueryService,
        aiIdentityService,
        featureFlagService,
        projectService,
        lightdashConfig: {
            siteUrl: 'https://example.com',
            mcp: { runSqlMaxLimit: 500 },
        },
        projectModel: {
            getAllByOrganizationUuid: vi.fn().mockResolvedValue([
                { projectUuid: 'project', name: 'Project' },
                { projectUuid: 'ready-project', name: 'Ready project' },
            ]),
        },
        mcpContextModel: {
            getContext: vi
                .fn()
                .mockResolvedValue({ context: { projectUuid: 'project' } }),
        },
        aiAgentToolsService: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);
    const internals = service as unknown as Internals;
    vi.spyOn(internals, 'recordToolCall').mockImplementation(() => undefined);
    vi.spyOn(internals, 'setupSkillResourceHandlers').mockResolvedValue();
    return {
        service,
        internals,
        aiIdentityService,
        featureFlagService,
        projectService,
        asyncQueryService,
    };
};

beforeEach(() => {
    registered.clear();
    configs.clear();
});
afterEach(() => {
    vi.restoreAllMocks();
});

it.each([
    McpToolName.RUN_METRIC_QUERY,
    McpToolName.RUN_SQL,
    McpToolName.SEARCH_FIELD_VALUES,
    McpToolName.RENDER_CHART,
    McpToolName.GET_QUERY_RESULT,
    McpToolName.RUN_AI_WRITEBACK,
    McpToolName.GENERATE_DATA_APP,
    McpToolName.ITERATE_DATA_APP,
])('refuses %s before its handler runs', async (name) => {
    const { internals, aiIdentityService } = makeService();
    const handler = vi.fn<Callback>();
    const result = await internals.wrapToolCallback(name, handler)(
        { projectUuid: 'project' },
        extra,
    );
    expect(handler).not.toHaveBeenCalled();
    expect(aiIdentityService.getAiAccessForUser).toHaveBeenCalledWith({
        account,
        projectUuid: 'project',
    });
    expect(result).toEqual({
        isError: true,
        content: [{ type: 'text', text: access.message }],
        structuredContent: {
            error: {
                code: 'ai_identity_not_ready',
                label: 'Not ready',
                state: 'pending',
                message: access.message,
                settingsUrl:
                    'https://example.com/generalSettings/myWarehouseConnections',
            },
        },
    });
    expect(internals.recordToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
            status: 'error',
            errorMessage: access.message,
        }),
    );
});

it.each([
    McpToolName.RUN_METRIC_QUERY,
    McpToolName.RUN_SQL,
    McpToolName.SEARCH_FIELD_VALUES,
    McpToolName.RENDER_CHART,
    McpToolName.GET_QUERY_RESULT,
    McpToolName.RUN_AI_WRITEBACK,
    McpToolName.GENERATE_DATA_APP,
    McpToolName.ITERATE_DATA_APP,
])('guards the registered %s callback', async (name) => {
    const { service, aiIdentityService } = makeService();
    service.setupHandlers(
        makeMcpServerOptions({
            runSqlEnabled: true,
            runMetricQueryEnabled: true,
            dataAppBuildsEnabled: true,
        }),
    );
    const callback = registered.get(name);
    expect(callback).toBeDefined();
    const result = await callback!({ projectUuid: 'project' }, extra);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
        error: { code: 'ai_identity_not_ready' },
    });
    expect(aiIdentityService.getAiAccessForUser).toHaveBeenCalledOnce();
});

it.each([
    AiIdentityState.PENDING,
    AiIdentityState.FAILED,
    AiIdentityState.NEEDS_SIGN_IN,
])('returns the plain message for %s', async (state) => {
    const { internals, aiIdentityService } = makeService();
    aiIdentityService.getAiAccessForUser.mockResolvedValue({
        ...access,
        state,
    });
    const result = await internals.wrapToolCallback(
        McpToolName.RUN_SQL,
        vi.fn<Callback>(),
    )({ projectUuid: 'project' }, extra);
    expect(result.content).toEqual([
        { type: 'text', text: getAiIdentityPersonMessage(state) },
    ]);
});

it.each([
    { ...access, state: AiIdentityState.READY },
    { ...access, aiIdentityRequired: false, state: null },
])('allows ready or unrestricted access', async (readyAccess) => {
    const { internals, aiIdentityService } = makeService();
    aiIdentityService.getAiAccessForUser.mockResolvedValue(readyAccess);
    const handler = vi
        .fn<Callback>()
        .mockResolvedValue({ content: [{ type: 'text', text: 'result' }] });
    await internals.wrapToolCallback(McpToolName.RUN_SQL, handler)(
        { projectUuid: 'project' },
        extra,
    );
    expect(handler).toHaveBeenCalledOnce();
});

it('does not check identity for metadata tools', async () => {
    const { internals, aiIdentityService } = makeService();
    const handler = vi.fn<Callback>().mockResolvedValue({ content: [] });
    await internals.wrapToolCallback(McpToolName.GET_METADATA, handler)(
        { projectUuid: 'project' },
        extra,
    );
    expect(aiIdentityService.getAiAccessForUser).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
});

it('maps a query-path identity error into the same structured error', async () => {
    const { internals, aiIdentityService } = makeService();
    aiIdentityService.getAiAccessForUser.mockResolvedValue({
        ...access,
        state: AiIdentityState.READY,
    });
    const error = new AiIdentityNotReadyError(AiIdentityState.FAILED);
    const handler = vi.fn<Callback>().mockRejectedValue(error);
    const result = await internals.wrapToolCallback(
        McpToolName.RUN_SQL,
        handler,
    )({ projectUuid: 'project' }, extra);
    expect(result.structuredContent).toEqual({
        error: {
            code: 'ai_identity_not_ready',
            label: 'Not ready',
            state: 'failed',
            message: access.message,
            settingsUrl:
                'https://example.com/generalSettings/myWarehouseConnections',
        },
    });
});

it('checks project permission and pin before looking up identity', async () => {
    const { internals, aiIdentityService, projectService } = makeService();
    const callback = internals.wrapToolCallback(
        McpToolName.RUN_SQL,
        vi.fn<Callback>(),
    );
    await expect(
        callback(
            { projectUuid: 'other' },
            {
                authInfo: {
                    extra: { user, account, headerProjectUuid: 'project' },
                },
            },
        ),
    ).rejects.toThrow('pinned');
    projectService.getProject.mockRejectedValue(new ForbiddenError());
    await expect(callback({ projectUuid: 'project' }, extra)).rejects.toThrow(
        ForbiddenError,
    );
    expect(aiIdentityService.getAiAccessForUser).not.toHaveBeenCalled();
});

it.each([false, true])(
    'only registers get_ai_access with the flag enabled=%s',
    async (enabled) => {
        const { service, featureFlagService } = makeService();
        featureFlagService.get.mockResolvedValue({ enabled });
        const options = makeMcpServerOptions();
        options.req.user = user as unknown as typeof options.req.user;
        await service.createServer(options);
        expect(registered.has(McpToolName.GET_AI_ACCESS)).toBe(enabled);
        expect(featureFlagService.get).toHaveBeenCalledWith({
            user,
            featureFlagId: FeatureFlags.SnowflakeAiTwins,
        });
        if (enabled)
            expect(configs.get(McpToolName.GET_AI_ACCESS)).toMatchObject({
                annotations: { readOnlyHint: true },
            });
    },
);

it('returns AI access for the current or explicit project', async () => {
    const { service, featureFlagService, aiIdentityService } = makeService();
    featureFlagService.get.mockResolvedValue({ enabled: true });
    const options = makeMcpServerOptions();
    options.req.user = user as unknown as typeof options.req.user;
    await service.createServer(options);
    expect(isProjectScopedMcpTool(McpToolName.GET_AI_ACCESS)).toBe(false);
    const callback = registered.get(McpToolName.GET_AI_ACCESS)!;
    expect(await callback({}, extra)).toEqual({
        content: [
            {
                type: 'text',
                text: JSON.stringify({ ...access, label: 'Not ready' }),
            },
        ],
        structuredContent: { ...access, label: 'Not ready' },
    });
    await callback({ projectUuid: 'explicit-project' }, extra);
    expect(aiIdentityService.getAiAccessForUser).toHaveBeenLastCalledWith({
        account,
        projectUuid: 'explicit-project',
    });
});

it.each([false, true])(
    'adds list_projects markers only with the flag enabled=%s',
    async (enabled) => {
        const { service, featureFlagService, aiIdentityService } =
            makeService();
        featureFlagService.get.mockResolvedValue({ enabled });
        aiIdentityService.getAiAccessForUser.mockImplementation(
            async ({ projectUuid }) => ({
                ...access,
                projectUuid,
                state:
                    projectUuid === 'project'
                        ? AiIdentityState.PENDING
                        : AiIdentityState.READY,
            }),
        );
        service.setupHandlers(makeMcpServerOptions());
        const result = await registered.get(McpToolName.LIST_PROJECTS)!(
            {},
            extra,
        );
        expect(result.content).toEqual([
            {
                type: 'text',
                text: JSON.stringify(
                    [
                        {
                            name: 'Project',
                            projectUuid: 'project',
                            expiresAt: null,
                            ...(enabled
                                ? {
                                      aiAccess: {
                                          state: 'pending',
                                          action: 'ask_admin',
                                      },
                                  }
                                : {}),
                        },
                        {
                            name: 'Ready project',
                            projectUuid: 'ready-project',
                            expiresAt: null,
                        },
                    ],
                    null,
                    2,
                ),
            },
        ]);
        expect(aiIdentityService.getAiAccessForUser).toHaveBeenCalledTimes(
            enabled ? 2 : 0,
        );
    },
);

it('preserves a query-path refusal from the registered SQL handler', async () => {
    const { service, aiIdentityService, asyncQueryService } = makeService();
    aiIdentityService.getAiAccessForUser.mockResolvedValue({
        ...access,
        state: AiIdentityState.READY,
    });
    asyncQueryService.executeAsyncSqlQuery.mockRejectedValue(
        new AiIdentityNotReadyError(AiIdentityState.NEEDS_SIGN_IN),
    );
    service.setupHandlers(makeMcpServerOptions({ runSqlEnabled: true }));
    const result = await registered.get(McpToolName.RUN_SQL)!(
        { projectUuid: 'project', sql: 'select 1' },
        extra,
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
        error: {
            code: 'ai_identity_not_ready',
            label: 'Needs Snowflake sign-in',
            state: 'needs_sign_in',
            message: getAiIdentityPersonMessage(AiIdentityState.NEEDS_SIGN_IN),
        },
    });
    expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledOnce();
});
