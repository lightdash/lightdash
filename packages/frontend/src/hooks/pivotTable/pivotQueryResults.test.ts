import { FieldType } from '@lightdash/common';
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
    it.skip('with 1 dimension, pivoted, metrics as cols (everything on columns)', () => {
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
                    { raw: '/home', formatted: '/home' },
                    { raw: '/home', formatted: '/home' },
                    { raw: '/about', formatted: '/about' },
                    { raw: '/about', formatted: '/about' },
                    { raw: '/first-post', formatted: '/first-post' },
                    { raw: '/first-post', formatted: '/first-post' },
                ],
                [
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                ],
            ],
            indexValueTypes: [],
            indexValues: [],
            dataColumns: 6,
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
            pivotConfig,
            titleFields: [[], [], []],
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
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
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                ],
            ],
            indexValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            indexValues: [
                [{ raw: '/home', formatted: '/home' }],
                [{ raw: '/about', formatted: '/about' }],
                [{ raw: '/first-post', formatted: '/first-post' }],
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
            titleFields: [
                [
                    {
                        type: FieldType.DIMENSION,
                        fieldId: 'page',
                        titleDirection: 'index',
                    },
                ],
            ],
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
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
                    { raw: '/home', formatted: '/home' },
                    { raw: '/about', formatted: '/about' },
                    { raw: '/first-post', formatted: '/first-post' },
                ],
            ],
            indexValueTypes: [{ type: 'metric' }],
            indexValues: [
                [{ raw: 'views', formatted: 'views' }],
                [{ raw: 'devices', formatted: 'devices' }],
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
            pivotConfig,
            titleFields: [
                [
                    {
                        type: FieldType.DIMENSION,
                        fieldId: 'page',
                        titleDirection: 'header',
                    },
                ],
            ],
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_1DIM_2METRIC,
            rows: RESULT_ROWS_1DIM_2METRIC,
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
                    { raw: 'blog', formatted: 'Blog' },
                    { raw: 'blog', formatted: 'Blog' },
                    { raw: 'docs', formatted: 'Docs' },
                    { raw: 'docs', formatted: 'Docs' },
                ],
                [
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                    { raw: 'views', formatted: 'views' },
                    { raw: 'devices', formatted: 'devices' },
                ],
            ],
            indexValueTypes: [{ type: 'dimension', fieldId: 'page' }],
            indexValues: [
                [{ raw: '/home', formatted: '/home' }],
                [{ raw: '/about', formatted: '/about' }],
                [{ raw: '/first-post', formatted: '/first-post' }],
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
            pivotConfig,
            titleFields: [
                [
                    {
                        type: FieldType.DIMENSION,
                        fieldId: 'site',
                        titleDirection: 'header',
                    },
                ],
                [
                    {
                        type: FieldType.DIMENSION,
                        fieldId: 'page',
                        titleDirection: 'index',
                    },
                ],
            ],
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
        });
        expect(result).toEqual(expected);
    });
    it('with 2 dimensions, 1 pivoted, metrics as rows', () => {
        const pivotConfig = {
            pivotDimensions: ['site'],
            metricsAsRows: true,
        };
        const expected = {
            headerValueTypes: [{ type: 'dimension', fieldId: 'site' }],
            headerValues: [
                [
                    { raw: 'blog', formatted: 'Blog' },
                    { raw: 'docs', formatted: 'Docs' },
                ],
            ],
            indexValueTypes: [
                { type: 'dimension', fieldId: 'page' },
                { type: 'metric' },
            ],
            indexValues: [
                [
                    { raw: '/home', formatted: '/home' },
                    { raw: 'views', formatted: 'views' },
                ],
                [
                    { raw: '/home', formatted: '/home' },
                    { raw: 'devices', formatted: 'devices' },
                ],
                [
                    { raw: '/about', formatted: '/about' },
                    { raw: 'views', formatted: 'views' },
                ],
                [
                    { raw: '/about', formatted: '/about' },
                    { raw: 'devices', formatted: 'devices' },
                ],
                [
                    { raw: '/first-post', formatted: '/first-post' },
                    { raw: 'views', formatted: 'views' },
                ],
                [
                    { raw: '/first-post', formatted: '/first-post' },
                    { raw: 'devices', formatted: 'devices' },
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
            pivotConfig,
            titleFields: [
                [
                    {
                        type: FieldType.DIMENSION,
                        fieldId: 'page',
                        titleDirection: 'index',
                    },
                    {
                        type: FieldType.DIMENSION,
                        fieldId: 'site',
                        titleDirection: 'header',
                    },
                ],
            ],
        };
        const results = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY_2DIM_2METRIC,
            rows: RESULT_ROWS_2DIM_2METRIC,
        });
        expect(results).toStrictEqual(expected);
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
        });
        expect(results).toStrictEqual(expected);
    });
});
