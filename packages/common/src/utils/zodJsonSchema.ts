import { z } from 'zod';

type JsonSchemaIo = 'input' | 'output';
type ReusedStrategy = 'inline' | 'ref';

type JsonSchemaTypeName =
    | 'object'
    | 'array'
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'integer';
type JsonSchemaLiteral = string | number | boolean | null;
type JsonSchemaDefinition = JsonSchema | boolean;

/** Draft-07 keywords this module reads or writes; anything else passes through. */
export type JsonSchema = {
    [keyword: string]: unknown;
    type?: JsonSchemaTypeName | JsonSchemaTypeName[];
    description?: string;
    const?: JsonSchemaLiteral;
    enum?: JsonSchemaLiteral[];
    properties?: Record<string, JsonSchemaDefinition>;
    additionalProperties?: JsonSchemaDefinition;
    items?: JsonSchemaDefinition | JsonSchemaDefinition[];
    definitions?: Record<string, JsonSchemaDefinition>;
    anyOf?: JsonSchemaDefinition[];
    oneOf?: JsonSchemaDefinition[];
    allOf?: JsonSchemaDefinition[];
    not?: JsonSchemaDefinition;
    $ref?: string;
    propertyNames?: JsonSchemaDefinition;
    maximum?: number;
    minimum?: number;
};

/**
 * Native Zod 4 conversion with the settings the MCP SDK uses when it serves
 * `tools/list`, so committed MCP contracts match the live server byte for byte.
 */
export const toJsonSchema = (
    schema: z.ZodType,
    { io, reused = 'inline' }: { io: JsonSchemaIo; reused?: ReusedStrategy },
): JsonSchema =>
    z.toJSONSchema(schema, {
        target: 'draft-07',
        io,
        reused,
        cycles: 'throw',
    });

const isJsonSchema = (value: unknown): value is JsonSchema =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isNullSchema = (schema: JsonSchemaDefinition): boolean =>
    typeof schema === 'object' &&
    schema.type === 'null' &&
    Object.keys(schema).length === 1;

const isCompound = (schema: JsonSchema): boolean =>
    schema.anyOf !== undefined ||
    schema.oneOf !== undefined ||
    schema.allOf !== undefined ||
    schema.not !== undefined ||
    schema.$ref !== undefined;

const isConstBranch = (
    schema: JsonSchemaDefinition,
): schema is JsonSchema & { type: JsonSchemaTypeName } =>
    typeof schema === 'object' &&
    typeof schema.type === 'string' &&
    schema.const !== undefined &&
    Object.keys(schema).every((key) => key === 'type' || key === 'const');

/** Move a lone branch description onto the union, where models read it. */
const hoistDescription = (
    schema: JsonSchema,
    branches: JsonSchemaDefinition[],
): { schema: JsonSchema; branches: JsonSchemaDefinition[] } => {
    if (schema.description !== undefined) return { schema, branches };
    const described = branches.filter(
        (branch: JsonSchemaDefinition): branch is JsonSchema =>
            typeof branch === 'object' && branch.description !== undefined,
    );
    if (described.length !== 1) return { schema, branches };
    const { description, ...describedRest } = described[0];
    return {
        schema: { ...schema, description },
        branches: branches.map((branch: JsonSchemaDefinition) =>
            branch === described[0] ? describedRest : branch,
        ),
    };
};

const nullableEnumOf = ({
    const: constValue,
    enum: enumValues,
}: JsonSchema): JsonSchemaLiteral[] | undefined => {
    if (enumValues !== undefined) return [...enumValues, null];
    if (constValue !== undefined) return [constValue, null];
    return undefined;
};

/**
 * Encode a union the way the previous converter did: same-typed consts become
 * an `enum`, and `X | null` becomes `type: [X, 'null']` on a single schema.
 */
const collapseUnion = (
    input: JsonSchema,
    key: 'anyOf' | 'oneOf',
): JsonSchema => {
    const nested = input[key];
    if (!nested || nested.length === 0) return input;
    const { [key]: _nested, ...rest } = input;
    const { schema, branches: hoisted } = hoistDescription(rest, nested);
    // A nullable union nests one anyOf inside another; one level reads better.
    const branches = hoisted.flatMap((branch: JsonSchemaDefinition) =>
        typeof branch === 'object' &&
        branch[key] !== undefined &&
        Object.keys(branch).length === 1
            ? (branch[key] ?? [])
            : [branch],
    );

    const constBranches = branches.flatMap((branch: JsonSchemaDefinition) =>
        isConstBranch(branch) ? [branch] : [],
    );
    if (
        constBranches.length === branches.length &&
        new Set(constBranches.map((branch) => branch.type)).size === 1
    ) {
        return {
            ...schema,
            type: constBranches[0].type,
            enum: constBranches.flatMap((branch) =>
                branch.const === undefined ? [] : [branch.const],
            ),
        };
    }

    if (branches.length === 2) {
        const nullIndex = branches.findIndex(isNullSchema);
        const other = branches[1 - nullIndex];
        if (
            nullIndex !== -1 &&
            typeof other === 'object' &&
            typeof other.type === 'string' &&
            !isCompound(other)
        ) {
            const { const: _const, enum: _enum, ...otherRest } = other;
            const nullableEnum = nullableEnumOf(other);
            return {
                ...otherRest,
                ...schema,
                type: [other.type, 'null'],
                ...(nullableEnum ? { enum: nullableEnum } : {}),
            };
        }
    }

    return { ...schema, [key]: branches };
};

