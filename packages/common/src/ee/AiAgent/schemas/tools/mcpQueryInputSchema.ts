import type { z } from 'zod';
import { toJsonSchema, type JsonSchema } from '../../../../utils/zodJsonSchema';

type QueryNodeSchema = z.ZodObject<
    z.ZodRawShape & { sourceType: z.ZodLiteral<string> }
>;
type QueriesSchema = z.ZodArray<z.ZodUnion<readonly QueryNodeSchema[]>>;
type McpQueryArgsSchema = z.ZodObject<{ queries: QueriesSchema }>;

const isNullSchema = (schema: unknown): boolean =>
    typeof schema === 'object' &&
    schema !== null &&
    Object.keys(schema).length === 1 &&
    (schema as JsonSchema).type === 'null';

/** An optional property may be omitted, so it is advertised without its null branch. */
const withoutNull = (property: JsonSchema): JsonSchema => {
    const { default: defaultValue, ...rest } = property;
    const schema = defaultValue === null ? rest : property;
    if (Array.isArray(schema.type) && schema.type.includes('null')) {
        const types = schema.type.filter((type) => type !== 'null');
        return {
            ...schema,
            type: types.length === 1 ? types[0] : types,
            ...(schema.enum
                ? { enum: schema.enum.filter((value) => value !== null) }
                : {}),
        };
    }
    if (!schema.anyOf?.some(isNullSchema)) return schema;
    const { anyOf, ...withoutUnion } = schema;
    const branches = anyOf.filter((branch) => !isNullSchema(branch));
    return branches.length === 1
        ? { ...(branches[0] as JsonSchema), ...withoutUnion }
        : { ...withoutUnion, anyOf: branches };
};

// The server still accepts null; advertising it costs bytes clients that compact large schemas lack.
const advertiseOptionalPropertiesWithoutNull = (schema: unknown): unknown => {
    if (Array.isArray(schema)) {
        return schema.map(advertiseOptionalPropertiesWithoutNull);
    }
    if (typeof schema !== 'object' || schema === null) return schema;
    const node = Object.fromEntries(
        Object.entries(schema).map(([key, child]) => [
            key,
            advertiseOptionalPropertiesWithoutNull(child),
        ]),
    ) as JsonSchema;
    if (!node.properties) return node;
    const required = new Set(node.required ?? []);
    return {
        ...node,
        properties: Object.fromEntries(
            Object.entries(node.properties).map(([name, property]) => [
                name,
                required.has(name) || typeof property !== 'object'
                    ? property
                    : withoutNull(property),
            ]),
        ),
    };
};

const sourceTypeOf = (node: QueryNodeSchema): string =>
    node.shape.sourceType.value;

const formatPath = (path: PropertyKey[]): string =>
    path
        .map((key, index) => {
            if (typeof key === 'number') return `[${key}]`;
            return index === 0 ? String(key) : `.${String(key)}`;
        })
        .join('');

const quoteKeys = (keys: string[]): string =>
    keys.map((key) => `"${key}"`).join(', ');

/** Names the keys that made a node match no node kind. */
const describeNodeIssue = (
    nodes: readonly QueryNodeSchema[],
    issue: z.core.$ZodRawIssue,
): string | undefined => {
    if (issue.code !== 'invalid_union') return undefined;
    const sourceTypes = nodes.map(sourceTypeOf);
    const { input } = issue;
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        return `Each node is an object with "sourceType" (${sourceTypes.join(', ')})`;
    }
    const inputKeys = Object.keys(input);
    const { sourceType } = input as Record<string, unknown>;
    const nodeIndex =
        typeof sourceType === 'string' ? sourceTypes.indexOf(sourceType) : -1;
    if (nodeIndex === -1) {
        const knownKeys = new Set(
            nodes.flatMap((node) => Object.keys(node.shape)),
        );
        const unknownKeys = inputKeys.filter((key) => !knownKeys.has(key));
        return [
            `"sourceType" must be one of ${sourceTypes.join(', ')}`,
            ...(unknownKeys.length > 0
                ? [`unknown keys ${quoteKeys(unknownKeys)}`]
                : []),
        ].join('; ');
    }
    const node = nodes[nodeIndex];
    const nodeIssues = issue.errors?.[nodeIndex] ?? [];
    const missingKeys = nodeIssues
        .filter(
            ({ path }) =>
                path.length === 1 && !inputKeys.includes(String(path[0])),
        )
        .map(({ path }) => String(path[0]));
    const unknownKeys = inputKeys.filter((key) => !(key in node.shape));
    const otherIssues = nodeIssues
        .filter(({ path }) => !missingKeys.includes(String(path[0])))
        .map(({ path, message }) => `${formatPath(path)}: ${message}`);
    return [
        `Invalid ${sourceTypes[nodeIndex]} node`,
        ...(missingKeys.length > 0
            ? [`missing required keys ${quoteKeys(missingKeys)}`]
            : []),
        ...(unknownKeys.length > 0
            ? [`unknown keys ${quoteKeys(unknownKeys)}`]
            : []),
        ...otherIssues,
    ].join('; ');
};

const EXAMPLE_NODE = {
    sourceType: 'semanticLayer',
    nodeId: 'orders_by_month',
    title: 'Orders by month',
    description: 'Counts orders per month.',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_count'],
};

/** Validates exactly as `argsSchema`; only the advertised schema and rejection text differ. */
export const createMcpQueryInputSchema = <TArgs extends McpQueryArgsSchema>(
    argsSchema: TArgs,
): z.ZodObject<TArgs['shape']> => {
    const { queries } = argsSchema.shape;
    const nodes = queries.element;
    const advertisedQueries = advertiseOptionalPropertiesWithoutNull(
        toJsonSchema(queries, { io: 'input' }),
    ) as JsonSchema;
    delete advertisedQueries.$schema;
    const describedQueries = queries.clone({
        ...queries.def,
        element: nodes.clone({
            ...nodes.def,
            error: (issue) => describeNodeIssue(nodes.options, issue),
        }),
    });
    // Zod's documented hook for a schema's own JSON Schema.
    // eslint-disable-next-line no-underscore-dangle
    describedQueries._zod.toJSONSchema = () =>
        structuredClone(advertisedQueries);
    const takesProjectUuid = 'projectUuid' in argsSchema.shape;
    return argsSchema.extend({ queries: describedQueries }).superRefine(
        (args, ctx) => {
            const { projectUuid } = args as { projectUuid?: unknown };
            ctx.addIssue({
                code: 'custom',
                message: `Minimal valid call: ${JSON.stringify({
                    ...(takesProjectUuid
                        ? {
                              projectUuid:
                                  typeof projectUuid === 'string'
                                      ? projectUuid
                                      : '<projectUuid>',
                          }
                        : {}),
                    queries: [EXAMPLE_NODE],
                })}`,
            });
        },
        { when: (payload) => payload.issues.length > 0 },
    );
};
