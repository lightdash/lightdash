/* eslint-disable @typescript-eslint/no-throw-literal */
import path from 'node:path';

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type SwaggerDoc = {
    components?: {
        schemas?: Record<string, JsonObject>;
    };
};

const SCHEMA_REF_PREFIX = '#/components/schemas/';
const DEFS_REF_PREFIX = '#/$defs/';

export const getRepoRoot = (): string =>
    path.resolve(__dirname, '../../../../');

export const getSwaggerPath = (): string =>
    path.join(getRepoRoot(), 'packages/backend/src/generated/swagger.json');

export const toObject = (value: JsonValue | undefined): JsonObject =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as JsonObject)
        : {};

export const unique = <T>(values: T[]): T[] => [...new Set(values)];

export const mergeObjectSchemas = (
    left: JsonObject,
    right: JsonObject,
): JsonObject => {
    const merged: JsonObject = { ...left, ...right };

    const leftProperties = toObject(left.properties);
    const rightProperties = toObject(right.properties);
    const hasProperties =
        Object.keys(leftProperties).length > 0 ||
        Object.keys(rightProperties).length > 0;
    if (hasProperties) {
        merged.properties = { ...leftProperties, ...rightProperties };
    }

    const leftRequired = Array.isArray(left.required)
        ? (left.required as JsonValue[])
        : [];
    const rightRequired = Array.isArray(right.required)
        ? (right.required as JsonValue[])
        : [];
    if (leftRequired.length > 0 || rightRequired.length > 0) {
        merged.required = unique([
            ...leftRequired.map((value) => String(value)),
            ...rightRequired.map((value) => String(value)),
        ]);
    }

    return merged;
};

export const resolveComponentRef = (
    ref: string,
    components: Record<string, JsonObject>,
    depth = 0,
): JsonObject => {
    if (depth > 10) {
        throw new Error(`Max $ref resolution depth exceeded at: ${ref}`);
    }
    if (!ref.startsWith(SCHEMA_REF_PREFIX)) {
        throw new Error(`Unsupported $ref format: ${ref}`);
    }

    const schemaName = ref.slice(SCHEMA_REF_PREFIX.length);
    const schema = components[schemaName];
    if (!schema) {
        throw new Error(`Missing schema component: ${schemaName}`);
    }

    if (typeof schema.$ref === 'string') {
        return resolveComponentRef(schema.$ref, components, depth + 1);
    }

    return schema;
};

export const resolveTopLevelAllOf = (
    schema: JsonObject,
    components: Record<string, JsonObject>,
): JsonObject => {
    if (!Array.isArray(schema.allOf)) {
        return schema;
    }

    return schema.allOf.reduce<JsonObject>((acc, part) => {
        const partObject =
            part && typeof part === 'object' && !Array.isArray(part)
                ? (part as JsonObject)
                : {};
        const resolvedPart = partObject.$ref
            ? resolveComponentRef(String(partObject.$ref), components)
            : partObject;
        return mergeObjectSchemas(acc, resolvedPart);
    }, {});
};

export const collectComponentRefs = (
    value: JsonValue,
    refs: Set<string> = new Set(),
): Set<string> => {
    if (Array.isArray(value)) {
        value.forEach((item) => collectComponentRefs(item, refs));
        return refs;
    }

    if (!value || typeof value !== 'object') {
        return refs;
    }

    const objectValue = value as JsonObject;
    const refValue = objectValue.$ref;
    if (
        typeof refValue === 'string' &&
        refValue.startsWith(SCHEMA_REF_PREFIX)
    ) {
        refs.add(refValue.slice(SCHEMA_REF_PREFIX.length));
    }

    Object.values(objectValue).forEach((child) =>
        collectComponentRefs(child, refs),
    );
    return refs;
};

const rewriteRef = (ref: string): string =>
    ref.startsWith(SCHEMA_REF_PREFIX)
        ? `${DEFS_REF_PREFIX}${ref.slice(SCHEMA_REF_PREFIX.length)}`
        : ref;

export const convertOpenApiToDraft07 = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) {
        return value.map((item) => convertOpenApiToDraft07(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const source = value as JsonObject;
    const convertedEntries = Object.entries(source).map(([key, child]) => [
        key,
        convertOpenApiToDraft07(child),
    ]);
    const converted = Object.fromEntries(convertedEntries) as JsonObject;

    if (typeof converted.$ref === 'string') {
        converted.$ref = rewriteRef(converted.$ref);
    }

    const { nullable } = converted;
    delete converted.nullable;

    if (nullable !== true) {
        return converted;
    }

    if (typeof converted.type === 'string') {
        converted.type = [converted.type, 'null'];
        return converted;
    }

    if (Array.isArray(converted.type)) {
        const typeValues = converted.type.map((item) => String(item));
        converted.type = unique([...typeValues, 'null']);
        return converted;
    }

    return {
        anyOf: [converted, { type: 'null' }],
    };
};

export const sortKeysDeep = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) {
        return value.map((item) => sortKeysDeep(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const objectValue = value as JsonObject;
    const sortedEntries = Object.entries(objectValue)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortKeysDeep(child)]);

    return Object.fromEntries(sortedEntries);
};

export const toStableJson = (value: JsonObject): string =>
    `${JSON.stringify(sortKeysDeep(value), null, 4)}\n`;

export const parseSwagger = (content: string): SwaggerDoc =>
    JSON.parse(content) as SwaggerDoc;

export const getConstStringValue = (
    schema: JsonObject,
    components: Record<string, JsonObject>,
): string | undefined => {
    if (typeof schema.const === 'string') {
        return schema.const;
    }

    if (Array.isArray(schema.enum) && schema.enum.length === 1) {
        const [value] = schema.enum;
        return typeof value === 'string' ? value : undefined;
    }

    if (
        typeof schema.$ref === 'string' &&
        schema.$ref.startsWith(SCHEMA_REF_PREFIX)
    ) {
        const referenced = resolveComponentRef(schema.$ref, components);
        return getConstStringValue(referenced, components);
    }

    return undefined;
};

export const buildSchemaFromSwagger = (
    swagger: SwaggerDoc,
    schemaName: string,
): { rootSchema: JsonObject; defs: Record<string, JsonObject> } => {
    const components = swagger.components?.schemas;
    if (!components) {
        throw new Error('Missing `components.schemas` in swagger document');
    }

    const sourceSchema = components[schemaName];
    if (!sourceSchema) {
        throw new Error(
            `Missing \`components.schemas.${schemaName}\` in swagger document`,
        );
    }

    const rootSchema = resolveTopLevelAllOf(sourceSchema, components);
    const refsToVisit = [...collectComponentRefs(rootSchema)];
    const visited = new Set<string>();

    while (refsToVisit.length > 0) {
        const ref = refsToVisit.pop();
        if (!ref || visited.has(ref)) {
            // no-op
        } else {
            visited.add(ref);

            const component = components[ref];
            if (!component) {
                throw new Error(`Missing referenced component schema: ${ref}`);
            }

            collectComponentRefs(component).forEach((nestedRef) => {
                if (!visited.has(nestedRef)) refsToVisit.push(nestedRef);
            });
        }
    }

    const defs = [...visited]
        .sort((left, right) => left.localeCompare(right))
        .reduce<Record<string, JsonObject>>((acc, defName) => {
            acc[defName] = convertOpenApiToDraft07(
                components[defName],
            ) as JsonObject;
            return acc;
        }, {});

    return { rootSchema, defs };
};
