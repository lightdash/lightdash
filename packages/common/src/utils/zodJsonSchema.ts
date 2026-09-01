import { z } from 'zod';

type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

/**
 * Draft-07 JSON Schema with reused nodes inlined.
 * MCP Gateway cannot resolve `$ref` pointers (500 ERR_INVALID_URL).
 */
export const toDraft7JsonSchema = (schema: z.ZodType): JsonValue =>
    z.toJSONSchema(schema, {
        target: 'draft-07',
        reused: 'inline',
        unrepresentable: 'any',
    }) as JsonValue;
