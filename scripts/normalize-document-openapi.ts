import { readFileSync, writeFileSync } from 'node:fs';

export type JsonObject = Record<string, unknown>;

const COMPONENT_PREFIX = '#/components/schemas/';
const UNSUPPORTED_REF = '#/components/schemas/DataAppVizChartConfigAsCode';

const object = (value: unknown, message: string): JsonObject => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(message);
    }
    return value as JsonObject;
};

const component = (schemas: JsonObject, ref: unknown, message: string) => {
    if (typeof ref !== 'string' || !ref.startsWith(COMPONENT_PREFIX)) {
        throw new Error(message);
    }
    return object(schemas[ref.slice(COMPONENT_PREFIX.length)], message);
};

const referenceOnly = (value: JsonObject, message: string): string => {
    if (Object.keys(value).length !== 1 || typeof value.$ref !== 'string') {
        throw new Error(message);
    }
    return value.$ref;
};

const variants = (schema: JsonObject, message: string) => {
    if (!Array.isArray(schema.anyOf)) throw new Error(message);
    return schema.anyOf.map((variant) => object(variant, message));
};

const chartVariant = (
    document: JsonObject,
    source: 'semantic' | 'merge',
): JsonObject => {
    const variant = variants(
        document,
        'Unexpected DocumentChartContent schema: expected semantic and merge variants',
    ).find((entry) => {
        const sourceSchema = object(
            object(entry.properties, 'Unexpected DocumentChartContent schema')
                .source,
            'Unexpected DocumentChartContent schema',
        );
        return (
            Array.isArray(sourceSchema.enum) &&
            sourceSchema.enum.length === 1 &&
            sourceSchema.enum[0] === source
        );
    });
    if (!variant) {
        throw new Error(
            `Unexpected DocumentChartContent schema: missing ${source} variant`,
        );
    }
    return variant;
};

const cloneSemantic = (chart: JsonObject, schemas: JsonObject): JsonObject => {
    const semantic = component(
        schemas,
        referenceOnly(
            chart,
            'Unexpected Document chart schema: semantic chart ref wrapper',
        ),
        'Unexpected Document chart schema: semantic chart ref',
    );
    const shape = component(
        schemas,
        referenceOnly(
            semantic,
            'Unexpected Document chart schema: semantic chart shape wrapper',
        ),
        'Unexpected Document chart schema: semantic chart shape ref',
    );
    const properties = object(
        shape.properties,
        'Unexpected Document chart schema: semantic chart properties',
    );
    const config = component(
        schemas,
        referenceOnly(
            object(
                properties.chartConfig,
                'Unexpected Document chart schema: chartConfig',
            ),
            'Unexpected Document chart schema: chartConfig ref wrapper',
        ),
        'Unexpected Document chart schema: chartConfig ref',
    );
    const configVariants = variants(
        config,
        'Unexpected Document chart schema: chartConfig anyOf',
    );
    const supported = configVariants.filter(
        (variant) => variant.$ref !== UNSUPPORTED_REF,
    );

    if (supported.length === configVariants.length) return chart;
    if (supported.length !== configVariants.length - 1) {
        throw new Error(
            'Unexpected Document chart schema: duplicate DataAppVizChartConfigAsCode',
        );
    }

    return {
        allOf: [
            {
                ...shape,
                properties: {
                    ...properties,
                    chartConfig: { ...config, anyOf: supported },
                },
            },
        ],
    };
};

const cloneMerge = (chart: JsonObject, schemas: JsonObject): JsonObject => {
    const merge = component(
        schemas,
        referenceOnly(
            chart,
            'Unexpected Document chart schema: merge chart ref wrapper',
        ),
        'Unexpected Document chart schema: merge chart ref',
    );
    if (!Array.isArray(merge.allOf) || merge.allOf.length === 0) {
        throw new Error('Unexpected Document chart schema: merge chart allOf');
    }
    const semantic = object(
        merge.allOf[0],
        'Unexpected Document chart schema: merge semantic base',
    );
    referenceOnly(
        semantic,
        'Unexpected Document chart schema: merge semantic base wrapper',
    );
    const normalizedSemantic = cloneSemantic(semantic, schemas);
    return normalizedSemantic === semantic
        ? chart
        : { ...merge, allOf: [normalizedSemantic, ...merge.allOf.slice(1)] };
};

/**
 * Returns a non-mutating, Document-only normalization for REST API comparison.
 * Data app viz chart-as-code stays present in every shared saved-chart schema.
 */
export const normalizeDocumentOpenApi = (spec: JsonObject): JsonObject => {
    if (typeof spec.components !== 'object' || spec.components === null) {
        return { ...spec };
    }
    const components = spec.components as JsonObject;
    if (typeof components.schemas !== 'object' || components.schemas === null) {
        return { ...spec };
    }
    const schemas = components.schemas as JsonObject;
    if (!schemas.DocumentChartContent) return { ...spec };

    const document = object(
        schemas.DocumentChartContent,
        'Unexpected DocumentChartContent schema',
    );
    const semanticVariant = chartVariant(document, 'semantic');
    const mergeVariant = chartVariant(document, 'merge');
    const semanticChart = object(
        object(
            semanticVariant.properties,
            'Unexpected DocumentChartContent schema',
        ).chart,
        'Unexpected DocumentChartContent schema',
    );
    const mergeChart = object(
        object(
            mergeVariant.properties,
            'Unexpected DocumentChartContent schema',
        ).chart,
        'Unexpected DocumentChartContent schema',
    );

    if (semanticChart.$ref === undefined && mergeChart.$ref === undefined) {
        return { ...spec };
    }
    if (semanticChart.$ref === undefined || mergeChart.$ref === undefined) {
        throw new Error(
            'Unexpected DocumentChartContent schema: mixed variants',
        );
    }

    const semantic = cloneSemantic(semanticChart, schemas);
    const merge = cloneMerge(mergeChart, schemas);
    if (semantic === semanticChart && merge === mergeChart) return { ...spec };

    const replaceChart = (variant: JsonObject, chart: JsonObject) => ({
        ...variant,
        properties: {
            ...object(
                variant.properties,
                'Unexpected DocumentChartContent schema',
            ),
            chart,
        },
    });
    return {
        ...spec,
        components: {
            ...components,
            schemas: {
                ...schemas,
                DocumentChartContent: {
                    ...document,
                    anyOf: variants(
                        document,
                        'Unexpected DocumentChartContent schema',
                    ).map((variant) =>
                        variant === semanticVariant
                            ? replaceChart(variant, semantic)
                            : variant === mergeVariant
                              ? replaceChart(variant, merge)
                              : variant,
                    ),
                },
            },
        },
    };
};

const main = () => {
    const [input, output] = process.argv.slice(2);
    if (input === '--help' || input === '-h') {
        console.log(
            'Usage: tsx scripts/normalize-document-openapi.ts <input.json> <output.json>',
        );
        return;
    }
    if (!input || !output)
        throw new Error('Expected <input.json> <output.json>');
    writeFileSync(
        output,
        `${JSON.stringify(
            normalizeDocumentOpenApi(
                object(
                    JSON.parse(readFileSync(input, 'utf8')),
                    'Expected JSON object',
                ),
            ),
            null,
            2,
        )}\n`,
    );
};

if (
    require.main === module ||
    process.argv[1]?.endsWith('normalize-document-openapi.ts') === true
) {
    main();
}
