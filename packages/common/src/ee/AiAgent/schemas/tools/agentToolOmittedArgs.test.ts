import { asSchema } from 'ai';
import { describe, expect, it } from 'vitest';
import { agentToolDefinitions } from './toolDefinitions';
import { toolSearchSemanticLayerArgsSchema } from './toolSearchSemanticLayerArgs';

type JsonSchemaNode = Record<string, unknown>;

const resolve = (node: unknown, defs: JsonSchemaNode): JsonSchemaNode => {
    if (!node || typeof node !== 'object') return {};
    const n = node as JsonSchemaNode;
    if (typeof n.$ref === 'string') {
        return resolve(defs[n.$ref.split('/').pop() ?? ''], defs);
    }
    return n;
};

const allowsNull = (node: unknown, defs: JsonSchemaNode): boolean => {
    const n = resolve(node, defs);
    const { type } = n;
    if (type === 'null' || (Array.isArray(type) && type.includes('null'))) {
        return true;
    }
    const alternatives = [
        ...((n.anyOf as unknown[] | undefined) ?? []),
        ...((n.oneOf as unknown[] | undefined) ?? []),
    ];
    return alternatives.some((alternative) => allowsNull(alternative, defs));
};

const collectRequiredNullableKeys = (
    node: unknown,
    defs: JsonSchemaNode,
    path: string,
    seen: Set<unknown>,
): string[] => {
    const n = resolve(node, defs);
    if (seen.has(n)) return [];
    seen.add(n);
    const required = new Set((n.required as string[] | undefined) ?? []);
    const properties = (n.properties as JsonSchemaNode | undefined) ?? {};
    const fromProperties = Object.entries(properties).flatMap(
        ([key, value]) => {
            const keyPath = path ? `${path}.${key}` : key;
            const own =
                required.has(key) &&
                allowsNull(value, defs) &&
                !('default' in resolve(value, defs))
                    ? [keyPath]
                    : [];
            return [
                ...own,
                ...collectRequiredNullableKeys(value, defs, keyPath, seen),
            ];
        },
    );
    const fromAlternatives = [
        ...((n.anyOf as unknown[] | undefined) ?? []),
        ...((n.oneOf as unknown[] | undefined) ?? []),
    ].flatMap((alternative) =>
        collectRequiredNullableKeys(alternative, defs, path, seen),
    );
    const fromItems = n.items
        ? collectRequiredNullableKeys(n.items, defs, `${path}[]`, seen)
        : [];
    return [...fromProperties, ...fromAlternatives, ...fromItems];
};

describe('agent tool omitted arguments', () => {
    // Models omit keys described as optional instead of sending null, so a
    // nullable input key that is still required fails validation before the
    // tool runs. Every nullable agent input must accept omission.
    it.each(agentToolDefinitions.map((tool) => [tool.name, tool] as const))(
        '%s has no required-but-nullable input keys',
        (_name, tool) => {
            const jsonSchema = asSchema(tool.for('agent').inputSchema)
                .jsonSchema as JsonSchemaNode;
            const defs =
                ((jsonSchema.$defs ?? jsonSchema.definitions) as
                    | JsonSchemaNode
                    | undefined) ?? {};

            expect(
                collectRequiredNullableKeys(jsonSchema, defs, '', new Set()),
            ).toEqual([]);
        },
    );

    it('searchSemanticLayer accepts a call without paging arguments', () => {
        expect(
            toolSearchSemanticLayerArgsSchema.parse({
                searchQuery: 'region',
                type: 'dimension',
            }),
        ).toEqual({
            searchQuery: 'region',
            type: 'dimension',
            pageSize: null,
            page: null,
        });
    });
});
