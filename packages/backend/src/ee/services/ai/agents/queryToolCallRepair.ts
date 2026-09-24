import {
    FilterOperator,
    getFields,
    getFilterTypeFromItemType,
    getItemId,
    type CompiledField,
    type Explore,
} from '@lightdash/common';
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const NO_VALUE_OPERATORS: ReadonlySet<string> = new Set([
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
]);

type ToolFilterGroup = { connector: 'and' | 'or' | null; rules: unknown[] };

/** A flat metric-query filter group as tool rules; null when it cannot be rewritten exactly. */
const toToolFilterGroup = (
    group: unknown,
    fieldTypes: Map<string, CompiledField['type']>,
): ToolFilterGroup | null => {
    if (group === null || group === undefined)
        return { connector: null, rules: [] };
    if (Array.isArray(group)) return { connector: null, rules: group };
    if (!isRecord(group)) return null;
    // Stored chart configs wrap tool-shaped rules in { rules, connector }.
    if (
        Array.isArray(group.rules) &&
        (group.connector === 'and' || group.connector === 'or')
    )
        return { connector: group.connector, rules: group.rules };
    const connector = Array.isArray(group.and) ? 'and' : null;
    const children = connector ? group.and : group.or;
    if (!Array.isArray(children)) return null;
    const rules = children.map((child) => {
        if (!isRecord(child) || !isRecord(child.target)) return null;
        const { fieldId } = child.target;
        const fieldType =
            typeof fieldId === 'string' ? fieldTypes.get(fieldId) : undefined;
        if (!fieldType || typeof child.operator !== 'string') return null;
        return {
            fieldId,
            fieldType,
            fieldFilterType: getFilterTypeFromItemType(fieldType),
            operator: child.operator,
            ...(NO_VALUE_OPERATORS.has(child.operator)
                ? {}
                : { values: child.values ?? [] }),
            ...(child.settings ? { settings: child.settings } : {}),
        };
    });
    return rules.every((rule) => rule !== null)
        ? { connector: connector ?? 'or', rules }
        : null;
};

/** Rewrites metric-query shaped filters into the tool's flat shape when the meaning is unchanged. */
const toToolFilters = (
    filters: unknown,
    fieldTypes: Map<string, CompiledField['type']>,
): unknown => {
    if (!isRecord(filters)) return filters;
    const keys = ['dimensions', 'metrics', 'tableCalculations'] as const;
    if (
        typeof filters.type === 'string' &&
        keys.every(
            (key) =>
                filters[key] === null ||
                filters[key] === undefined ||
                Array.isArray(filters[key]),
        )
    )
        return filters;
    const groups = keys.map((key) =>
        toToolFilterGroup(filters[key], fieldTypes),
    );
    if (groups.some((group) => group === null)) return filters;
    const connectors = new Set(
        groups.flatMap((group) =>
            group && group.connector && group.rules.length > 1
                ? [group.connector]
                : [],
        ),
    );
    if (connectors.size > 1) return filters;
    const stated =
        filters.type === 'and' || filters.type === 'or' ? filters.type : null;
    const [derived] = [...connectors];
    if (stated && derived && stated !== derived) return filters;
    // With no group holding two rules, and/or read the same.
    const type = stated ?? derived ?? 'and';
    const [dimensions, metrics, tableCalculations] = groups.map((group) =>
        group && group.rules.length ? group.rules : null,
    );
    return { type, dimensions, metrics, tableCalculations };
};

const fieldTypesOf = (explores: Explore[], exploreName: unknown) => {
    const explore = explores.find(({ name }) => name === exploreName);
    return new Map(
        explore
            ? getFields(explore).map((field) => [getItemId(field), field.type])
            : [],
    );
};

/**
 * Repairs invalid query tool calls without widening the query: explicit null
 * placeholders, metric-query shaped filters, and a missing runQuery title.
 */
export const createQueryToolCallRepair =
    ({
        explores,
        question,
    }: {
        explores: Explore[];
        question: string;
    }): ToolCallRepairFunction<ToolSet> =>
    async ({ toolCall, inputSchema }) => {
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
        if (isRecord(repaired) && isRecord(repaired.queryConfig)) {
            const { queryConfig } = repaired;
            repaired.queryConfig = {
                ...queryConfig,
                ...('filters' in queryConfig
                    ? {
                          filters: toToolFilters(
                              queryConfig.filters,
                              fieldTypesOf(explores, queryConfig.exploreName),
                          ),
                      }
                    : {}),
            };
        }
        // Titles only label the result; they never change what is queried.
        if (
            toolCall.toolName === 'runQuery' &&
            isRecord(repaired) &&
            question.trim()
        ) {
            if (repaired.title === undefined)
                repaired.title = question.trim().slice(0, 140);
            if (repaired.description === undefined) repaired.description = '';
        }
        const serialized = JSON.stringify(repaired);
        return serialized === toolCall.input
            ? null
            : { ...toolCall, input: serialized };
    };

export const repairQueryToolCall = createQueryToolCallRepair({
    explores: [],
    question: '',
});
