import { describe, expect, it } from 'vitest';
import { pivotQueryResults } from './pivotQueryResults';
import {
    METRIC_QUERY_0DIM_2METRIC,
    METRIC_QUERY_1DIM_2METRIC,
    METRIC_QUERY_2DIM_2METRIC,
    RESULT_ROWS_0DIM_2METRIC,
    RESULT_ROWS_1DIM_2METRIC,
    RESULT_ROWS_2DIM_2METRIC,
} from './pivotQueryResults.mock';

describe('Should pivot data', () => {
    it('with 1 dimension, pivoted, metrics as cols (everything on columns)', () => {
        const pivotConfig = {
            pivotDimensions: ['page'],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [
                { type: 'dimension', fieldId: 'page' },
                { type: 'metric' },
            ],
            headerValues: [
                [
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/home', raw: '/home' },
                        colSpan: 2,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/home', raw: '/home' },
                        colSpan: 0,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/about', raw: '/about' },
                        colSpan: 2,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/about', raw: '/about' },
                        colSpan: 0,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/first-post', raw: '/first-post' },
                        colSpan: 2,
                    },
                    {
                        fieldId: 'page',
                        type: 'value',
                        value: { formatted: '/first-post', raw: '/first-post' },
                        colSpan: 0,
                    },
                ],
                [
                    { fieldId: 'views', type: 'label' },
                    { fieldId: 'devices', type: 'label' },
                    { fieldId: 'views', type: 'label' },
                    { fieldId: 'devices', type: 'label' },
                    { fieldId: 'views', type: 'label' },
                    { fieldId: 'devices', type: 'label' },
                ],
            ],
            indexValueTypes: [],
            indexValues: [],
            dataColumnCount: 6,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                    { raw: 12, formatted: '12.0' },
                    { raw: 0, formatted: '0.0' },
                    { raw: 11, formatted: '11.0' },
                    { raw: 1, formatted: '1.0' },
                ],
            ],

            rowTotalFields: undefined,
            rowTotals: undefined,
            rowsCount: 1,
            columnTotalFields: undefined,
            columnTotals: undefined,

            pivotConfig,
            titleFields: [[{ direction: 'header', fieldId: 'page' }], [null]],
            cellsCount: 7,
            retrofitData: {
                allCombinedData: [
                    {
                        undefinedpage__views__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        undefinedpage__devices__1: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        undefinedpage__views__2: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        undefinedpage__devices__3: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        undefinedpage__views__4: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                        undefinedpage__devices__5: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        baseId: 'views',
                        fieldId: 'undefinedpage__views__0',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'undefinedpage__devices__1',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'undefinedpage__views__2',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'undefinedpage__devices__3',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'undefinedpage__views__4',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'undefinedpage__devices__5',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toEqual(expected);
    });

    it('with 1 dimension, metrics as cols', () => {
        const pivotConfig = {
            pivotDimensions: [],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [{ type: 'metric' }],
            headerValues: [
                [
                    { type: 'label', fieldId: 'views' },
                    { type: 'label', fieldId: 'devices' },
                ],
            ],
            indexValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            indexValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/about',
                            formatted: '/about',
                        },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/first-post',
                            formatted: '/first-post',
                        },
                        colSpan: 1,
                    },
                ],
            ],
            dataColumnCount: 2,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                ],
                [
                    { raw: 12, formatted: '12.0' },
                    { raw: 0, formatted: '0.0' },
                ],
                [
                    { raw: 11, formatted: '11.0' },
                    { raw: 1, formatted: '1.0' },
                ],
            ],
            pivotConfig,
            titleFields: [[{ fieldId: 'page', direction: 'index' }]],
            cellsCount: 3,
            rowsCount: 3,
            retrofitData: {
                allCombinedData: [
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        undefinedviews__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        undefineddevices__1: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        undefinedviews__0: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        undefineddevices__1: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        undefinedviews__0: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                        undefineddevices__1: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        fieldId: 'page',
                        columnType: 'indexValue',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'undefinedviews__0',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'undefineddevices__1',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toEqual(expected);
    });

    it('with 1 dimension, 1 pivoted, metrics as rows', () => {
        const pivotConfig = {
            pivotDimensions: ['page'],
            metricsAsRows: true,
        };
        const expected = {
            headerValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            headerValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/about', formatted: '/about' },
                        colSpan: 1,
                    },
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/first-post', formatted: '/first-post' },
                        colSpan: 1,
                    },
                ],
            ],
            indexValueTypes: [{ type: 'metric' }],
            indexValues: [
                [{ type: 'label', fieldId: 'views' }],
                [{ type: 'label', fieldId: 'devices' }],
            ],
            dataColumnCount: 3,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 12, formatted: '12.0' },
                    { raw: 11, formatted: '11.0' },
                ],
                [
                    { raw: 7, formatted: '7.0' },
                    { raw: 0, formatted: '0.0' },
                    { raw: 1, formatted: '1.0' },
                ],
            ],
            pivotConfig: {
                pivotDimensions: ['page'],
                metricsAsRows: true,
            },
            titleFields: [[{ fieldId: 'page', direction: 'header' }]],
            cellsCount: 4,
            rowsCount: 2,
            retrofitData: {
                allCombinedData: [
                    {
                        'label-0': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        undefinedpage__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        undefinedpage__1: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        undefinedpage__2: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                    },
                    {
                        'label-0': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        undefinedpage__0: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        undefinedpage__1: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        undefinedpage__2: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        fieldId: 'label-0',
                        columnType: 'label',
                    },
                    {
                        baseId: 'page',
                        fieldId: 'undefinedpage__0',
                    },
                    {
                        baseId: 'page',
                        fieldId: 'undefinedpage__1',
                    },
                    {
                        baseId: 'page',
                        fieldId: 'undefinedpage__2',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toEqual(expected);
    });

    it('with 2 dimensions, 1 pivoted, metrics as columns', () => {
        const pivotConfig = {
            pivotDimensions: ['site'],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [
                { type: 'dimension', fieldId: 'site' },
                { type: 'metric' },
            ],
            headerValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'blog', formatted: 'Blog' },
                        colSpan: 2,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'blog', formatted: 'Blog' },
                        colSpan: 0,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'docs', formatted: 'Docs' },
                        colSpan: 2,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'docs', formatted: 'Docs' },
                        colSpan: 0,
                    },
                ],
                [
                    { type: 'label', fieldId: 'views' },
                    { type: 'label', fieldId: 'devices' },
                    { type: 'label', fieldId: 'views' },
                    { type: 'label', fieldId: 'devices' },
                ],
            ],
            indexValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            indexValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/about', formatted: '/about' },
                        colSpan: 1,
                    },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/first-post', formatted: '/first-post' },
                        colSpan: 1,
                    },
                ],
            ],
            dataColumnCount: 4,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                    { raw: 2, formatted: '2.0' },
                    { raw: 10, formatted: '10.0' },
                ],
                [
                    { raw: 12, formatted: '12.0' },
                    { raw: 0, formatted: '0.0' },
                    { raw: 2, formatted: '2.0' },
                    { raw: 13, formatted: '13.0' },
                ],
                [
                    { raw: 11, formatted: '11.0' },
                    { raw: 1, formatted: '1.0' },
                    null,
                    null,
                ],
            ],
            pivotConfig: { pivotDimensions: ['site'], metricsAsRows: false },
            titleFields: [
                [{ fieldId: 'site', direction: 'header' }],
                [{ fieldId: 'page', direction: 'index' }],
            ],
            columnTotals: undefined,
            rowTotals: undefined,
            cellsCount: 5,
            rowsCount: 3,
            retrofitData: {
                allCombinedData: [
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        undefinedsite__views__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        undefinedsite__devices__1: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        undefinedsite__views__2: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                        undefinedsite__devices__3: {
                            value: { raw: 10, formatted: '10.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        undefinedsite__views__0: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        undefinedsite__devices__1: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        undefinedsite__views__2: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                        undefinedsite__devices__3: {
                            value: { raw: 13, formatted: '13.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        undefinedsite__views__0: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                        undefinedsite__devices__1: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        fieldId: 'page',
                        columnType: 'indexValue',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'undefinedsite__views__0',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'undefinedsite__devices__1',
                    },
                    {
                        baseId: 'views',
                        fieldId: 'undefinedsite__views__2',
                    },
                    {
                        baseId: 'devices',
                        fieldId: 'undefinedsite__devices__3',
                    },
                ],
            },
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });

        expect(result).toEqual(expected);
    });

    it('with 2 dimensions, 1 pivoted, metrics as rows with totals', () => {
        const pivotConfig = {
            pivotDimensions: ['site'],
            metricsAsRows: true,
            rowTotals: true,
        };
        const expected = {
            headerValueTypes: [{ type: 'dimension', fieldId: 'site' }],
            headerValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'blog', formatted: 'Blog' },
                        colSpan: 1,
                    },
                    {
                        type: 'value',
                        fieldId: 'site',
                        value: { raw: 'docs', formatted: 'Docs' },
                        colSpan: 1,
                    },
                ],
            ],
            indexValueTypes: [
                { type: 'dimension', fieldId: 'page' },
                { type: 'metric' },
            ],
            indexValues: [
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'views' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/home', formatted: '/home' },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'devices' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/about',
                            formatted: '/about',
                        },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'views' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/about',
                            formatted: '/about',
                        },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'devices' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: {
                            raw: '/first-post',
                            formatted: '/first-post',
                        },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'views' },
                ],
                [
                    {
                        type: 'value',
                        fieldId: 'page',
                        value: { raw: '/first-post', formatted: '/first-post' },
                        colSpan: 1,
                    },
                    { type: 'label', fieldId: 'devices' },
                ],
            ],
            dataColumnCount: 2,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 2, formatted: '2.0' },
                ],
                [
                    { raw: 7, formatted: '7.0' },
                    { raw: 10, formatted: '10.0' },
                ],
                [
                    { raw: 12, formatted: '12.0' },
                    { raw: 2, formatted: '2.0' },
                ],
                [
                    { raw: 0, formatted: '0.0' },
                    { raw: 13, formatted: '13.0' },
                ],
                [{ raw: 11, formatted: '11.0' }, null],
                [{ raw: 1, formatted: '1.0' }, null],
            ],
            pivotConfig: {
                pivotDimensions: ['site'],
                metricsAsRows: true,
                rowTotals: true,
            },
            retrofitData: {
                allCombinedData: [
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        'label-1': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        undefinedsite__0: {
                            value: { raw: 6, formatted: '6.0' },
                        },
                        undefinedsite__1: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/home', formatted: '/home' } },
                        'label-1': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        undefinedsite__0: {
                            value: { raw: 7, formatted: '7.0' },
                        },
                        undefinedsite__1: {
                            value: { raw: 10, formatted: '10.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        'label-1': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        undefinedsite__0: {
                            value: { raw: 12, formatted: '12.0' },
                        },
                        undefinedsite__1: {
                            value: { raw: 2, formatted: '2.0' },
                        },
                    },
                    {
                        page: { value: { raw: '/about', formatted: '/about' } },
                        'label-1': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        undefinedsite__0: {
                            value: { raw: 0, formatted: '0.0' },
                        },
                        undefinedsite__1: {
                            value: { raw: 13, formatted: '13.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        'label-1': {
                            value: { raw: 'views', formatted: 'views' },
                        },
                        undefinedsite__0: {
                            value: { raw: 11, formatted: '11.0' },
                        },
                    },
                    {
                        page: {
                            value: {
                                raw: '/first-post',
                                formatted: '/first-post',
                            },
                        },
                        'label-1': {
                            value: { raw: 'devices', formatted: 'devices' },
                        },
                        undefinedsite__0: {
                            value: { raw: 1, formatted: '1.0' },
                        },
                    },
                ],
                pivotColumnInfo: [
                    {
                        baseId: undefined,
                        fieldId: 'page',
                        columnType: 'indexValue',
                        underlyingId: undefined,
                    },
                    {
                        baseId: undefined,
                        fieldId: 'label-1',
                        columnType: 'label',
                        underlyingId: undefined,
                    },
                    {
                        baseId: 'site',
                        columnType: undefined,
                        fieldId: 'undefinedsite__0',
                        underlyingId: undefined,
                    },
                    {
                        baseId: 'site',
                        columnType: undefined,
                        fieldId: 'undefinedsite__1',
                        underlyingId: undefined,
                    },
                    {
                        baseId: 'row-total-0',
                        fieldId: 'row-total-0',
                        underlyingId: undefined,
                        columnType: 'rowTotal',
                    },
                ],
            },
            titleFields: [
                [
                    { fieldId: 'page', direction: 'index' },
                    { fieldId: 'site', direction: 'header' },
                ],
            ],
            columnTotalFields: undefined,
            rowTotalFields: [[{ fieldId: undefined }]],
            columnTotals: undefined,
            rowTotals: [[8], [17], [14], [13], [11], [1]],
            cellsCount: 5,
            rowsCount: 6,
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(result).toStrictEqual(expected);
    });

    it.skip('with 0 dimensions and 2 metrics as columns', () => {
        const pivotConfig = {
            pivotDimensions: [],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [{ type: 'metric' }],
            headerValues: [
                [
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                ],
            ],
            indexValueTypes: [],
            indexValues: [],
            dataColumnCount: 2,
            dataValues: [
                [
                    { raw: 6, formatted: '6.0' },
                    { raw: 7, formatted: '7.0' },
                ],
            ],
            pivotConfig,
        };
        const results = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_0DIM_2METRIC,
            rows: RESULT_ROWS_0DIM_2METRIC,
            options: { maxColumns: 60 },
            getFieldLabel: (fieldId) => fieldId,
            getField: (_fieldId) => undefined,
        });
        expect(results).toStrictEqual(expected);
    });
});
