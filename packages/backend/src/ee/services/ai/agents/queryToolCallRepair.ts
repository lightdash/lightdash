import type { ToolCallRepairFunction, ToolSet } from 'ai';

type JsonSchema = {
    type?: string | string[];
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema;
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
};

const branches = (schema: JsonSchema): JsonSchema[] =>
    schema.anyOf ?? schema.oneOf ?? [schema];

const permits = (schema: JsonSchema, type: string) =>
    branches(schema).some((branch) =>
        Array.isArray(branch.type)
            ? branch.type.includes(type)
            : branch.type === type,
    );

const selectBranch = (schema: JsonSchema, value: unknown): JsonSchema => {
    const options = branches(schema);
    if (options.length === 1) return options[0];
    if (Array.isArray(value))
        return options.find((option) => permits(option, 'array')) ?? options[0];
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        return [...options].sort(
            (left, right) =>
                keys.filter((key) => key in (right.properties ?? {})).length -
                keys.filter((key) => key in (left.properties ?? {})).length,
        )[0];
    }
    return (
        options.find((option) => permits(option, typeof value)) ?? options[0]
    );
};

const normalizeNullablePlaceholders = (
    value: unknown,
    sourceSchema: JsonSchema,
): unknown => {
    if (
        typeof value === 'string' &&
        /^(?:n\/a|none|null|not applicable)$/iu.test(value.trim()) &&
        permits(sourceSchema, 'null')
    )
        return null;
    const schema = selectBranch(sourceSchema, value);
    if (Array.isArray(value))
        return value.map((item) =>
            schema.items
                ? normalizeNullablePlaceholders(item, schema.items)
                : item,
        );
    if (!value || typeof value !== 'object') return value;
    const result: Record<string, unknown> = { ...value };
    const properties = schema.properties ?? {};
    for (const [key, property] of Object.entries(properties)) {
        if (key in result) {
            result[key] = normalizeNullablePlaceholders(result[key], property);
        }
    }
    return result;
};

const REPAIRABLE_QUERY_TOOLS = new Set(['runQuery', 'generateVisualization']);

export const repairQueryToolCall: ToolCallRepairFunction<ToolSet> = async ({
    toolCall,
    inputSchema,
}) => {
    if (!REPAIRABLE_QUERY_TOOLS.has(toolCall.toolName)) return null;
    let input: unknown;
    try {
        input = JSON.parse(toolCall.input);
    } catch {
        return null;
    }
    const schema = (await inputSchema({
        toolName: toolCall.toolName,
    })) as JsonSchema;
    // Only normalize an explicit placeholder. Inventing omitted filters,
    // parameters, or arrays can turn an invalid call into a broader query.
    const repaired = normalizeNullablePlaceholders(input, schema);
    const serialized = JSON.stringify(repaired);
    return serialized === toolCall.input
        ? null
        : { ...toolCall, input: serialized };
};
