import fs from 'node:fs';
import path from 'node:path';

type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

type JsonObject = { [key: string]: JsonValue };

type SwaggerDoc = {
    components?: {
        schemas?: Record<string, JsonObject>;
    };
};

const SCHEMA_REF_PREFIX = '#/components/schemas/';
const DEFS_REF_PREFIX = '#/$defs/';
const DASHBOARD_SCHEMA_NAME = 'DashboardAsCode';

export const getRepoRoot = (): string =>
    path.resolve(__dirname, '../../../../');

export const getSwaggerPath = (): string =>
    path.join(getRepoRoot(), 'packages/backend/src/generated/swagger.json');

export const getOutputPath = (): string =>
    path.join(
        getRepoRoot(),
        'packages/common/src/schemas/json/dashboard-as-code-1.0.json',
    );

const toObject = (value: JsonValue | undefined): JsonObject =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as JsonObject)
        : {};

const unique = <T>(values: T[]): T[] => [...new Set(values)];

const mergeObjectSchemas = (
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

const resolveComponentRef = (
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

const resolveTopLevelAllOf = (
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

const collectComponentRefs = (
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

const sortKeysDeep = (value: JsonValue): JsonValue => {
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

const resolveDefRef = (
    ref: string,
    defs: Record<string, JsonObject>,
    depth = 0,
): JsonObject => {
    if (depth > 10) {
        throw new Error(`Max $defs $ref resolution depth exceeded at: ${ref}`);
    }
    if (!ref.startsWith(DEFS_REF_PREFIX)) {
        throw new Error(`Unsupported $defs $ref format: ${ref}`);
    }

    const schemaName = ref.slice(DEFS_REF_PREFIX.length);
    const schema = defs[schemaName];
    if (!schema) {
        throw new Error(`Missing $defs schema: ${schemaName}`);
    }

    if (typeof schema.$ref === 'string') {
        return resolveDefRef(schema.$ref, defs, depth + 1);
    }

    return schema;
};

const flattenObjectSchema = (
    schema: JsonObject,
    defs: Record<string, JsonObject>,
): JsonObject => {
    const resolvedSchema =
        typeof schema.$ref === 'string'
            ? resolveDefRef(schema.$ref, defs)
            : schema;

    if (!Array.isArray(resolvedSchema.allOf)) {
        return resolvedSchema;
    }

    return resolvedSchema.allOf.reduce<JsonObject>((acc, part) => {
        const partObject =
            part && typeof part === 'object' && !Array.isArray(part)
                ? (part as JsonObject)
                : {};
        const resolvedPart =
            typeof partObject.$ref === 'string'
                ? resolveDefRef(partObject.$ref, defs)
                : partObject;
        return mergeObjectSchemas(acc, flattenObjectSchema(resolvedPart, defs));
    }, {});
};

const applyDashboardTileCompatibilityRules = (
    defs: Record<string, JsonObject>,
): Record<string, JsonObject> => {
    const nextDefs = { ...defs };
    const tileUnion = nextDefs.DashboardTileAsCode;
    if (!tileUnion || !Array.isArray(tileUnion.anyOf)) {
        return nextDefs;
    }

    tileUnion.anyOf.forEach((member) => {
        const memberObject =
            member && typeof member === 'object' && !Array.isArray(member)
                ? (member as JsonObject)
                : {};
        if (typeof memberObject.$ref !== 'string') {
            return;
        }

        const schemaName = memberObject.$ref.slice(DEFS_REF_PREFIX.length);
        const variant = nextDefs[schemaName];
        if (!variant) {
            return;
        }

        const flattenedVariant = flattenObjectSchema(variant, nextDefs);
        const variantProperties = toObject(flattenedVariant.properties);

        const tilePropertiesSchema = flattenObjectSchema(
            toObject(variantProperties.properties),
            nextDefs,
        );
        tilePropertiesSchema.additionalProperties = false;
        variantProperties.properties = tilePropertiesSchema;

        nextDefs[schemaName] = {
            ...flattenedVariant,
            additionalProperties: false,
            properties: variantProperties,
        };
    });

    return nextDefs;
};

const applyDashboardTabCompatibilityRules = (
    defs: Record<string, JsonObject>,
): Record<string, JsonObject> => {
    const nextDefs = { ...defs };
    ['DashboardTab', 'DashboardTabAsCode'].forEach((schemaName) => {
        const dashboardTab = nextDefs[schemaName];
        if (!dashboardTab) {
            return;
        }

        nextDefs[schemaName] = {
            ...dashboardTab,
            additionalProperties: false,
        };
    });

    return nextDefs;
};

const overlayCompatibilityRules = (
    schema: JsonObject,
    defs: Record<string, JsonObject>,
): { schema: JsonObject; defs: Record<string, JsonObject> } => {
    const root = { ...schema };
    const rootProperties = toObject(root.properties);

    if (rootProperties.version) {
        rootProperties.version = {
            ...toObject(rootProperties.version),
            const: 1,
        };
    }

    root.properties = rootProperties;
    root.additionalProperties = false;

    const defsWithStrictTiles = applyDashboardTileCompatibilityRules(defs);
    const defsWithCompatibility =
        applyDashboardTabCompatibilityRules(defsWithStrictTiles);

    return { schema: root, defs: defsWithCompatibility };
};

export const buildDashboardAsCodeSchema = (swagger: SwaggerDoc): JsonObject => {
    const components = swagger.components?.schemas;
    if (!components) {
        throw new Error('Missing `components.schemas` in swagger document');
    }

    const dashboardSchema = components[DASHBOARD_SCHEMA_NAME];
    if (!dashboardSchema) {
        throw new Error(
            `Missing \`components.schemas.${DASHBOARD_SCHEMA_NAME}\` in swagger document`,
        );
    }

    const rootSchema = resolveTopLevelAllOf(dashboardSchema, components);
    const refsToVisit = [...collectComponentRefs(rootSchema)];
    const visited = new Set<string>();

    while (refsToVisit.length > 0) {
        const schemaName = refsToVisit.pop();
        if (!schemaName || visited.has(schemaName)) {
            // eslint-disable-next-line no-continue
            continue;
        }

        visited.add(schemaName);

        const component = components[schemaName];
        if (!component) {
            throw new Error(
                `Missing referenced component schema: ${schemaName}`,
            );
        }

        collectComponentRefs(component).forEach((nestedRef) => {
            if (!visited.has(nestedRef)) refsToVisit.push(nestedRef);
        });
    }

    const defs = [...visited]
        .sort((left, right) => left.localeCompare(right))
        .reduce<Record<string, JsonObject>>((acc, schemaName) => {
            acc[schemaName] = convertOpenApiToDraft07(
                components[schemaName],
            ) as JsonObject;
            return acc;
        }, {});

    const convertedRoot = convertOpenApiToDraft07(rootSchema) as JsonObject;
    const { schema: rootWithCompatibility, defs: defsWithCompatibility } =
        overlayCompatibilityRules(convertedRoot, defs);

    return {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://schemas.lightdash.com/lightdash/dashboard-as-code.json',
        title: 'Lightdash Dashboard as Code',
        description:
            'Schema for defining Lightdash dashboards in YAML format for version control',
        ...rootWithCompatibility,
        $defs: defsWithCompatibility,
    };
};

const parseSwagger = (content: string): SwaggerDoc =>
    JSON.parse(content) as SwaggerDoc;

const toStableJson = (value: JsonObject): string =>
    `${JSON.stringify(sortKeysDeep(value), null, 4)}\n`;

const run = (): void => {
    const checkMode = process.argv.includes('--check');
    const swaggerPath = getSwaggerPath();
    const outputPath = getOutputPath();

    const swaggerContent = fs.readFileSync(swaggerPath, 'utf8');
    const swagger = parseSwagger(swaggerContent);
    const generatedSchema = buildDashboardAsCodeSchema(swagger);
    const nextContent = toStableJson(generatedSchema);

    if (checkMode) {
        const currentContent = fs.readFileSync(outputPath, 'utf8');
        const normalizedCurrentContent = toStableJson(
            JSON.parse(currentContent) as JsonObject,
        );
        if (normalizedCurrentContent !== nextContent) {
            console.error(
                'dashboard-as-code schema is out of date. Run `pnpm generate:dashboard-as-code-schema`.',
            );
            process.exit(1);
        }
        return;
    }

    fs.writeFileSync(outputPath, nextContent, 'utf8');
};

if (require.main === module) {
    run();
}
