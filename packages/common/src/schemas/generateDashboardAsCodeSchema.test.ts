import {
    buildDashboardAsCodeSchema,
    convertOpenApiToDraft07,
} from './generateDashboardAsCodeSchema';

describe('generateDashboardAsCodeSchema', () => {
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

    test('buildDashboardAsCodeSchema applies compatibility overlays', () => {
        const swagger = {
            components: {
                schemas: {
                    DashboardAsCode: {
                        allOf: [
                            {
                                type: 'object',
                                required: ['name', 'version', 'tiles'],
                                properties: {
                                    name: {
                                        type: 'string',
                                    },
                                    version: {
                                        type: 'number',
                                    },
                                    tiles: {
                                        type: 'array',
                                        items: {
                                            $ref: '#/components/schemas/DashboardTileAsCode',
                                        },
                                    },
                                    verification: {
                                        allOf: [
                                            {
                                                $ref: '#/components/schemas/ContentVerificationInfo',
                                            },
                                        ],
                                        nullable: true,
                                    },
                                },
                            },
                        ],
                    },
                    DashboardTileAsCode: {
                        anyOf: [
                            {
                                $ref: '#/components/schemas/DashboardChartTileAsCode',
                            },
                            {
                                $ref: '#/components/schemas/DashboardMarkdownTileAsCode',
                            },
                        ],
                    },
                    DashboardChartTileAsCode: {
                        allOf: [
                            {
                                type: 'object',
                                properties: {
                                    type: {
                                        enum: ['saved_chart'],
                                        type: 'string',
                                    },
                                    properties: {
                                        type: 'object',
                                        required: ['chartSlug'],
                                        properties: {
                                            chartSlug: {
                                                type: 'string',
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                    DashboardMarkdownTileAsCode: {
                        type: 'object',
                        properties: {
                            type: {
                                enum: ['markdown'],
                                type: 'string',
                            },
                        },
                    },
                    ContentVerificationInfo: {
                        type: 'object',
                        properties: {
                            verifiedAt: {
                                type: 'string',
                                format: 'date-time',
                            },
                        },
                    },
                },
            },
        };

        const schema = buildDashboardAsCodeSchema(swagger);

        expect(schema.additionalProperties).toBe(false);
        expect(
            (schema.properties as { [key: string]: unknown }).version,
        ).toMatchObject({
            type: 'number',
            const: 1,
        });
        expect(schema.$defs).toHaveProperty('DashboardTileAsCode');
        expect(schema.$defs).toHaveProperty('DashboardChartTileAsCode');
        expect(schema.$defs).toHaveProperty('DashboardMarkdownTileAsCode');
        expect(schema.$defs).toHaveProperty('ContentVerificationInfo');
        expect(
            (
                schema.$defs as {
                    DashboardChartTileAsCode: unknown;
                }
            ).DashboardChartTileAsCode,
        ).toMatchObject({
            allOf: [
                {
                    properties: {
                        properties: {
                            properties: {
                                chartSlug: {
                                    type: 'string',
                                },
                            },
                            required: ['chartSlug'],
                        },
                    },
                },
            ],
        });
    });
});
