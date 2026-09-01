import { z } from 'zod';

type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

const stripUuidPattern = ({
    jsonSchema,
}: {
    jsonSchema: Record<string, unknown>;
}): void => {
    if (jsonSchema.format === 'uuid') {
        // Zod's override mutates the node it is converting.
        // eslint-disable-next-line no-param-reassign
        delete jsonSchema.pattern;
    }
};

export const draft7JsonSchemaOptions = (reused: 'inline' | 'ref') =>
    ({
        target: 'draft-07' as const,
        reused,
        unrepresentable: 'any' as const,
        override: stripUuidPattern,
    }) as const;

const relaxDefaultedRequired = (value: JsonValue): JsonValue => {
    if (Array.isArray(value)) {
        return value.map((item) => relaxDefaultedRequired(item));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const next: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) {
        next[key] = relaxDefaultedRequired(child);
    }
    const { properties } = next;
    const { required } = next;
    if (
        properties &&
        typeof properties === 'object' &&
        !Array.isArray(properties) &&
        Array.isArray(required)
    ) {
        next.required = required.filter((key) => {
            if (typeof key !== 'string') {
                return true;
            }
            const property = properties[key];
            return !(
                property &&
                typeof property === 'object' &&
                !Array.isArray(property) &&
                'default' in property
            );
        });
        if (next.required.length === 0) {
            delete next.required;
        }
    }
    return next;
};

/**
 * Draft-07 JSON Schema with reused nodes inlined.
 * MCP Gateway cannot resolve `$ref` pointers (500 ERR_INVALID_URL).
 * UUID `pattern` is omitted so listings stay aligned with Zod 3 `format: uuid`.
 * Keys that only exist because of `.default()` stay optional, matching Zod 3
 * `zod-to-json-schema` listings.
 */
export const toDraft7JsonSchema = (schema: z.ZodType): JsonValue =>
    relaxDefaultedRequired(
        z.toJSONSchema(schema, draft7JsonSchemaOptions('inline')) as JsonValue,
    );
