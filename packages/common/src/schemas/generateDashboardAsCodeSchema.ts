/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import {
    buildSchemaFromSwagger,
    convertOpenApiToDraft07,
    getRepoRoot,
    getSwaggerPath,
    parseSwagger,
    toObject,
    toStableJson,
    type JsonObject,
    type SwaggerDoc,
} from './schemaUtils';

const DASHBOARD_SCHEMA_NAME = 'DashboardAsCode';

const getOutputPath = (): string =>
    path.join(
        getRepoRoot(),
        'packages/common/src/schemas/json/dashboard-as-code-1.0.json',
    );

const overlayCompatibilityRules = (schema: JsonObject): JsonObject => {
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
    return root;
};

export const buildDashboardAsCodeSchema = (swagger: SwaggerDoc): JsonObject => {
    const { rootSchema, defs } = buildSchemaFromSwagger(
        swagger,
        DASHBOARD_SCHEMA_NAME,
    );

    const convertedRoot = convertOpenApiToDraft07(rootSchema) as JsonObject;
    const rootWithCompatibility = overlayCompatibilityRules(convertedRoot);

    return {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://schemas.lightdash.com/lightdash/dashboard-as-code.json',
        title: 'Lightdash Dashboard as Code',
        description:
            'Schema for defining Lightdash dashboards in YAML format for version control',
        ...rootWithCompatibility,
        ...(Object.keys(defs).length > 0 ? { $defs: defs } : {}),
    };
};

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
        if (currentContent !== nextContent) {
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
