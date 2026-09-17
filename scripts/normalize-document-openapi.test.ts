import assert from 'node:assert/strict';
import {
    normalizeDocumentOpenApi,
    type JsonObject,
} from './normalize-document-openapi';

const DATA_APP_VIZ_REF = '#/components/schemas/DataAppVizChartConfigAsCode';

const createSpec = (): JsonObject => ({
    openapi: '3.0.0',
    components: {
        schemas: {
            DocumentChartContent: {
                description: 'A genuine Document schema detail',
                anyOf: [
                    {
                        properties: {
                            chart: {
                                $ref: '#/components/schemas/SemanticChartAsCode',
                            },
                            source: { enum: ['semantic'] },
                        },
                    },
                    {
                        properties: {
                            chart: {
                                $ref: '#/components/schemas/MergeChartAsCode',
                            },
                            source: { enum: ['merge'] },
                        },
                    },
                ],
            },
            SemanticChartAsCode: {
                $ref: '#/components/schemas/DocumentChartShape',
            },
            MergeChartAsCode: {
                allOf: [
                    { $ref: '#/components/schemas/SemanticChartAsCode' },
                    { properties: { merge: { type: 'object' } } },
                ],
            },
            DocumentChartShape: {
                properties: {
                    chartConfig: {
                        $ref: '#/components/schemas/ChartAsCodeConfig',
                    },
                },
                required: ['chartConfig'],
            },
            ChartAsCodeConfig: {
                anyOf: [
                    { $ref: '#/components/schemas/TableChartConfig' },
                    { $ref: DATA_APP_VIZ_REF },
                ],
            },
            DataAppVizChartConfigAsCode: { type: 'object' },
            TableChartConfig: { type: 'object' },
            SavedChartConfig: {
                $ref: '#/components/schemas/ChartAsCodeConfig',
            },
        },
    },
});

const getDocumentVariant = (
    spec: JsonObject,
    source: 'semantic' | 'merge',
): JsonObject => {
    const schemas = (spec.components as JsonObject)
        .schemas as JsonObject as JsonObject;
    const document = schemas.DocumentChartContent as JsonObject;
    const variant = (document.anyOf as JsonObject[]).find(
        (entry) =>
            (
                ((entry.properties as JsonObject).source as JsonObject)
                    .enum as string[]
            )[0] === source,
    );
    assert.ok(variant);
    return variant;
};

const getNormalizedConfig = (
    spec: JsonObject,
    source: 'semantic' | 'merge',
): JsonObject => {
    const chart = (getDocumentVariant(spec, source).properties as JsonObject)
        .chart as JsonObject;
    const semantic =
        source === 'semantic' ? chart : (chart.allOf as JsonObject[])[0];
    const shape = (semantic.allOf as JsonObject[])[0];
    return (shape.properties as JsonObject).chartConfig as JsonObject;
};

{
    const spec = createSpec();
    const normalized = normalizeDocumentOpenApi(spec);
    const normalizedSchemas = (normalized.components as JsonObject)
        .schemas as JsonObject as JsonObject;
    const originalSchemas = (spec.components as JsonObject)
        .schemas as JsonObject as JsonObject;

    assert.notStrictEqual(normalized, spec);
    assert.deepEqual(
        (getNormalizedConfig(normalized, 'semantic').anyOf as JsonObject[]).map(
            (entry) => entry.$ref,
        ),
        ['#/components/schemas/TableChartConfig'],
    );
    assert.deepEqual(
        (getNormalizedConfig(normalized, 'merge').anyOf as JsonObject[]).map(
            (entry) => entry.$ref,
        ),
        ['#/components/schemas/TableChartConfig'],
    );
    assert.deepEqual(
        (normalizedSchemas.ChartAsCodeConfig as JsonObject).anyOf,
        (originalSchemas.ChartAsCodeConfig as JsonObject).anyOf,
    );
    assert.deepEqual(
        (normalizedSchemas.SavedChartConfig as JsonObject).$ref,
        '#/components/schemas/ChartAsCodeConfig',
    );
    assert.deepEqual(originalSchemas.ChartAsCodeConfig, {
        anyOf: [
            { $ref: '#/components/schemas/TableChartConfig' },
            { $ref: DATA_APP_VIZ_REF },
        ],
    });
    const { DocumentChartContent: originalDocument, ...otherOriginalSchemas } =
        originalSchemas;
    const {
        DocumentChartContent: normalizedDocument,
        ...otherNormalizedSchemas
    } = normalizedSchemas;
    assert.ok(originalDocument);
    assert.ok(normalizedDocument);
    assert.deepEqual(otherNormalizedSchemas, otherOriginalSchemas);
}

{
    const spec = createSpec();
    const normalized = normalizeDocumentOpenApi(spec);
    const document = (
        (normalized.components as JsonObject).schemas as JsonObject
    ).DocumentChartContent as JsonObject;

    assert.equal(document.description, 'A genuine Document schema detail');
    assert.deepEqual(normalizeDocumentOpenApi(normalized), normalized);
}

{
    const spec: JsonObject = {
        openapi: '3.0.0',
        components: { schemas: { ChartAsCodeConfig: { anyOf: [] } } },
    };
    const normalized = normalizeDocumentOpenApi(spec);

    assert.notStrictEqual(normalized, spec);
    assert.deepEqual(normalized, spec);
}

{
    const spec = createSpec();
    const schemas = (spec.components as JsonObject).schemas as JsonObject;
    (schemas.DocumentChartContent as JsonObject).anyOf = [
        {
            properties: {
                chart: { $ref: '#/components/schemas/UnexpectedChart' },
                source: { enum: ['semantic'] },
            },
        },
    ];

    assert.throws(
        () => normalizeDocumentOpenApi(spec),
        /Unexpected DocumentChartContent schema/,
    );
}

{
    const spec = createSpec();
    const semantic = getDocumentVariant(spec, 'semantic');
    ((semantic.properties as JsonObject).chart as JsonObject).required = [
        'preserve-me',
    ];

    assert.throws(
        () => normalizeDocumentOpenApi(spec),
        /semantic chart ref wrapper/,
    );
}

{
    const spec = createSpec();
    const schemas = (spec.components as JsonObject).schemas as JsonObject;
    const shape = schemas.DocumentChartShape as JsonObject;
    ((shape.properties as JsonObject).chartConfig as JsonObject).minProperties =
        1;

    assert.throws(
        () => normalizeDocumentOpenApi(spec),
        /chartConfig ref wrapper/,
    );
}

console.log('normalize-document-openapi tests passed');
