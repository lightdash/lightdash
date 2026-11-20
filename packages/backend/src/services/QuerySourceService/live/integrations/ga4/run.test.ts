import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { ga4Integration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { getGa4ReportPath } from './run';

const jsonResponse = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (response: LiveHttpResponse) => {
    const send = vi.fn().mockResolvedValue(response);
    return {
        send,
        source: connectLiveSource(
            ga4Integration,
            { connector: ApiConnectorType.GA4, propertyId: '123456' },
            send,
        ),
    };
};

const query = (request: Record<string, unknown>) => ({
    query: JSON.stringify(request),
    limit: 2,
});

const report = {
    dimensionHeaders: [{ name: 'date' }, { name: 'customEvent:plan' }],
    metricHeaders: [
        { name: 'activeUsers', type: 'TYPE_INTEGER' },
        { name: 'bounceRate', type: 'TYPE_FLOAT' },
    ],
    rows: [
        {
            dimensionValues: [{ value: '20261001' }, { value: 'pro' }],
            metricValues: [{ value: '120' }, { value: '0.42' }],
        },
        {
            dimensionValues: [{ value: '20261002' }, { value: 'free' }],
            metricValues: [{ value: '80' }, { value: '' }],
        },
        {
            dimensionValues: [{ value: '20261003' }, { value: 'pro' }],
            metricValues: [{ value: '95' }, { value: '0.38' }],
        },
    ],
    rowCount: 3,
};

const request = {
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'date' }, { name: 'customEvent:plan' }],
    metrics: [{ name: 'activeUsers' }, { name: 'bounceRate' }],
};

describe('ga4Integration run', () => {
    it('runs the report on the property, asking for one row more than the limit', async () => {
        const { source, send } = connect(jsonResponse(report));

        await source.run(query(request));

        expect(send).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v1beta/properties/123456:runReport',
            body: { ...request, limit: 3, offset: 0 },
        });
        expect(getGa4ReportPath('123456')).toBe(
            '/v1beta/properties/123456:runReport',
        );
    });

    it('maps headers to columns, dates to ISO and metrics to numbers', async () => {
        const { source } = connect(jsonResponse(report));

        const result = await source.run(query(request));

        expect(result.columns).toEqual([
            { name: 'date', type: DimensionType.DATE },
            { name: 'customEvent_plan', type: DimensionType.STRING },
            { name: 'activeUsers', type: DimensionType.NUMBER },
            { name: 'bounceRate', type: DimensionType.NUMBER },
        ]);
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                customEvent_plan: 'pro',
                activeUsers: 120,
                bounceRate: 0.42,
            },
            {
                date: '2026-10-02',
                customEvent_plan: 'free',
                activeUsers: 80,
                bounceRate: null,
            },
        ]);
        expect(result.hasMoreRows).toBe(true);
    });

    it('reports truncation from rowCount when the page is full', async () => {
        const { source } = connect(
            jsonResponse({
                ...report,
                rows: report.rows.slice(0, 2),
                rowCount: 2,
            }),
        );

        const result = await source.run(query(request));

        expect(result.hasMoreRows).toBe(false);
        expect(
            (
                await connect(
                    jsonResponse({
                        ...report,
                        rows: report.rows.slice(0, 2),
                        rowCount: 500,
                    }),
                ).source.run(query(request))
            ).hasMoreRows,
        ).toBe(true);
    });

    it('uses a smaller limit from the request', async () => {
        const { source, send } = connect(jsonResponse(report));

        const result = await source.run(query({ ...request, limit: 1 }));

        expect(send.mock.calls[0][0].body).toEqual({
            ...request,
            limit: 2,
            offset: 0,
        });
        expect(result.rows).toHaveLength(1);
        expect(result.hasMoreRows).toBe(true);
    });

    it('returns no rows for an empty report', async () => {
        const { source } = connect(
            jsonResponse({
                dimensionHeaders: [{ name: 'country' }],
                metricHeaders: [{ name: 'sessions' }],
            }),
        );

        const result = await source.run(
            query({ ...request, dimensions: [{ name: 'country' }] }),
        );

        expect(result.rows).toEqual([]);
        expect(result.hasMoreRows).toBe(false);
    });

    it.each([
        ['not json', 'must be a JSON object'],
        [JSON.stringify({ metrics: [{ name: 'sessions' }] }), 'dateRanges'],
        [
            JSON.stringify({
                dateRanges: [{ startDate: 'last week', endDate: 'today' }],
                metrics: [{ name: 'sessions' }],
            }),
            'NdaysAgo',
        ],
        [
            JSON.stringify({ ...request, metrics: [] }),
            'Invalid GA4 report request at metrics',
        ],
        [JSON.stringify({ ...request, offset: 10 }), 'Unrecognized key'],
        [
            JSON.stringify({
                ...request,
                dimensions: [{ name: 'date; drop' }],
            }),
            'GA4 API name',
        ],
    ])('refuses an invalid request %#', async (raw, message) => {
        const { source, send } = connect(jsonResponse(report));

        await expect(
            source.run({
                query: raw,
                limit: 2,
            }),
        ).rejects.toThrow(message);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses fields that collapse to the same column', async () => {
        const { source } = connect(
            jsonResponse({
                dimensionHeaders: [
                    { name: 'customEvent:plan' },
                    { name: 'customEvent_plan' },
                ],
                metricHeaders: [{ name: 'sessions' }],
                rows: [],
            }),
        );

        await expect(source.run(query(request))).rejects.toThrow(
            ParameterError,
        );
    });

    it('refuses a limit outside the report size', async () => {
        const { source } = connect(jsonResponse(report));

        await expect(
            source.run({ ...query(request), limit: 25_000 }),
        ).rejects.toThrow('limit must be between 1 and 24999 rows');
    });

    it.each([
        [
            jsonResponse(
                { error: { message: 'Field foo is not a valid dimension' } },
                400,
            ),
            WarehouseQueryError,
            'Field foo is not a valid dimension',
        ],
        [
            jsonResponse({ error: { message: 'No access' } }, 403),
            WarehouseConnectionError,
            'Google denied access to property 123456',
        ],
        [
            jsonResponse(
                {
                    error: {
                        message: 'Exhausted property tokens per hour',
                        status: 'RESOURCE_EXHAUSTED',
                    },
                },
                429,
            ),
            TooManyRequestsError,
            'Google Analytics quota exceeded',
        ],
    ])('explains a Google error %#', async (response, ErrorClass, message) => {
        const { source } = connect(response);

        const execution = source.run(query(request));
        await expect(execution).rejects.toThrow(ErrorClass);
        await expect(execution).rejects.toThrow(message);
    });
});
