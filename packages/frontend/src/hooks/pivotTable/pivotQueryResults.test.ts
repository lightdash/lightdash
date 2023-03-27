import { pivotQueryResults } from './pivotQueryResults';
import { METRIC_QUERY, RESULT_ROWS } from './pivotQueryResults.mock';

describe('Should pivot data', () => {
    it('with metrics as columns and one pivot dimension', () => {
        const pivotConfig = {
            pivotDimensions: ['site'],
            metricsAsRows: false,
        };
        const expected = {
            headerValueTypes: [
                { type: 'dimension', field: 'site' },
                { type: 'metrics' },
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
            indexValueTypes: [{ type: 'dimension', field: 'page' }],
            indexValues: [
                [{ raw: '/home', formatted: '/home' }],
                [{ raw: '/about', formatted: '/about' }],
                [{ raw: '/first-post', formatted: '/first-post' }],
            ],
            dataColumnCount: 4,
            metrics: {},
            dimensions: {},
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
        };
        const result = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY,
            rows: RESULT_ROWS,
        });
        expect(result).toEqual(expected);
    });
    it('with metrics as rows and one pivot dimension', () => {
        const pivotConfig = {
            pivotDimensions: ['site'],
            metricsAsRows: true,
        };
        const expected = {
            headerValueTypes: [{ type: 'dimension', field: 'site' }],
            headerValues: [
                [
                    { raw: 'blog', formatted: 'Blog' },
                    { raw: 'docs', formatted: 'Docs' },
                ],
            ],
            indexValueTypes: [
                { type: 'dimension', field: 'page' },
                { type: 'metrics' },
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
            metrics: {},
            dimensions: {},
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
        };
        const results = pivotQueryResults({
            pivotConfig,
            metricQuery: METRIC_QUERY,
            rows: RESULT_ROWS,
        });
        expect(results).toStrictEqual(expected);
    });
});
