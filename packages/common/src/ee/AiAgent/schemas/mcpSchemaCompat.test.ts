import z from 'zod';
import { getMcpCompatibleSchema } from './mcpSchemaCompat';
import { ToolDefinitions } from './tools/toolNames';

const mcpTools = ToolDefinitions.for('mcp');

const mapZodSchema = (schema: z.AnyZodObject) =>
    z.object(getMcpCompatibleSchema(schema));

describe('getMcpCompatibleSchema', () => {
    it('preserves nullable defaults and coercions for baseline schemas', () => {
        const schema = z.object({
            name: z.string().describe('The name of the person'),
            age: z.coerce.number().describe('The age of the person'),
            bio: z.string().nullable().describe('The bio of the person'),
            details: z
                .object({
                    height: z.number().describe('The height of the person'),
                    weight: z.coerce
                        .number()
                        .min(1)
                        .int()
                        .describe('The weight of the person')
                        .nullable(),
                })
                .nullable()
                .describe('The details of the person'),
            occupation: z
                .string()
                .default('plumber')
                .nullable()
                .describe('The occupation of the person'),
        });

        const mapped = mapZodSchema(schema);

        expect(
            mapped.parse({
                name: 'John',
                age: '30',
            }),
        ).toEqual({
            name: 'John',
            age: 30,
            bio: null,
            details: null,
            occupation: 'plumber',
        });

        expect(
            mapped.safeParse({
                name: 'John',
                age: 30,
                details: {
                    height: 180,
                    weight: 70.2,
                },
            }).error?.issues?.[0]?.code,
        ).toBe('invalid_type');
    });

    it('produces MCP-compatible runMetricQuery inputs', () => {
        const mapped = mapZodSchema(mcpTools.runMetricQuery.inputSchema);

        const parsed = mapped.parse({
            vizConfig: {
                exploreName: 'orders',
                metrics: [],
                dimensions: [],
                sorts: [],
            },
            filters: {
                type: 'and',
                dimensions: [
                    {
                        values: ['2023-01-01'],
                        fieldId: 'orders_order_date_year',
                        operator: 'equals',
                        fieldType: 'date',
                        fieldFilterType: 'date',
                    },
                ],
            },
        });

        expect(parsed).toEqual({
            customMetrics: null,
            filters: {
                type: 'and',
                metrics: null,
                dimensions: [
                    {
                        values: ['2023-01-01'],
                        fieldId: 'orders_order_date_year',
                        operator: 'equals',
                        fieldType: 'date',
                        fieldFilterType: 'date',
                    },
                ],
                tableCalculations: null,
            },
            tableCalculations: null,
            vizConfig: {
                exploreName: 'orders',
                metrics: [],
                dimensions: [],
                sorts: [],
                limit: null,
            },
        });

        expect(() => mcpTools.runMetricQuery.parseInput(parsed)).not.toThrow();
    });

    it('preserves pagination handling for findFields', () => {
        const mapped = mapZodSchema(mcpTools.findFields.inputSchema);

        const parsed = mapped.parse({
            table: 'orders',
            fieldSearchQueries: [{ label: 'Revenue' }],
            page: '23',
        });

        expect(parsed).toEqual({
            table: 'orders',
            fieldSearchQueries: [{ label: 'Revenue' }],
            page: 23,
        });
        expect(() => mcpTools.findFields.parseInput(parsed)).not.toThrow();
    });

    it('does not emit $ref pointers for MCP runMetricQuery schemas', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { zodToJsonSchema } = require('zod-to-json-schema') as {
            zodToJsonSchema: (
                schema: z.ZodSchema,
                opts?: Record<string, unknown>,
            ) => Record<string, unknown>;
        };

        const jsonSchema = zodToJsonSchema(
            z.object(mcpTools.runMetricQuery.schema),
            {
                strictUnions: true,
                pipeStrategy: 'input',
            },
        );

        expect(JSON.stringify(jsonSchema)).not.toContain('"$ref"');
    });
});
