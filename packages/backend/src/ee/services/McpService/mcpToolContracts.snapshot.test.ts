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
        outputSchema?: ZodRawShape;
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
                mockRegisteredMcpTools.push({ name, config });
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

const makeMcpService = (): McpService =>
    new McpService({
        aiAgentService: {},
        aiOrganizationSettingsService: {},
        aiWritebackService: {},
        analytics: {},
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
        mcpContextModel: {},
        projectModel: {},
        projectService: {},
        savedSqlService: {},
        schedulerService: {},
        searchModel: {},
        shareService: {},
        spaceService: {},
        userAttributesModel: {},
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
        mcpService.createServer({ aiWritebackEnabled: true });

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
});
