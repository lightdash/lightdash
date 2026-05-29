import { mcpToolDefinitions } from '@lightdash/common';
import type { ZodRawShape, ZodTypeAny } from 'zod';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { MCP_ANALYST_PROMPT } from '../ai/prompts/mcpAnalyst';
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

jest.mock('@sentry/node', () => ({
    getActiveSpan: () => undefined,
    wrapMcpServerWithSentry: (server: unknown) => server,
}));

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: jest.fn().mockImplementation(() => ({
        registerResource: jest.fn(),
        registerPrompt: jest.fn(
            (
                name: string,
                config: RegisteredMcpPrompt['config'],
                _callback: unknown,
            ) => {
                mockRegisteredMcpPrompts.push({ name, config });
                return {};
            },
        ),
        registerTool: jest.fn(
            (
                name: string,
                config: RegisteredMcpTool['config'],
                _callback: unknown,
            ) => {
                mockRegisteredMcpTools.push({
                    name,
                    config,
                });
                return {};
            },
        ),
    })),
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

const makeMcpService = (
    overrides: Partial<ConstructorParameters<typeof McpService>[0]> = {},
): McpService =>
    new McpService({
        aiAgentService: {},
        aiOrganizationSettingsService: {},
        aiWritebackService: {},
        analytics: {
            track: jest.fn(),
        },
        asyncQueryService: {},
        catalogService: {},
        contentVerificationService: {},
        featureFlagService: {},
        lightdashConfig: {
            mcp: {
                runSqlMaxLimit: 500,
            },
            siteUrl: 'https://lightdash.example',
        },
        mcpContextModel: {
            getContext: jest.fn().mockResolvedValue({
                context: {
                    projectUuid: 'project-uuid',
                    projectName: 'Project',
                    agentUuid: null,
                    agentName: null,
                    tags: null,
                },
            }),
        },
        projectModel: {},
        projectService: {},
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
        ...overrides,
    } as ConstructorParameters<typeof McpService>[0]);

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

    it('matches the current MCP tool and prompt contract snapshot', () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        mockRegisteredMcpPrompts.length = 0;
        mcpService.createServer({
            aiWritebackEnabled: true,
            mcpContentAsCodeEnabled: true,
        });

        expect({
            prompts: mockRegisteredMcpPrompts.map(({ name, config }) => ({
                name,
                title: config.title,
                description: config.description,
                argsSchema: schemaToJson(config.argsSchema),
                prompt:
                    name === 'lightdash-analyst' ? MCP_ANALYST_PROMPT : null,
            })),
            tools: mockRegisteredMcpTools.map(({ name, config }) => ({
                name,
                agentName:
                    name === McpToolName.RUN_METRIC_QUERY ? 'runQuery' : null,
                title: config.title,
                description: config.description,
                inputSchema: schemaToJson(config.inputSchema),
                ...(config.outputSchema
                    ? { outputSchema: schemaToJson(config.outputSchema) }
                    : {}),
            })),
        }).toMatchSnapshot();
    });

    it('only registers content-as-code tools when enabled', () => {
        const mcpService = makeMcpService();

        mockRegisteredMcpTools.length = 0;
        mcpService.createServer({ mcpContentAsCodeEnabled: false });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).not.toEqual(
            expect.arrayContaining([
                McpToolName.LIST_CONTENT,
                McpToolName.READ_CONTENT,
                McpToolName.CREATE_CONTENT,
                McpToolName.EDIT_CONTENT,
            ]),
        );

        mockRegisteredMcpTools.length = 0;
        mcpService.createServer({ mcpContentAsCodeEnabled: true });
        expect(mockRegisteredMcpTools.map(({ name }) => name)).toEqual(
            expect.arrayContaining([
                McpToolName.LIST_CONTENT,
                McpToolName.READ_CONTENT,
                McpToolName.CREATE_CONTENT,
                McpToolName.EDIT_CONTENT,
            ]),
        );
    });
});
