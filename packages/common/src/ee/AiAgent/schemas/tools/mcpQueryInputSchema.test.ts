import { z } from 'zod';
import { createMcpCompatibleInputSchema } from '../McpSchemaCompatLayer';
import { createMcpQueryInputSchema } from './mcpQueryInputSchema';
import { createToolComposerQueriesArgsSchema } from './toolComposerQueryArgs';

const compatibleSchema = createMcpCompatibleInputSchema(
    createToolComposerQueriesArgsSchema({ enablePythonNodes: true }).extend({
        projectUuid: z.string().uuid(),
    }),
);
const schema = createMcpQueryInputSchema(compatibleSchema);

const projectUuid = '3675b69e-8324-4110-bdca-059031aa8da3';
const node = {
    sourceType: 'semanticLayer',
    nodeId: 'orders',
    title: 'Orders',
    description: 'Counts orders.',
    exploreName: 'orders',
    dimensions: [],
    metrics: ['orders_count'],
};

const rejection = (args: unknown): string => {
    const result = schema.safeParse(args);
    if (result.success) throw new Error('expected a rejection');
    return result.error.issues
        .map(({ path, message }) =>
            path.length ? `${message} at ${path.join('.')}` : message,
        )
        .join('\n');
};

describe('createMcpQueryInputSchema', () => {
    it('accepts and parses what the compatible schema does, null included', () => {
        const inputs = [
            { projectUuid, queries: [node] },
            {
                projectUuid,
                title: null,
                queries: [
                    {
                        ...node,
                        sorts: null,
                        customMetrics: null,
                        filters: { dimensions: null, metrics: null },
                    },
                ],
            },
        ];
        for (const input of inputs) {
            expect(schema.parse(input)).toEqual(compatibleSchema.parse(input));
        }
    });

    it('advertises optional node properties without null, keeping top-level ones', () => {
        const json = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' });
        const serialized = JSON.stringify(json.properties?.queries);
        expect(serialized).not.toContain('"null"');
        expect(serialized).not.toContain('"default":null');
        expect(json.properties?.title).toMatchObject({
            type: ['string', 'null'],
        });
    });

    it('names a wrong discriminator and its unknown key', () => {
        const { sourceType, ...rest } = node;
        expect(
            rejection({
                projectUuid,
                queries: [{ ...rest, type: sourceType }],
            }).split('\n')[0],
        ).toBe(
            '"sourceType" must be one of semanticLayer, sql, duckdb, external, merge, python; unknown keys "type" at queries.0',
        );
    });

    it('names missing required keys and keys the node kind lacks', () => {
        const { title, description, exploreName, ...rest } = node;
        expect(
            rejection({
                projectUuid,
                queries: [{ ...rest, query: { explore: exploreName } }],
            }).split('\n')[0],
        ).toBe(
            'Invalid semanticLayer node; missing required keys "title", "description", "exploreName"; unknown keys "query" at queries.0',
        );
    });

    it('names a missing required key whatever its type', () => {
        expect(
            rejection({
                projectUuid,
                queries: [
                    {
                        ...node,
                        sourceType: 'duckdb',
                        sql: 'select 1',
                    },
                ],
            }).split('\n')[0],
        ).toBe(
            'Invalid duckdb node; missing required keys "references"; unknown keys "exploreName", "dimensions", "metrics" at queries.0',
        );
    });

    it('ends every rejection with a valid example call', () => {
        const lastLine = rejection({ projectUuid, queries: [{}] })
            .split('\n')
            .at(-1);
        expect(lastLine).toMatch(/^Minimal valid call: /);
        const example: unknown = JSON.parse(
            String(lastLine).replace('Minimal valid call: ', ''),
        );
        expect(schema.safeParse(example).success).toBe(true);
    });
});
