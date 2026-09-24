import { Output } from 'ai';
import { z } from 'zod';

/**
 * `Output.object`, with the schema checked against OpenAI's strict
 * structured-output rules.
 *
 * OpenAI rejects `oneOf`, `allOf` and `not` outright; zod renders
 * `z.discriminatedUnion`, `z.intersection` and `z.never` as exactly those.
 * Anthropic's provider rewrites `oneOf` to `anyOf` before sending, so a schema
 * that 400s on OpenAI looks perfectly healthy on Anthropic — three of ours
 * shipped that way and stayed broken on OpenAI for months. The check therefore
 * runs on the provider-agnostic serialisation, so it says the same thing
 * whoever is configured.
 *
 * Never throws in production: a schema that reaches it there already works on
 * whatever provider is live, and failing the call would be the worse outcome.
 */

const REJECTED_KEYWORDS: Record<string, string> = {
    oneOf: 'almost certainly a z.discriminatedUnion — use z.union instead; it parses the same inputs and renders anyOf',
    allOf: 'almost certainly a z.intersection — merge the objects into one z.object instead',
    not: 'almost certainly a z.never — remove it or model the absent case explicitly',
};

// Keywords whose value is a schema or an array of schemas.
const SUBSCHEMA_KEYWORDS = new Set([
    'items',
    'prefixItems',
    'additionalItems',
    'contains',
    'additionalProperties',
    'unevaluatedProperties',
    'unevaluatedItems',
    'propertyNames',
    'if',
    'then',
    'else',
    'not',
    'anyOf',
    'allOf',
    'oneOf',
]);
// Keywords whose value maps names to schemas: the names are not keywords.
const SCHEMA_MAP_KEYWORDS = new Set([
    'properties',
    'patternProperties',
    'dependentSchemas',
    '$defs',
    'definitions',
]);

type Rejection = { keyword: string; path: string };

/** Rejected keywords in keyword position; descends only into subschemas. */
const findRejected = (schema: unknown, path: string): Rejection[] => {
    if (
        schema === null ||
        typeof schema !== 'object' ||
        Array.isArray(schema)
    ) {
        return [];
    }
    return Object.entries(schema).flatMap(([key, value]: [string, unknown]) => {
        const keyPath = `${path}.${key}`;
        if (SCHEMA_MAP_KEYWORDS.has(key)) {
            return typeof value === 'object' && value !== null
                ? Object.entries(value).flatMap(([name, subschema]) =>
                      findRejected(subschema, `${keyPath}.${name}`),
                  )
                : [];
        }
        if (!SUBSCHEMA_KEYWORDS.has(key)) {
            return [];
        }
        const here = Object.hasOwn(REJECTED_KEYWORDS, key)
            ? [{ keyword: key, path: keyPath }]
            : [];
        const nested = Array.isArray(value)
            ? value.flatMap((subschema: unknown, index) =>
                  findRejected(subschema, `${keyPath}[${index}]`),
              )
            : findRejected(value, keyPath);
        return [...here, ...nested];
    });
};

const checked = new WeakSet<z.ZodType>();

export const assertStrictModeSafe = (schema: z.ZodType) => {
    if (checked.has(schema)) {
        return;
    }

    // The options the AI SDK serialises with, before any provider rewrites it.
    const found = findRejected(
        z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }),
        '$',
    );
    if (found.length === 0) {
        checked.add(schema);
        return;
    }

    const detail = found
        .map(
            ({ keyword, path }) =>
                `  ${path} — ${REJECTED_KEYWORDS[keyword] ?? keyword}`,
        )
        .join('\n');
    throw new Error(
        `Structured-output schema uses JSON Schema keywords OpenAI's strict mode rejects.\nThe provider returns 400 before the model runs, and Anthropic hides this by rewriting oneOf to anyOf.\n${detail}`,
    );
};

export const strictOutput = <OBJECT>(schema: z.ZodType<OBJECT>) => {
    if (process.env.NODE_ENV !== 'production') {
        assertStrictModeSafe(schema);
    }
    return Output.object({ schema });
};
