import Ajv from 'ajv';
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
                                    tabs: {
                                        type: 'array',
                                        items: {
                                            $ref: '#/components/schemas/DashboardTabAsCode',
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
                                                nullable: true,
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
                    DashboardTabAsCode: {
                        type: 'object',
                        properties: {
                            uuid: {
                                type: 'string',
                            },
                            name: {
                                type: 'string',
                                minLength: 1,
                            },
                            order: {
                                type: 'number',
                                minimum: 0,
                            },
                            hidden: {
                                type: 'boolean',
                            },
                        },
                        required: ['uuid', 'name', 'order', 'hidden'],
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

        const schema = buildDashboardAsCodeSchema(
            swagger as unknown as Parameters<
                typeof buildDashboardAsCodeSchema
            >[0],
        );

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
        expect(schema.$defs).toHaveProperty('DashboardTabAsCode');
        expect(schema.$defs).toHaveProperty('ContentVerificationInfo');
        expect(
            (
                schema.$defs as {
                    DashboardChartTileAsCode: unknown;
                }
            ).DashboardChartTileAsCode,
        ).toMatchObject({
            additionalProperties: false,
            properties: {
                properties: {
                    additionalProperties: false,
                    properties: {
                        chartSlug: {
                            type: ['string', 'null'],
                        },
                    },
                    required: ['chartSlug'],
                },
            },
        });
        expect(
            (
                schema.$defs as {
                    DashboardTabAsCode: unknown;
                }
            ).DashboardTabAsCode,
        ).toMatchObject({
            additionalProperties: false,
        });
    });

    test('buildDashboardAsCodeSchema preserves strict dashboard slug and tile validation', () => {
        const swagger = {
            components: {
                schemas: {
                    DashboardAsCode: {
                        allOf: [
                            {
                                type: 'object',
                                required: [
                                    'name',
                                    'slug',
                                    'spaceSlug',
                                    'version',
                                    'tiles',
                                    'tabs',
                                ],
                                properties: {
                                    name: {
                                        type: 'string',
                                        minLength: 1,
                                    },
                                    slug: {
                                        type: 'string',
                                        pattern: '^[a-z0-9-]+$',
                                    },
                                    spaceSlug: {
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
                                    tabs: {
                                        type: 'array',
                                        items: {
                                            $ref: '#/components/schemas/DashboardTabAsCode',
                                        },
                                    },
                                },
                            },
                        ],
                    },
                    DashboardTileAsCode: {
                        anyOf: [
                            {
                                $ref: '#/components/schemas/DashboardHeadingTileAsCode',
                            },
                            {
                                $ref: '#/components/schemas/DashboardMarkdownTileAsCode',
                            },
                            {
                                $ref: '#/components/schemas/DashboardDataAppTileAsCode',
                            },
                        ],
                    },
                    DashboardHeadingTileAsCode: {
                        allOf: [
                            {
                                $ref: '#/components/schemas/DashboardTileAsCodeBase',
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: {
                                        enum: ['heading'],
                                        type: 'string',
                                    },
                                    properties: {
                                        type: 'object',
                                        properties: {
                                            text: {
                                                type: 'string',
                                            },
                                            showDivider: {
                                                type: 'boolean',
                                            },
                                        },
                                        required: ['text'],
                                    },
                                },
                                required: ['type', 'properties'],
                            },
                        ],
                    },
                    DashboardMarkdownTileAsCode: {
                        allOf: [
                            {
                                $ref: '#/components/schemas/DashboardTileAsCodeBase',
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: {
                                        enum: ['markdown'],
                                        type: 'string',
                                    },
                                    properties: {
                                        type: 'object',
                                        properties: {
                                            title: {
                                                type: 'string',
                                            },
                                            content: {
                                                type: 'string',
                                            },
                                            hideFrame: {
                                                type: 'boolean',
                                            },
                                        },
                                        required: ['title', 'content'],
                                    },
                                },
                                required: ['type', 'properties'],
                            },
                        ],
                    },
                    DashboardDataAppTileAsCode: {
                        allOf: [
                            {
                                $ref: '#/components/schemas/DashboardTileAsCodeBase',
                            },
                            {
                                type: 'object',
                                properties: {
                                    type: {
                                        enum: ['data_app'],
                                        type: 'string',
                                    },
                                    properties: {
                                        type: 'object',
                                        properties: {
                                            title: {
                                                type: 'string',
                                            },
                                            appUuid: {
                                                type: 'string',
                                            },
                                        },
                                        required: ['title', 'appUuid'],
                                    },
                                },
                                required: ['type', 'properties'],
                            },
                        ],
                    },
                    DashboardTileAsCodeBase: {
                        type: 'object',
                        required: ['type', 'x', 'y', 'h', 'w'],
                        properties: {
                            type: {
                                $ref: '#/components/schemas/DashboardTileTypes',
                            },
                            x: {
                                type: 'number',
                                minimum: 0,
                                maximum: 35,
                            },
                            y: {
                                type: 'number',
                                minimum: 0,
                            },
                            h: {
                                type: 'number',
                                minimum: 1,
                            },
                            w: {
                                type: 'number',
                                minimum: 1,
                                maximum: 36,
                            },
                            tabUuid: {
                                type: 'string',
                                nullable: true,
                            },
                            uuid: {
                                type: 'string',
                            },
                            tileSlug: {
                                type: 'string',
                            },
                        },
                    },
                    DashboardTabAsCode: {
                        type: 'object',
                        required: ['uuid', 'name', 'order', 'hidden'],
                        properties: {
                            uuid: {
                                type: 'string',
                            },
                            name: {
                                type: 'string',
                                minLength: 1,
                            },
                            order: {
                                type: 'number',
                                minimum: 0,
                            },
                            hidden: {
                                type: 'boolean',
                            },
                        },
                    },
                    DashboardTileTypes: {
                        enum: [
                            'saved_chart',
                            'sql_chart',
                            'markdown',
                            'loom',
                            'heading',
                            'data_app',
                        ],
                        type: 'string',
                    },
                },
            },
        };

        const schema = buildDashboardAsCodeSchema(
            swagger as unknown as Parameters<
                typeof buildDashboardAsCodeSchema
            >[0],
        );
        const ajv = new Ajv({ strict: false, validateFormats: false });
        const validate = ajv.compile(schema);

        expect(
            validate({
                name: 'Dashboard',
                slug: 'INVALID SLUG',
                spaceSlug: 'space',
                version: 1,
                tabs: [],
                tiles: [],
            }),
        ).toBe(false);

        expect(
            validate({
                name: 'Dashboard',
                slug: 'valid-slug',
                spaceSlug: 'space',
                version: 1,
                tabs: [],
                tiles: [
                    {
                        type: 'heading',
                        x: 999,
                        y: -1,
                        h: 0,
                        w: 999,
                        properties: {
                            text: 'Heading',
                        },
                    },
                ],
            }),
        ).toBe(false);

        expect(
            validate({
                name: 'Dashboard',
                slug: 'valid-slug',
                spaceSlug: 'space',
                version: 1,
                tabs: [],
                tiles: [
                    {
                        type: 'heading',
                        x: 0,
                        y: 0,
                        h: 2,
                        w: 36,
                        properties: {
                            text: 'Heading',
                            extra: true,
                        },
                    },
                ],
            }),
        ).toBe(false);

        expect(
            validate({
                name: 'Dashboard',
                slug: 'valid-slug',
                spaceSlug: 'space',
                version: 1,
                tabs: [],
                tiles: [
                    {
                        type: 'markdown',
                        x: 0,
                        y: 0,
                        h: 4,
                        w: 18,
                        properties: {
                            title: 'Welcome',
                            content: 'Hello',
                            hideFrame: false,
                        },
                    },
                    {
                        type: 'data_app',
                        x: 18,
                        y: 0,
                        h: 4,
                        w: 18,
                        properties: {
                            title: 'App',
                            appUuid: 'app-1',
                        },
                    },
                ],
            }),
        ).toBe(true);
    });
});
