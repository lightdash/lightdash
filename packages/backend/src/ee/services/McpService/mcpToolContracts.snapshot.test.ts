import { Ability } from '@casl/ability';
import {
    mcpToolDefinitions,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import type { ZodRawShape, ZodTypeAny } from 'zod';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    getMcpAnalystPrompt,
    MCP_ANALYST_PROMPT,
} from '../ai/prompts/mcpAnalyst';
import { McpService, McpToolName } from './McpService';

type RegisteredMcpTool = {
    name: string;
    config: {
        title: string;
        description: string;
        inputSchema: ZodRawShape;
        annotations: Record<string, unknown>;
        outputSchema?: ZodRawShape | ZodTypeAny;
        _meta?: Record<string, unknown>;
    };
};

type RegisteredMcpPrompt = {
    name: string;
    config: {
        title?: string;
        description?: string;
        argsSchema?: ZodRawShape;
    };
};

const mockRegisteredMcpTools: RegisteredMcpTool[] = [];
const mockRegisteredMcpPrompts: RegisteredMcpPrompt[] = [];

vi.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn().mockImplementation(
        // eslint-disable-next-line prefer-arrow-callback
        function MockMcpServer() {
            return {
                server: {
                    registerCapabilities: vi.fn(),
                },
                registerResource: vi.fn(),
                registerPrompt: vi.fn(
                    (
                        name: string,
                        config: RegisteredMcpPrompt['config'],
                        _callback: unknown,
                    ) => {
                        mockRegisteredMcpPrompts.push({ name, config });
                        return {};
                    },
                ),
                registerTool: vi.fn(
                    (
                        name: string,
                        config: RegisteredMcpTool['config'],
                        _callback: unknown,
                    ) => {
                        mockRegisteredMcpTools.push({ name, config });
                        return {};
                    },
                ),
            };
        },
    ),
}));

const schemaToJson = (
    schema: ZodTypeAny | ZodRawShape | undefined,
): unknown => {
    if (!schema) {
        return null;
    }

    return zodToJsonSchema(
        schema instanceof z.ZodType ? schema : z.object(schema),
        {
            target: 'jsonSchema7',
        },
    );
};

const makeMcpService = (mcpContentWritesEnabled = true): McpService =>
    new McpService({
        aiAgentService: {},
        aiAgentToolsService: { createRuntime: vi.fn() },
        aiOrganizationSettingsService: {
            isMcpContentWritesEnabled: vi
                .fn()
                .mockResolvedValue(mcpContentWritesEnabled),
        },
        aiRouterService: {},
        aiWritebackService: {},
        analytics: {},
        asyncQueryService: {},
        catalogService: {},
        contentService: {},
        contentVerificationService: {},
        featureFlagService: {},
        lightdashConfig: {
            mcp: {
                runSqlMaxLimit: 500,
            },
            siteUrl: 'https://lightdash.example',
        },
        mcpContextModel: {},
        projectModel: {},
        projectService: {},
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
    } as unknown as ConstructorParameters<typeof McpService>[0]);

const sharedMcpToolDefinitionNames = mcpToolDefinitions.map(
    (toolDefinition) => toolDefinition.for('mcp').name,
);