/** Zod 4 emits these for every record and safe integer; they only cost tokens. */
const dropNoiseKeywords = ({
    propertyNames,
    maximum,
    minimum,
    ...rest
}: JsonSchema): JsonSchema => {
    const keepPropertyNames =
        propertyNames !== undefined &&
        !(
            typeof propertyNames === 'object' &&
            propertyNames.type === 'string' &&
            Object.keys(propertyNames).length === 1
        );
    const isInteger = rest.type === 'integer';
    const keepMaximum =
        maximum !== undefined &&
        !(isInteger && maximum === Number.MAX_SAFE_INTEGER);
    const keepMinimum =
        minimum !== undefined &&
        !(isInteger && minimum === Number.MIN_SAFE_INTEGER);
    return {
        ...rest,
        ...(keepPropertyNames ? { propertyNames } : {}),
        ...(keepMaximum ? { maximum } : {}),
        ...(keepMinimum ? { minimum } : {}),
    };
};

// A `$ref` costs about as much as a small schema and hides it from the model;
// only larger shared schemas earn a definition.
const INLINE_DEFINITION_MAX_CHARS = 160;

const DEFINITIONS_PREFIX = '#/definitions/';

/** Replace refs to small self-contained definitions with the definition. */
const inlineSmallDefinitions = (root: JsonSchema): JsonSchema => {
    const { definitions } = root;
    if (!definitions) return root;
    const inlineable = new Map(
        Object.entries(definitions).filter(([, definition]) => {
            const serialized = JSON.stringify(definition);
            return (
                serialized.length <= INLINE_DEFINITION_MAX_CHARS &&
                !serialized.includes('"$ref"')
            );
        }),
    );
    if (inlineable.size === 0) return root;

    const inline = (definition: JsonSchemaDefinition): JsonSchemaDefinition => {
        if (typeof definition !== 'object') return definition;
        const { $ref, ...siblings } = definition;
        const name = $ref?.startsWith(DEFINITIONS_PREFIX)
            ? $ref.slice(DEFINITIONS_PREFIX.length)
            : undefined;
        const target = name === undefined ? undefined : inlineable.get(name);
        const source =
            typeof target === 'object'
                ? { ...target, ...siblings }
                : definition;
        const inlineValue = (value: unknown): unknown => {
            if (Array.isArray(value)) return value.map(inlineValue);
            if (isJsonSchema(value)) return inline(value);
            return value;
        };
        return Object.fromEntries(
            Object.entries(source).map(([key, value]) => [
                key,
                inlineValue(value),
            ]),
        );
    };

    const { definitions: _definitions, ...rest } = root;
    const inlined = inline(rest);
    if (typeof inlined !== 'object') return root;
    const remaining = Object.fromEntries(
        Object.entries(definitions)
            .filter(([name]) => !inlineable.has(name))
            .map(([name, definition]) => [name, inline(definition)]),
    );
    return Object.keys(remaining).length > 0
        ? { ...inlined, definitions: remaining }
        : inlined;
};

export const normalizeJsonSchema = (schema: JsonSchema): JsonSchema => {
    const normalizeDefinition = (
        definition: JsonSchemaDefinition,
    ): JsonSchemaDefinition =>
        typeof definition === 'boolean'
            ? definition
            : normalizeJsonSchema(definition);
    const mapDefinitions = (
        definitions: Record<string, JsonSchemaDefinition>,
    ): Record<string, JsonSchemaDefinition> =>
        Object.fromEntries(
            Object.entries(definitions).map(([name, definition]) => [
                name,
                normalizeDefinition(definition),
            ]),
        );

    const result: JsonSchema = { ...schema };
    if (result.properties) {
        result.properties = mapDefinitions(result.properties);
        // Regular objects strip unknown keys at parse time; advertise that.
        if (result.additionalProperties === undefined) {
            result.additionalProperties = false;
        }
    }
    if (typeof result.additionalProperties === 'object') {
        result.additionalProperties = normalizeJsonSchema(
            result.additionalProperties,
        );
    }
    if (result.items !== undefined) {
        result.items = Array.isArray(result.items)
            ? result.items.map(normalizeDefinition)
            : normalizeDefinition(result.items);
    }
    if (result.definitions) {
        result.definitions = mapDefinitions(result.definitions);
    }
    if (result.anyOf) result.anyOf = result.anyOf.map(normalizeDefinition);
    if (result.oneOf) result.oneOf = result.oneOf.map(normalizeDefinition);
    if (result.allOf) result.allOf = result.allOf.map(normalizeDefinition);
    const { not } = result;
    if (typeof not === 'object') {
        result.not = normalizeJsonSchema(not);
    }

    return collapseUnion(
        collapseUnion(dropNoiseKeywords(result), 'anyOf'),
        'oneOf',
    );
};

/**
 * Input JSON Schema for LLM tool contracts. Objects are closed, unions use the
 * compact encodings models were trained on, and descriptions sit on the
 * property rather than inside a union branch.
 */
export const toLlmJsonSchema = (
    schema: z.ZodType,
    { reused = 'inline' }: { reused?: ReusedStrategy } = {},
): JsonSchema =>
    normalizeJsonSchema(
        inlineSmallDefinitions(toJsonSchema(schema, { io: 'input', reused })),
    );
