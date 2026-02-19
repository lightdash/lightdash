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
const CHART_SCHEMA_NAME = 'ChartAsCode';

export const getRepoRoot = (): string =>
    path.resolve(__dirname, '../../../../');

export const getSwaggerPath = (): string =>
    path.join(getRepoRoot(), 'packages/backend/src/generated/swagger.json');

export const getOutputPath = (): string =>
    path.join(
        getRepoRoot(),
        'packages/common/src/schemas/json/chart-as-code-1.0.json',
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

    // Follow transitive $refs (e.g. Omit<X> → $ref → Pick<X> → properties)
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

const getConstStringValue = (
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

const withConstType = (
    variantSchema: JsonObject,
    typeConst: string,
): JsonObject | null => {
    const variantObject = toObject(variantSchema);
    const properties = toObject(variantObject.properties);

    if (Object.keys(properties).length === 0) {
        return null;
    }

    const required = Array.isArray(variantObject.required)
        ? (variantObject.required as JsonValue[]).map((value) => String(value))
        : [];

    const existingType = toObject(properties.type);
    return {
        ...variantObject,
        properties: {
            ...properties,
            type: {
                ...(existingType.description
                    ? { description: existingType.description }
                    : {}),
                const: typeConst,
            },
        },
        required: unique(['type', ...required]),
    };
};

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

const tryBuildDiscriminatedChartConfig = (
    components: Record<string, JsonObject>,
): JsonObject | null => {
    const chartConfigSchema = components.ChartConfig;
    if (!chartConfigSchema) {
        return null;
    }

    let members: JsonValue[] = [];
    if (Array.isArray(chartConfigSchema.anyOf)) {
        members = chartConfigSchema.anyOf;
    } else if (Array.isArray(chartConfigSchema.oneOf)) {
        members = chartConfigSchema.oneOf;
    }

    if (members.length === 0) {
        return null;
    }

    const transformedMembers: JsonObject[] = [];

    for (const member of members) {
        const memberObject =
            member && typeof member === 'object' && !Array.isArray(member)
                ? (member as JsonObject)
                : {};

        const resolvedMember = memberObject.$ref
            ? resolveComponentRef(String(memberObject.$ref), components)
            : memberObject;

        const flattenedMember = resolveTopLevelAllOf(
            resolvedMember,
            components,
        );
        const flattenedProperties = toObject(flattenedMember.properties);
        const typeSchema = toObject(flattenedProperties.type);
        const typeConst = getConstStringValue(typeSchema, components);

        if (!typeConst) {
            return null;
        }

        const convertedMember = convertOpenApiToDraft07(
            flattenedMember,
        ) as JsonObject;
        const typedMember = withConstType(convertedMember, typeConst);
        if (!typedMember) {
            return null;
        }

        transformedMembers.push(typedMember);
    }

    return {
        type: 'object',
        oneOf: transformedMembers,
        discriminator: {
            propertyName: 'type',
        },
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

const overlayCompatibilityRules = (schema: JsonObject): JsonObject => {
    const root = { ...schema };
    const rootProperties = toObject(root.properties);

    if (rootProperties.version) {
        rootProperties.version = {
            ...toObject(rootProperties.version),
            const: 1,
        };
    }

    if (rootProperties.dashboardSlug) {
        const existing = toObject(rootProperties.dashboardSlug);
        rootProperties.dashboardSlug = {
            ...(existing.description
                ? { description: existing.description }
                : {}),
            oneOf: [
                {
                    type: 'string',
                    pattern: '^[a-z0-9-]+$',
                },
                {
                    type: 'null',
                },
            ],
        };
    }

    root.properties = rootProperties;
    root.additionalProperties = false;
    return root;
};

const maybeOverlayDiscriminatedChartConfig = (
    schema: JsonObject,
    components: Record<string, JsonObject>,
): JsonObject => {
    const root = { ...schema };
    const rootProperties = toObject(root.properties);

    if (!rootProperties.chartConfig) {
        return root;
    }

    const discriminated = tryBuildDiscriminatedChartConfig(components);
    if (!discriminated) {
        return root;
    }

    const existingChartConfig = toObject(rootProperties.chartConfig);
    rootProperties.chartConfig = {
        ...(existingChartConfig.description
            ? { description: existingChartConfig.description }
            : {}),
        ...discriminated,
    };
    root.properties = rootProperties;
    return root;
};

const recoverNestedDescriptions = (
    schema: JsonObject,
    components: Record<string, JsonObject>,
): JsonObject => {
    const savedChart = components.SavedChart;
    if (!savedChart) {
        return schema;
    }

    const sourceProperties = toObject(savedChart.properties);
    const root = { ...schema };
    const rootProperties = toObject(root.properties);

    for (const [propName, propValue] of Object.entries(rootProperties)) {
        const rootProp = toObject(propValue);
        const sourceProp = toObject(sourceProperties[propName]);

        if (rootProp.properties && sourceProp.properties) {
            const rootSubProperties = toObject(rootProp.properties);
            const sourceSubProperties = toObject(sourceProp.properties);
            let changed = false;

            for (const [subName, subValue] of Object.entries(
                rootSubProperties,
            )) {
                const rootSub = toObject(subValue);
                const sourceSub = toObject(sourceSubProperties[subName]);

                if (!rootSub.description && sourceSub.description) {
                    rootSubProperties[subName] = {
                        ...rootSub,
                        description: sourceSub.description,
                    };
                    changed = true;
                }
            }

            if (changed) {
                rootProperties[propName] = {
                    ...rootProp,
                    properties: rootSubProperties,
                };
            }
        }
    }

    root.properties = rootProperties;
    return root;
};

export const buildChartAsCodeSchema = (swagger: SwaggerDoc): JsonObject => {
    const components = swagger.components?.schemas;
    if (!components) {
        throw new Error('Missing `components.schemas` in swagger document');
    }

    const chartSchema = components[CHART_SCHEMA_NAME];
    if (!chartSchema) {
        throw new Error(
            `Missing \`components.schemas.${CHART_SCHEMA_NAME}\` in swagger document`,
        );
    }

    const rootSchema = resolveTopLevelAllOf(chartSchema, components);
    const refsToVisit = [...collectComponentRefs(rootSchema)];
    const visited = new Set<string>();

    while (refsToVisit.length > 0) {
        const schemaName = refsToVisit.pop();
        if (!schemaName || visited.has(schemaName)) {
            // no-op
        } else {
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
    }

    const defs = [...visited]
        .sort((left, right) => left.localeCompare(right))
        .reduce<Record<string, JsonObject>>((acc, schemaName) => {
            acc[schemaName] = convertOpenApiToDraft07(
                components[schemaName],
            ) as JsonObject;
            return acc;
        }, {});

    const rootWithDescriptions = recoverNestedDescriptions(
        rootSchema,
        components,
    );
    const convertedRoot = convertOpenApiToDraft07(
        rootWithDescriptions,
    ) as JsonObject;
    const rootWithCompatibility = overlayCompatibilityRules(convertedRoot);
    const rootWithChartConfig = maybeOverlayDiscriminatedChartConfig(
        rootWithCompatibility,
        components,
    );

    return {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://schemas.lightdash.com/lightdash/chart-as-code.json',
        title: 'Lightdash Chart as Code',
        description:
            'Schema for defining Lightdash charts in YAML format for version control',
        ...rootWithChartConfig,
        $defs: defs,
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
    const generatedSchema = buildChartAsCodeSchema(swagger);
    const nextContent = toStableJson(generatedSchema);

    if (checkMode) {
        const currentContent = fs.readFileSync(outputPath, 'utf8');
        if (currentContent !== nextContent) {
            console.error(
                'chart-as-code schema is out of date. Run `pnpm generate:chart-as-code-schema`.',
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
