import { DimensionType, FieldType } from '@lightdash/common';
import { getFindExplores } from '../tools/findExplores';
import { getFindFields } from '../tools/findFields';
import { getGetFields } from '../tools/getFields';
import { getSearchSemanticLayer } from '../tools/searchSemanticLayer';
import type { ToolOutputFormat } from '../tools/toolOutputFormat';

const longDescription = `Important business definition. ${'Use this field only for qualified revenue reporting. '.repeat(12)}`;

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    joinedTables: [{ table: 'customers' }],
    tables: {
        orders: {
            dimensions: {
                created_date: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    name: 'created_date',
                    label: 'Created date',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.created_date',
                    description: longDescription,
                    hidden: false,
                },
            },
            metrics: {
                total_revenue: {
                    fieldType: FieldType.METRIC,
                    type: 'sum',
                    name: 'total_revenue',
                    label: 'Total revenue',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.revenue',
                    description: longDescription,
                    hidden: false,
                },
            },
        },
        customers: {
            dimensions: {
                segment: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'segment',
                    label: 'Customer segment',
                    table: 'customers',
                    tableLabel: 'Customers',
                    sql: '${TABLE}.segment',
                    description: longDescription,
                    hidden: false,
                },
            },
            metrics: {},
        },
    },
};

const catalogFields = [
    {
        name: 'total_revenue',
        label: 'Total revenue',
        tableName: 'orders',
        fieldType: FieldType.METRIC,
        fieldValueType: 'sum',
        description: longDescription,
        searchRank: 0.95,
        chartUsage: 12,
        verifiedChartUsage: 3,
        aiHints: ['Canonical revenue metric'],
        categories: [],
        icon: null,
    },
    {
        name: 'created_date',
        label: 'Created date',
        tableName: 'orders',
        fieldType: FieldType.DIMENSION,
        fieldValueType: DimensionType.DATE,
        description: longDescription,
        searchRank: 0.82,
        chartUsage: 8,
        verifiedChartUsage: 2,
        aiHints: null,
        categories: [],
        icon: null,
    },
    {
        name: 'segment',
        label: 'Customer segment',
        tableName: 'customers',
        fieldType: FieldType.DIMENSION,
        fieldValueType: DimensionType.STRING,
        description: longDescription,
        searchRank: 0.63,
        chartUsage: 4,
        verifiedChartUsage: 0,
        aiHints: null,
        categories: [],
        icon: null,
    },
];

const roughTokens = (value: string) => Math.ceil(value.length / 4);

const execute = async (
    tool: { execute?: unknown },
    args: unknown,
): Promise<string> => {
    const run = tool.execute as (
        input: unknown,
        options: { toolCallId: string; messages: [] },
    ) => Promise<{ result: string }>;
    const output = await run(args, {
        toolCallId: 'benchmark',
        messages: [],
    });
    return output.result;
};

const render = async (format: ToolOutputFormat) => {
    const updateProgress = async () => {};
    const findExplores = getFindExplores({
        fieldSearchSize: 50,
        outputFormat: format,
        updateProgress,
        findExplores: async () => ({
            exploreSearchResults: [
                {
                    name: 'orders',
                    label: 'Orders',
                    description: longDescription,
                    searchRank: 0.91,
                    joinedTables: ['customers'],
                },
            ],
            topMatchingDimensions: catalogFields
                .filter((field) => field.fieldType === FieldType.DIMENSION)
                .map((field) => ({
                    name: field.name,
                    label: field.label,
                    tableName: field.tableName,
                    fieldType: field.fieldType,
                    description: field.description,
                    searchRank: field.searchRank,
                    chartUsage: field.chartUsage,
                    verifiedChartUsage: field.verifiedChartUsage,
                })),
            topMatchingMetrics: catalogFields
                .filter((field) => field.fieldType === FieldType.METRIC)
                .map((field) => ({
                    name: field.name,
                    label: field.label,
                    tableName: field.tableName,
                    fieldType: field.fieldType,
                    description: field.description,
                    searchRank: field.searchRank,
                    chartUsage: field.chartUsage,
                    verifiedChartUsage: field.verifiedChartUsage,
                })),
        }),
    });

    const findFields = getFindFields({
        outputFormat: format,
        updateProgress,
        pageSize: 30,
        getExplore: async () => explore as never,
        findFields: async () => ({
            fields: catalogFields as never,
            pagination: {
                page: 1,
                pageSize: 30,
                totalPageCount: 1,
                totalResults: catalogFields.length,
            },
        }),
    });

    const searchSemanticLayer = getSearchSemanticLayer({
        outputFormat: format,
        updateProgress,
        maxPageSize: 200,
        searchSemanticLayer: async () => ({
            fields: catalogFields.map((field) => ({
                name: field.name,
                label: field.label,
                tableName: field.tableName,
                fieldType: field.fieldType,
                description: field.description,
                chartUsage: field.chartUsage,
                searchRank: field.searchRank,
            })),
            pagination: {
                page: 1,
                pageSize: 200,
                totalPageCount: 1,
                totalResults: catalogFields.length,
            },
        }),
    });

    const getFields = getGetFields({
        outputFormat: format,
        getExplore: async () => explore as never,
    });

    return {
        findExplores: await execute(findExplores, {
            searchQuery: 'revenue by customer segment',
        }),
        findFields: await execute(findFields, {
            table: 'orders',
            page: 1,
            fieldSearchQueries: [{ label: 'revenue' }, { label: 'segment' }],
        }),
        searchSemanticLayer: await execute(searchSemanticLayer, {
            searchQuery: 'revenue',
            type: null,
            page: 1,
            pageSize: 200,
        }),
        getFields: await execute(getFields, {
            fields: [
                { explore: 'orders', fieldId: 'orders_total_revenue' },
                { explore: 'orders', fieldId: 'customers_segment' },
            ],
        }),
    };
};

const main = async () => {
    const xml = await render('xml');
    const json = await render('json');

    const rows = Object.keys(xml).map((toolName) => {
        const xmlText = xml[toolName as keyof typeof xml];
        const jsonText = json[toolName as keyof typeof json];
        return {
            tool: toolName,
            xmlChars: xmlText.length,
            jsonChars: jsonText.length,
            'gpt-5.4-mini/xmlTokens': roughTokens(xmlText),
            'gpt-5.4-mini/jsonTokens': roughTokens(jsonText),
            'latest-sonnet/xmlTokens': roughTokens(xmlText),
            'latest-sonnet/jsonTokens': roughTokens(jsonText),
            deltaTokens: roughTokens(jsonText) - roughTokens(xmlText),
            deltaPct: `${Math.round(((jsonText.length - xmlText.length) / xmlText.length) * 100)}%`,
        };
    });

    console.table(rows);
};

void main();
