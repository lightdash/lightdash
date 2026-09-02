import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import {
    toJsonSchema,
    toLlmJsonSchema,
    type JsonSchema,
} from '../../../../utils/zodJsonSchema';
import { agentToolDefinitions } from './toolDefinitions';

// toLlmJsonSchema re-encodes the native Zod 4 output for models. Every rewrite
// must be validation-equivalent to the native schema with closed objects,
// which is the only semantic change it is allowed to make.

type JsonSchemaDefinition = JsonSchema | boolean;

const MAX_SAMPLES_PER_SCHEMA = 24;
const UUID = '3675b69e-8324-4110-bdca-059031aa8da3';

const isSchema = (value: unknown): value is JsonSchema =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const closeObjects = (
    definition: JsonSchemaDefinition,
): JsonSchemaDefinition => {
    if (!isSchema(definition)) return definition;
    const closed: JsonSchema = Object.fromEntries(
        Object.entries(definition).map(([key, value]) => {
            if (Array.isArray(value)) {
                return [key, value.map(closeObjects)];
            }
            if (
                isSchema(value) &&
                ['properties', 'definitions'].includes(key)
            ) {
                return [
                    key,
                    Object.fromEntries(
                        Object.entries(value).map(([name, child]) => [
                            name,
                            closeObjects(child as JsonSchemaDefinition),
                        ]),
                    ),
                ];
            }
            return [key, isSchema(value) ? closeObjects(value) : value];
        }),
    );
    if (closed.properties && closed.additionalProperties === undefined) {
        closed.additionalProperties = false;
    }
    return closed;
};

const resolve = (
    definition: JsonSchemaDefinition,
    root: JsonSchema,
): JsonSchema => {
    if (!isSchema(definition)) return {};
    if (definition.$ref === undefined) return definition;
    const name = definition.$ref.replace('#/definitions/', '');
    const target = root.definitions?.[name];
    return isSchema(target) ? resolve(target, root) : {};
};

const stringSample = (schema: JsonSchema): string => {
    if (schema.format === 'uuid' || schema.pattern?.includes('[0-9a-fA-F]{8}'))
        return UUID;
    if (schema.format === 'date-time') return '2026-09-01T00:00:00.000Z';
    if (schema.format === 'date') return '2026-09-01';
    if (schema.format === 'email') return 'a@b.com';
    const minLength =
        typeof schema.minLength === 'number' ? schema.minLength : 0;
    return 'x'.repeat(Math.max(minLength, 1));
};

const numberSample = (schema: JsonSchema): number => {
    const minimum = typeof schema.minimum === 'number' ? schema.minimum : 0;
    const exclusiveMinimum =
        typeof schema.exclusiveMinimum === 'number'
            ? schema.exclusiveMinimum + 1
            : Number.NEGATIVE_INFINITY;
    const maximum = typeof schema.maximum === 'number' ? schema.maximum : 1000;
    return Math.min(Math.max(minimum, exclusiveMinimum, 1), maximum);
};

const samplesFor = (
    definition: JsonSchemaDefinition,
    root: JsonSchema,
): unknown[] => {
    const schema = resolve(definition, root);
    if (schema.enum) return schema.enum;
    if (schema.const !== undefined) return [schema.const];
    if (schema.allOf?.length === 1) {
        const { allOf, ...rest } = schema;
        return samplesFor({ ...resolve(allOf[0], root), ...rest }, root);
    }
    const branches = schema.anyOf ?? schema.oneOf;
    if (branches) {
        return branches
            .flatMap((branch) => samplesFor(branch, root))
            .slice(0, MAX_SAMPLES_PER_SCHEMA);
    }
    if (Array.isArray(schema.type)) {
        return schema.type.flatMap((type) =>
            samplesFor({ ...schema, type }, root),
        );
    }
    switch (schema.type) {
        case 'null':
            return [null];
        case 'boolean':
            return [true, false];
        case 'string':
            return [stringSample(schema)];
        case 'number':
        case 'integer':
            return [numberSample(schema)];
        case 'array': {
            const items = Array.isArray(schema.items)
                ? undefined
                : schema.items;
            const [first] = items ? samplesFor(items, root) : ['item'];
            const minItems =
                typeof schema.minItems === 'number' ? schema.minItems : 0;
            return minItems > 0
                ? [Array.from({ length: minItems }, () => first)]
                : [[], [first]];
        }
        case 'object': {
            const properties: Record<string, JsonSchemaDefinition> =
                schema.properties ?? {};
            const required = new Set(schema.required ?? []);
            const perProperty = Object.entries(properties).map(
                ([name, property]) =>
                    [name, samplesFor(property, root)] as const,
            );
            const full = Object.fromEntries(
                perProperty.map(([name, [first]]) => [name, first]),
            );
            const requiredOnly = Object.fromEntries(
                perProperty
                    .filter(([name]) => required.has(name))
                    .map(([name, [first]]) => [name, first]),
            );
            const alternatives = perProperty.flatMap(([name, values]) =>
                values.slice(1).map((value) => ({ ...full, [name]: value })),
            );
            return [full, requiredOnly, ...alternatives].slice(
                0,
                MAX_SAMPLES_PER_SCHEMA,
            );
        }
        default:
            return ['anything', 7, null];
    }
};

const WRONG_VALUES: unknown[] = [null, 'wrong', 42, true, {}, []];

const mutate = (sample: unknown): unknown[] => {
    if (Array.isArray(sample)) {
        return [
            ...WRONG_VALUES,
            ...(sample.length > 0
                ? mutate(sample[0]).map((item) => [item, ...sample.slice(1)])
                : []),
        ];
    }
    if (isSchema(sample)) {
        const record = sample as Record<string, unknown>;
        return [
            ...WRONG_VALUES,
            { ...record, unexpectedKey: 1 },
            ...Object.entries(record).flatMap(([key, value]) => {
                const { [key]: _removed, ...without } = record;
                return [
                    without,
                    ...mutate(value).map((mutated) => ({
                        ...record,
                        [key]: mutated,
                    })),
                ];
            }),
        ];
    }
    return WRONG_VALUES;
};

const compile = (schema: JsonSchema): ValidateFunction => {
    const ajv = new Ajv({ strict: false, allErrors: false });
    addFormats(ajv);
    return ajv.compile(schema);
};

describe('agent tool JSON Schema encoding', () => {
    test.each(
        agentToolDefinitions.map((definition) => [
            definition.name,
            definition.inputSchema,
        ]),
    )('%s validates identically to the native schema', (_name, zodSchema) => {
        const reference = closeObjects(
            toJsonSchema(zodSchema, { io: 'input', reused: 'ref' }),
        );
        if (!isSchema(reference)) throw new Error('unexpected boolean schema');
        const encoded = toLlmJsonSchema(zodSchema, { reused: 'ref' });
        const validateReference = compile(reference);
        const validateEncoded = compile(encoded);

        const valid = samplesFor(reference, reference);
        const candidates = [
            ...valid,
            ...valid.flatMap((sample) => mutate(sample)),
        ];
        const accepted = candidates.filter((candidate) =>
            validateReference(candidate),
        );

        validateReference(valid[0]);
        expect(
            accepted.length,
            `no generated sample is valid: ${JSON.stringify(validateReference.errors)}`,
        ).toBeGreaterThan(0);
        expect(accepted.length).toBeLessThan(candidates.length);
        const disagreements = candidates.filter(
            (candidate) =>
                validateReference(candidate) !== validateEncoded(candidate),
        );
        expect(disagreements).toEqual([]);
    });
});
