import {
    ApiConnectorType,
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { searchConsoleIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { getSearchConsoleQueryPath } from './run';

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
            searchConsoleIntegration,
            {
                connector: ApiConnectorType.SEARCH_CONSOLE,
                siteUrl: 'https://lightdash.com/',
            },
            send,
        ),
    };
};

const query = (request: Record<string, unknown>) => ({
    query: JSON.stringify(request),
    limit: 2,
});

const topQueries = {
    rows: [
        {
            keys: ['2026-10-01', 'bi tool'],
            clicks: 12,
            impressions: 300,
            ctr: 0.04,
            position: 3.2,
        },
        {
            keys: ['2026-10-01', 'dbt bi'],
            clicks: 8,
            impressions: 90,
            ctr: 0.088,
            position: 1.9,
        },
        {
            keys: ['2026-10-02', 'bi tool'],
            clicks: 5,
            impressions: 200,
            ctr: 0.025,
            position: 4.1,
        },
    ],
};

describe('searchConsoleIntegration run', () => {
    it('sends the request to the site, asking for one row more than the limit', async () => {
        const { source, send } = connect(jsonResponse(topQueries));

        const result = await source.run(
            query({
                startDate: '2026-10-01',
                endDate: '2026-10-28',
                dimensions: ['date', 'query'],
            }),
        );

        expect(send).toHaveBeenCalledWith({
            method: 'POST',
            path: getSearchConsoleQueryPath('https://lightdash.com/'),
            endpoint: '/webmasters/v3/sites/{siteUrl}/searchAnalytics/query',
            body: {
                startDate: '2026-10-01',
                endDate: '2026-10-28',
                dimensions: ['date', 'query'],
                rowLimit: 3,
                startRow: 0,
            },
        });
        expect(result.columns).toEqual([
            { name: 'date', type: DimensionType.DATE },
            { name: 'query', type: DimensionType.STRING },
            { name: 'clicks', type: DimensionType.NUMBER },
            { name: 'impressions', type: DimensionType.NUMBER },
            { name: 'ctr', type: DimensionType.NUMBER },
            { name: 'position', type: DimensionType.NUMBER },
        ]);
        expect(result.rows).toEqual([
            {
                date: '2026-10-01',
                query: 'bi tool',
                clicks: 12,
                impressions: 300,
                ctr: 0.04,
                position: 3.2,
            },
            {
                date: '2026-10-01',
                query: 'dbt bi',
                clicks: 8,
                impressions: 90,
                ctr: 0.088,
                position: 1.9,
            },
        ]);
        expect(result.hasMoreRows).toBe(true);
    });

    it('uses a smaller row limit from the request', async () => {
        const { source, send } = connect(jsonResponse(topQueries));

        const result = await source.run(
            query({
                startDate: '2026-10-01',
                endDate: '2026-10-28',
                dimensions: ['date', 'query'],
                rowLimit: 1,
            }),
        );

        expect(send.mock.calls[0][0].body).toEqual(
            expect.objectContaining({ rowLimit: 2, startRow: 0 }),
        );
        expect(result.rows).toHaveLength(1);
        expect(result.hasMoreRows).toBe(true);
    });

    it('returns site totals when there are no dimensions', async () => {
        const { source } = connect(
            jsonResponse({
                rows: [
                    { clicks: 25, impressions: 590, ctr: 0.042, position: 3 },
                ],
            }),
        );

        const result = await source.run(
            query({ startDate: '2026-10-01', endDate: '2026-10-28' }),
        );

        expect(result.rows).toEqual([
            { clicks: 25, impressions: 590, ctr: 0.042, position: 3 },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('returns no rows when the site has no data for the range', async () => {
        const { source } = connect(jsonResponse({}));
        const result = await source.run(
            query({ startDate: '2026-10-01', endDate: '2026-10-02' }),
        );
        expect(result.rows).toEqual([]);
    });

    it('encodes the site so it reaches Google encoded once', () => {
        expect(getSearchConsoleQueryPath('https://lightdash.com/')).toBe(
            '/webmasters/v3/sites/https%253A%252F%252Flightdash.com%252F/searchAnalytics/query',
        );
        expect(
            decodeURIComponent(
                getSearchConsoleQueryPath('sc-domain:lightdash.com'),
            ),
        ).toBe(
            '/webmasters/v3/sites/sc-domain%3Alightdash.com/searchAnalytics/query',
        );
    });

    it.each([
        ['not json', 'must be a JSON object'],
        [JSON.stringify({ endDate: '2026-10-28' }), 'startDate'],
        [
            JSON.stringify({ startDate: '2026-10-01', endDate: '28/10/2026' }),
            'Use YYYY-MM-DD',
        ],
        [
            JSON.stringify({
                startDate: '2026-10-01',
                endDate: '2026-10-28',
                dimensions: ['campaign'],
            }),
            'dimensions.0',
        ],
        [
            JSON.stringify({
                startDate: '2026-10-01',
                endDate: '2026-10-28',
                startRow: 10,
            }),
            'Unrecognized key',
        ],
        [
            JSON.stringify({ startDate: '2026-10-28', endDate: '2026-10-01' }),
            'must not be after endDate',
        ],
    ])('refuses an invalid request: %s', async (raw, message) => {
        const { source, send } = connect(jsonResponse({}));
        const run = source.run({
            query: raw,
            limit: 10,
        });
        await expect(run).rejects.toBeInstanceOf(ParameterError);
        await expect(run).rejects.toThrow(message);
        expect(send).not.toHaveBeenCalled();
    });

    it.each([
        [
            jsonResponse(
                { error: { message: 'Invalid dimension filter' } },
                400,
            ),
            WarehouseQueryError,
            'Search Console rejected the request: Invalid dimension filter',
        ],
        [
            jsonResponse(
                {
                    error: {
                        message: 'User does not have sufficient permission',
                    },
                },
                403,
            ),
            WarehouseConnectionError,
            'Google denied access to https://lightdash.com/',
        ],
        [
            jsonResponse(
                {
                    error: {
                        message: 'Quota exceeded',
                        status: 'RESOURCE_EXHAUSTED',
                    },
                },
                429,
            ),
            TooManyRequestsError,
            'Search Console quota exceeded: Quota exceeded. Retry in a minute.',
        ],
    ])('explains a %s response', async (response, errorClass, message) => {
        const { source } = connect(response);
        const run = source.run(
            query({ startDate: '2026-10-01', endDate: '2026-10-28' }),
        );
        await expect(run).rejects.toBeInstanceOf(errorClass);
        await expect(run).rejects.toThrow(message);
    });
});