describe('MCP tool contracts', () => {
    beforeEach(() => {
        mockRegisteredMcpTools.length = 0;
        mockRegisteredMcpPrompts.length = 0;
    });

    it('matches the shared MCP tool definition names snapshot', () => {
        expect(sharedMcpToolDefinitionNames).toMatchSnapshot();
    });

    it('uses the grep-fields MCP analyst prompt when ai-grep-fields is enabled', () => {
        const prompt = getMcpAnalystPrompt({ enableGrepFields: true });

        expect(prompt).toContain('grep_fields');
        expect(prompt).toContain('get_metadata');
        expect(prompt).not.toContain('find_explores');
        expect(prompt).not.toContain('find_fields');
    });

    it('matches the current MCP tool and prompt contract snapshot', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        mockRegisteredMcpPrompts.length = 0;
        await mcpService.createServer({ aiWritebackEnabled: true });

        const prompts = mockRegisteredMcpPrompts.map(({ name, config }) => ({
            name,
            title: config.title,
            description: config.description,
            argsSchema: schemaToJson(config.argsSchema),
            prompt: name === 'lightdash-analyst' ? MCP_ANALYST_PROMPT : null,
        }));
        const tools = mockRegisteredMcpTools.map(({ name, config }) => ({
            name,
            agentName:
                name === McpToolName.RUN_METRIC_QUERY ? 'runQuery' : null,
            title: config.title,
            description: config.description,
            annotations: config.annotations,
            inputSchema: schemaToJson(config.inputSchema),
            ...(config.outputSchema
                ? { outputSchema: schemaToJson(config.outputSchema) }
                : {}),
        }));

        expect(
            tools
                .filter(({ inputSchema }) =>
                    JSON.stringify(inputSchema).includes('"$ref"'),
                )
                .map(({ name }) => name),
        ).toEqual([]);

        expect({ prompts, tools }).toMatchSnapshot();
    });

    it('registers run_sql only when runSqlEnabled', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({ runSqlEnabled: true });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.RUN_SQL,
        );

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({ runSqlEnabled: false });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.RUN_SQL,
        );
    });

    it('registers content and scheduled-delivery tools independently', async () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            mcpContentWritesEnabled: false,
            scheduledDeliveryEnabled: true,
        });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.CREATE_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.EDIT_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.CREATE_SCHEDULED_DELIVERY,
        );

        mockRegisteredMcpTools.length = 0;
        await mcpService.createServer({
            mcpContentWritesEnabled: true,
            scheduledDeliveryEnabled: false,
        });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.CREATE_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toContain(
            McpToolName.EDIT_CONTENT,
        );
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toContain(
            McpToolName.CREATE_SCHEDULED_DELIVERY,
        );
    });

    it.each<{
        settingEnabled: boolean;
        rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0];
        expected: boolean;
    }>([
        {
            settingEnabled: false,
            rules: [{ action: 'create', subject: 'ScheduledDeliveries' }],
            expected: false,
        },
        { settingEnabled: true, rules: [], expected: false },
        {
            settingEnabled: true,
            rules: [{ action: 'create', subject: 'ScheduledDeliveries' }],
            expected: true,
        },
        {
            settingEnabled: true,
            rules: [{ action: 'manage', subject: 'ScheduledDeliveries' }],
            expected: true,
        },
    ])(
        'gates scheduled delivery registration by setting and permission',
        async ({ settingEnabled, rules, expected }) => {
            const mcpService = makeMcpService(settingEnabled);
            const user: SessionUser = {
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>(rules),
            };

            await expect(
                mcpService.isCreateScheduledDeliveryEnabled(user),
            ).resolves.toBe(expected);
        },
    );

    it.each<{
        settingEnabled: boolean;
        rules: ConstructorParameters<typeof Ability<PossibleAbilities>>[0];
        expected: boolean;
    }>([
        {
            settingEnabled: false,
            rules: [{ action: 'create', subject: 'ContentAsCode' }],
            expected: false,
        },
        {
            settingEnabled: true,
            rules: [],
            expected: false,
        },
        {
            settingEnabled: true,
            rules: [{ action: 'create', subject: 'ContentAsCode' }],
            expected: true,
        },
        {
            settingEnabled: true,
            rules: [{ action: 'manage', subject: 'ContentAsCode' }],
            expected: true,
        },
    ])(
        'gates MCP content tools by setting and permission',
        async ({ settingEnabled, rules, expected }) => {
            const mcpService = makeMcpService(settingEnabled);
            const user: SessionUser = {
                ...defaultSessionUser,
                ability: new Ability<PossibleAbilities>(rules),
            };

            await expect(mcpService.isContentToolsEnabled(user)).resolves.toBe(
                expected,
            );
        },
    );
});
