import { z } from 'zod';
import { defineTool, ToolDefinition } from './defineTool';

const agentOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({ status: z.string() }),
});

describe('defineTool', () => {
    describe('name casing', () => {
        const tool = defineTool({
            name: 'runMetricQuery',
            title: 'Run Metric Query',
            description: 'desc',
            availability: 'both',
            inputSchema: z.object({ foo: z.string() }),
            agent: { outputSchema: agentOutputSchema },
            mcp: {
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                },
            },
        });

        test('agent view keeps camelCase name', () => {
            expect(tool.for('agent').name).toBe('runMetricQuery');
        });

        test('mcp view derives snake_case name', () => {
            expect(tool.for('mcp').name).toBe('run_metric_query');
            expect(tool.for('mcp').canonicalName).toBe('runMetricQuery');
        });

        test('canonical name on the definition is camelCase', () => {
            expect(tool.name).toBe('runMetricQuery');
        });

        test('mcp.name override wins over auto snake_case', () => {
            const overridden = defineTool({
                name: 'runQuery',
                title: 'Run Query',
                description: 'desc',
                availability: 'both',
                inputSchema: z.object({ foo: z.string() }),
                agent: { outputSchema: agentOutputSchema },
                mcp: {
                    name: 'run_metric_query',
                    annotations: {
                        readOnlyHint: true,
                        destructiveHint: false,
                        idempotentHint: true,
                    },
                },
            });
            expect(overridden.for('agent').name).toBe('runQuery');
            expect(overridden.for('mcp').name).toBe('run_metric_query');
        });
    });

    describe('agent view', () => {
        const tool = defineTool({
            name: 'findContent',
            title: 'Find Content',
            description: 'finds content',
            availability: 'agent',
            inputSchema: z.object({ query: z.string() }),
            agent: { outputSchema: agentOutputSchema },
        });

        test('exposes title, description, input and output schemas', () => {
            const view = tool.for('agent');
            expect(view.title).toBe('Find Content');
            expect(view.description).toBe('finds content');
            expect(view.inputSchema).toBe(tool.inputSchema);
            expect(view.outputSchema).toBe(agentOutputSchema);
        });
    });

    describe('mcp view', () => {
        const tool = defineTool({
            name: 'runSql',
            title: 'Run SQL',
            description: 'runs sql',
            availability: 'mcp',
            inputSchema: z.object({
                // nullable → optional+default-null after compat
                limit: z.number().nullable(),
            }),
            mcp: {
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                },
                structuredOutputSchema: z.object({
                    rows: z.array(z.record(z.unknown())),
                    rowCount: z.number(),
                }),
                meta: { ui: { resourceUri: 'ui://x' } },
            },
        });

        test('exposes annotations, structured output shape and meta', () => {
            const view = tool.for('mcp');
            expect(view.annotations).toEqual({
                readOnlyHint: true,
                destructiveHint: false,
                idempotentHint: true,
            });
            expect(Object.keys(view.outputSchema ?? {})).toEqual([
                'rows',
                'rowCount',
            ]);
            expect(view.meta).toEqual({ ui: { resourceUri: 'ui://x' } });
        });

        test('input schema is the compat raw shape (number coercion applied)', () => {
            const view = tool.for('mcp');
            // compat layer coerces numbers via z.preprocess; the result is a
            // raw shape keyed by the input properties.
            expect(Object.keys(view.inputSchema)).toEqual(['limit']);
            const rebuilt = z.object(view.inputSchema);
            expect(rebuilt.parse({ limit: '42' })).toEqual({ limit: 42 });
        });

        test('toMcpRegistration produces registerTool config with _meta', () => {
            const { name, registration } =
                ToolDefinition.toMcpRegistration(tool);
            expect(name).toBe('run_sql');
            expect(registration.title).toBe('Run SQL');
            expect(registration.description).toBe('runs sql');
            expect(registration.annotations).toBeDefined();
            expect(registration).toHaveProperty('outputSchema');
            expect(registration).toHaveProperty('_meta', {
                ui: { resourceUri: 'ui://x' },
            });
            // name is returned separately — it is the first registerTool
            // argument, not part of the registration config.
            expect(registration).not.toHaveProperty('name');
        });
    });

    describe('toMcpRegistration without optionals', () => {
        const tool = defineTool({
            name: 'listProjects',
            title: 'List Projects',
            description: 'lists projects',
            availability: 'mcp',
            inputSchema: z.object({}),
            mcp: {
                annotations: {
                    readOnlyHint: true,
                    destructiveHint: false,
                    idempotentHint: true,
                },
            },
        });

        test('omits outputSchema and _meta when absent', () => {
            const { name, registration } =
                ToolDefinition.toMcpRegistration(tool);
            expect(registration).not.toHaveProperty('outputSchema');
            expect(registration).not.toHaveProperty('_meta');
            expect(name).toBe('list_projects');
        });
    });
});
