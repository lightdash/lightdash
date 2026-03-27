/* eslint-disable no-console, @typescript-eslint/no-throw-literal */
import fs from 'node:fs';
import path from 'node:path';
import {
    buildSchemaFromSwagger,
    convertOpenApiToDraft07,
    getConstStringValue,
    getRepoRoot,
    getSwaggerPath,
    parseSwagger,
    resolveComponentRef,
    resolveTopLevelAllOf,
    toObject,
    toStableJson,
    unique,
    type JsonObject,
    type JsonValue,
    type SwaggerDoc,
} from './schemaUtils';

const CHART_SCHEMA_NAME = 'ChartAsCode';

export { getRepoRoot, getSwaggerPath };

export const getOutputPath = (): string =>
    path.join(
        getRepoRoot(),
        'packages/common/src/schemas/json/chart-as-code-1.0.json',
    );

export { convertOpenApiToDraft07 };

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

const makeOptionalPropertiesNullable = (schema: JsonObject): JsonObject => {
    const properties = toObject(schema.properties);
    const required = Array.isArray(schema.required)
        ? new Set((schema.required as JsonValue[]).map((v) => String(v)))
        : new Set<string>();

    const updatedProperties: JsonObject = {};
    for (const [key, value] of Object.entries(properties)) {
        if (!required.has(key) && value && typeof value === 'object') {
            updatedProperties[key] = {
                anyOf: [value, { type: 'null' }],
            };
        } else {
            updatedProperties[key] = value;
        }
    }

    return { ...schema, properties: updatedProperties };
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
        const nullableMember = makeOptionalPropertiesNullable(convertedMember);
        const typedMember = withConstType(nullableMember, typeConst);
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

    const { rootSchema, defs } = buildSchemaFromSwagger(
        swagger,
        CHART_SCHEMA_NAME,
    );

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
