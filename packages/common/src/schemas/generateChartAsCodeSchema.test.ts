import {
    buildChartAsCodeSchema,
    convertOpenApiToDraft07,
} from './generateChartAsCodeSchema';

describe('generateChartAsCodeSchema', () => {
    test('convertOpenApiToDraft07 rewrites refs and nullable type fields', () => {
        const input = {
            type: 'object',
            properties: {
                foo: {
                    nullable: true,
                    type: 'string',
                },
                bar: {
                    $ref: '#/components/schemas/SomeType',
                },
            },
        };

        const result = convertOpenApiToDraft07(input);

        expect(result).toEqual({
            type: 'object',
            properties: {
                foo: {
                    type: ['string', 'null'],
                },
                bar: {
                    $ref: '#/$defs/SomeType',
                },
            },
        });
    });

    test('convertOpenApiToDraft07 wraps nullable combinator schemas in anyOf', () => {
        const input = {
            nullable: true,
            allOf: [{ $ref: '#/components/schemas/AnotherType' }],
        };

        const result = convertOpenApiToDraft07(input);

        expect(result).toEqual({
            anyOf: [
                {
                    allOf: [{ $ref: '#/$defs/AnotherType' }],
                },
                {
                    type: 'null',
                },
            ],
        });
    });

    test('buildChartAsCodeSchema applies compatibility overlays and discriminator chartConfig', () => {
        const swagger = {
            components: {
                schemas: {
                    ChartAsCode: {
                        allOf: [
                            {
                                type: 'object',
                                required: [
                                    'name',
                                    'slug',
                                    'spaceSlug',
                                    'tableName',
                                    'tableConfig',
                                    'metricQuery',
                                    'chartConfig',
                                    'updatedAt',
                                    'version',
                                ],
                                properties: {
                                    version: {
                                        type: 'number',
                                    },
                                    dashboardSlug: {
                                        nullable: true,
                                        type: 'string',
                                    },
                                    chartConfig: {
                                        $ref: '#/components/schemas/ChartConfig',
                                    },
                                },
                            },
                        ],
                    },
                    ChartConfig: {
                        anyOf: [
                            {
                                $ref: '#/components/schemas/BigNumberConfig',
                            },
                        ],
                    },
                    ChartTypeBigNumber: {
                        type: 'string',
                        enum: ['big_number'],
                    },
                    BigNumberOptions: {
                        type: 'object',
                        properties: {
                            showComparison: { type: 'boolean' },
                        },
                    },
                    BigNumberConfig: {
                        allOf: [
                            {
                                type: 'object',
                                required: ['type'],
                                properties: {
                                    type: {
                                        $ref: '#/components/schemas/ChartTypeBigNumber',
                                    },
                                    config: {
                                        $ref: '#/components/schemas/BigNumberOptions',
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        };

        const schema = buildChartAsCodeSchema(swagger);

        expect(schema.additionalProperties).toBe(false);

        expect(
            (schema.properties as { [key: string]: unknown }).version,
        ).toMatchObject({
            type: 'number',
            const: 1,
        });

        expect(
            (schema.properties as { [key: string]: unknown }).dashboardSlug,
        ).toEqual({
            oneOf: [
                { type: 'string', pattern: '^[a-z0-9-]+$' },
                { type: 'null' },
            ],
        });

        const chartConfig = (schema.properties as { [key: string]: any })
            .chartConfig;
        expect(chartConfig.discriminator).toEqual({ propertyName: 'type' });
        expect(chartConfig.oneOf).toHaveLength(1);
        expect(chartConfig.oneOf[0].properties.type).toEqual({
            const: 'big_number',
        });
        expect(chartConfig.oneOf[0].required).toContain('type');
    });

    test('buildChartAsCodeSchema falls back to plain chartConfig ref when discriminator is unsafe', () => {
        const swagger = {
            components: {
                schemas: {
                    ChartAsCode: {
                        allOf: [
                            {
                                type: 'object',
                                properties: {
                                    chartConfig: {
                                        $ref: '#/components/schemas/ChartConfig',
                                    },
                                },
                            },
                        ],
                    },
                    ChartConfig: {
                        anyOf: [
                            {
                                type: 'object',
                                properties: {
                                    config: {
                                        type: 'object',
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        };

        const schema = buildChartAsCodeSchema(swagger);

        expect(
            (schema.properties as { [key: string]: any }).chartConfig,
        ).toEqual({
            $ref: '#/$defs/ChartConfig',
        });
    });
});
