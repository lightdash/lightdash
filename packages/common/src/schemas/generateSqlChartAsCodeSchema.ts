import fs from 'node:fs';
import path from 'node:path';
import {
    collectComponentRefs,
    convertOpenApiToDraft07,
    getRepoRoot,
    getSwaggerPath,
    resolveTopLevelAllOf,
    toStableJson,
    type JsonObject,
    type SwaggerDoc,
} from './generateChartAsCodeSchema';

const SQL_CHART_SCHEMA_NAME = 'SqlChartAsCode';

export const getOutputPath = (): string =>
    path.join(
        getRepoRoot(),
        'packages/common/src/schemas/json/sql-chart-as-code-1.0.json',
    );

const collectTransitiveRefs = (
    root: JsonObject,
    components: Record<string, JsonObject>,
): string[] => {
    const refsToVisit = [...collectComponentRefs(root)];
    const visited = new Set<string>();

    while (refsToVisit.length > 0) {
        const schemaName = refsToVisit.pop();
        if (schemaName && !visited.has(schemaName)) {
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

    return [...visited].sort((left, right) => left.localeCompare(right));
};

export const buildSqlChartAsCodeSchema = (swagger: SwaggerDoc): JsonObject => {
    const components = swagger.components?.schemas;
    if (!components) {
        throw new Error('Missing `components.schemas` in swagger document');
    }

    const sqlChartSchema = components[SQL_CHART_SCHEMA_NAME];
    if (!sqlChartSchema) {
        throw new Error(
            `Missing \`components.schemas.${SQL_CHART_SCHEMA_NAME}\` in swagger document`,
        );
    }

    const rootSchema = resolveTopLevelAllOf(sqlChartSchema, components);
    const defs = collectTransitiveRefs(rootSchema, components).reduce<
        Record<string, JsonObject>
    >((acc, schemaName) => {
        acc[schemaName] = convertOpenApiToDraft07(
            components[schemaName],
        ) as JsonObject;
        return acc;
    }, {});

    const convertedRoot = convertOpenApiToDraft07(rootSchema) as JsonObject;
    const rootProperties = { ...(convertedRoot.properties as JsonObject) };
    if (rootProperties.version) {
        rootProperties.version = {
            ...(rootProperties.version as JsonObject),
            const: 1,
        };
    }

    return {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://schemas.lightdash.com/lightdash/sql-chart-as-code.json',
        title: 'Lightdash SQL Chart as Code',
        description:
            'Schema for defining Lightdash SQL charts in YAML format for version control',
        ...convertedRoot,
        properties: rootProperties,
        additionalProperties: false,
        $defs: defs,
    };
};

const run = (): void => {
    const checkMode = process.argv.includes('--check');
    const outputPath = getOutputPath();

    const swagger = JSON.parse(
        fs.readFileSync(getSwaggerPath(), 'utf8'),
    ) as SwaggerDoc;
    const nextContent = toStableJson(buildSqlChartAsCodeSchema(swagger));

    if (checkMode) {
        const currentContent = toStableJson(
            JSON.parse(fs.readFileSync(outputPath, 'utf8')) as JsonObject,
        );
        if (currentContent !== nextContent) {
            // eslint-disable-next-line no-console
            console.error(
                'sql-chart-as-code schema is out of date. Run `pnpm generate:sql-chart-as-code-schema`.',
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
