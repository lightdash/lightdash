/**
 * Dependency-free validator for the JSON-Schema subset used by release safety.
 * The relevant CI jobs install only `tsx`, so this deliberately avoids a general
 * schema package. Unsupported schema evolution throws instead of silently
 * weakening validation; this is not a general JSON-Schema implementation.
 */

type Schema = Record<string, unknown>;

const IGNORED_KEYWORDS = new Set([
    '$schema',
    '$id',
    'title',
    'description',
    'format',
    'default',
]);

const SUPPORTED_KEYWORDS = new Set([
    'type',
    'const',
    'enum',
    'properties',
    'required',
    'additionalProperties',
    'items',
    'oneOf',
    '$ref',
    'minimum',
    'definitions',
]);

const SUPPORTED_TYPES = new Set([
    'object',
    'array',
    'string',
    'integer',
    'number',
    'boolean',
    'null',
]);

function isRecord(value: unknown): value is Schema {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSupportedSchema(schema: Schema): void {
    for (const keyword of Object.keys(schema)) {
        if (
            !SUPPORTED_KEYWORDS.has(keyword) &&
            !IGNORED_KEYWORDS.has(keyword)
        ) {
            throw new Error(`unsupported schema construct: ${keyword}`);
        }
    }

    const type = schema.type;
    const types = Array.isArray(type) ? type : type === undefined ? [] : [type];
    if (
        types.some(
            (entry) => typeof entry !== 'string' || !SUPPORTED_TYPES.has(entry),
        )
    ) {
        throw new Error('unsupported schema construct: type');
    }

    const visitMap = (value: unknown): void => {
        if (!isRecord(value)) return;
        for (const child of Object.values(value)) {
            if (isRecord(child)) assertSupportedSchema(child);
        }
    };
    visitMap(schema.properties);
    visitMap(schema.definitions);

    if (schema.items !== undefined) {
        if (!isRecord(schema.items))
            throw new Error('unsupported schema construct: items');
        assertSupportedSchema(schema.items);
    }
    if (schema.oneOf !== undefined) {
        if (
            !Array.isArray(schema.oneOf) ||
            schema.oneOf.some((entry) => !isRecord(entry))
        ) {
            throw new Error('unsupported schema construct: oneOf');
        }
        for (const child of schema.oneOf)
            assertSupportedSchema(child as Schema);
    }
    if (
        schema.additionalProperties !== undefined &&
        schema.additionalProperties !== false
    ) {
        if (!isRecord(schema.additionalProperties)) {
            throw new Error(
                'unsupported schema construct: additionalProperties',
            );
        }
        assertSupportedSchema(schema.additionalProperties);
    }
}

function valueType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
    return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
    switch (type) {
        case 'object':
            return isRecord(value);
        case 'array':
            return Array.isArray(value);
        case 'integer':
            return typeof value === 'number' && Number.isInteger(value);
        case 'number':
            return typeof value === 'number';
        case 'null':
            return value === null;
        default:
            return typeof value === type;
    }
}

function childPath(parent: string, key: string): string {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
        return parent === '$' ? key : `${parent}.${key}`;
    }
    return `${parent === '$' ? '' : parent}[${JSON.stringify(key)}]`;
}

function display(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
}

function resolveRef(ref: unknown, rootSchema: Schema): Schema {
    if (typeof ref !== 'string')
        throw new Error('unsupported schema construct: $ref');
    const match = ref.match(/^#\/definitions\/([^/]+)$/);
    if (!match) throw new Error(`unsupported schema construct: $ref ${ref}`);
    const definitions = rootSchema.definitions;
    const resolved = isRecord(definitions) ? definitions[match[1]] : undefined;
    if (!isRecord(resolved))
        throw new Error(`unresolved schema reference: ${ref}`);
    return resolved;
}

function validateNode(
    data: unknown,
    schema: Schema,
    rootSchema: Schema,
    path: string,
): string[] {
    if (schema.$ref !== undefined) {
        return validateNode(
            data,
            resolveRef(schema.$ref, rootSchema),
            rootSchema,
            path,
        );
    }

    const errors: string[] = [];
    if (schema.oneOf !== undefined) {
        const matches = (schema.oneOf as Schema[]).filter(
            (candidate) =>
                validateNode(data, candidate, rootSchema, path).length === 0,
        ).length;
        if (matches !== 1) {
            errors.push(
                `${path}: value must match exactly one oneOf schema (matched ${matches})`,
            );
        }
    }

    if (schema.type !== undefined) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!(types as string[]).some((type) => matchesType(data, type))) {
            errors.push(
                `${path}: expected type ${(types as string[]).join('|')}, got ${valueType(data)}`,
            );
            return errors;
        }
    }

    if ('const' in schema && !Object.is(data, schema.const)) {
        errors.push(
            `${path}: value ${display(data)} does not equal const ${display(schema.const)}`,
        );
    }
    if (
        Array.isArray(schema.enum) &&
        !schema.enum.some((entry) => Object.is(data, entry))
    ) {
        errors.push(
            `${path}: value ${display(data)} not in enum ${display(schema.enum)}`,
        );
    }
    if (
        typeof data === 'number' &&
        typeof schema.minimum === 'number' &&
        data < schema.minimum
    ) {
        errors.push(
            `${path}: value ${data} is less than minimum ${schema.minimum}`,
        );
    }

    if (isRecord(data)) {
        const properties = isRecord(schema.properties) ? schema.properties : {};
        if (Array.isArray(schema.required)) {
            for (const key of schema.required) {
                if (
                    typeof key === 'string' &&
                    !Object.prototype.hasOwnProperty.call(data, key)
                ) {
                    errors.push(
                        `${childPath(path, key)}: required property missing`,
                    );
                }
            }
        }
        for (const [key, value] of Object.entries(data)) {
            const propertySchema = properties[key];
            if (isRecord(propertySchema)) {
                errors.push(
                    ...validateNode(
                        value,
                        propertySchema,
                        rootSchema,
                        childPath(path, key),
                    ),
                );
            } else if (schema.additionalProperties === false) {
                errors.push(
                    `${childPath(path, key)}: additional property not allowed`,
                );
            } else if (isRecord(schema.additionalProperties)) {
                errors.push(
                    ...validateNode(
                        value,
                        schema.additionalProperties,
                        rootSchema,
                        childPath(path, key),
                    ),
                );
            }
        }
    }

    if (Array.isArray(data) && isRecord(schema.items)) {
        data.forEach((item, index) => {
            errors.push(
                ...validateNode(
                    item,
                    schema.items as Schema,
                    rootSchema,
                    `${path}[${index}]`,
                ),
            );
        });
    }

    return errors;
}

export function validateAgainstSchema(
    data: unknown,
    schema: Record<string, unknown>,
    rootSchema: Record<string, unknown> = schema,
): string[] {
    assertSupportedSchema(rootSchema);
    if (schema !== rootSchema) assertSupportedSchema(schema);
    return validateNode(data, schema, rootSchema, '$');
}
