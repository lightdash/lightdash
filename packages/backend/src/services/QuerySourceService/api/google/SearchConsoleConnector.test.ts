import {
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import type { ApiConnectorResponse } from '../ApiConnector';
import {
    getSearchConsoleQueryPath,
    SearchConsoleConnector,
} from './SearchConsoleConnector';

const jsonResponse = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): ApiConnectorResponse => ({ status, headers, body });

const createConnector = (response: ApiConnectorResponse) => {
    const send = vi.fn().mockResolvedValue(response);
    return {
        send,
        connector: new SearchConsoleConnector({
            siteUrl: 'https://lightdash.com/',
            send,
        }),
    };
};

const query = (request: Record<string, unknown>) => ({
    payload: { kind: 'query' as const, query: JSON.stringify(request) },
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

describe('SearchConsoleConnector', () => {
    it('sends the request to the site, asking for one row more than the limit', async () => {
        const { connector, send } = createConnector(jsonResponse(topQueries));

        const result = await connector.execute(
            query({
                startDate: '2026-10-01',
                endDate: '2026-10-28',
                dimensions: ['date', 'query'],
            }),
        );

        expect(send).toHaveBeenCalledWith({
            method: 'POST',
            path: getSearchConsoleQueryPath('https://lightdash.com/'),
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
        expect(result.truncated).toBe(true);
    });

    it('uses a smaller row limit from the request', async () => {
        const { connector, send } = createConnector(jsonResponse(topQueries));

        const result = await connector.execute(
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
        expect(result.truncated).toBe(true);
    });

    it('returns site totals when there are no dimensions', async () => {
        const { connector } = createConnector(
            jsonResponse({
                rows: [
                    { clicks: 25, impressions: 590, ctr: 0.042, position: 3 },
                ],
            }),
        );

        const result = await connector.execute(
            query({ startDate: '2026-10-01', endDate: '2026-10-28' }),
        );

        expect(result.rows).toEqual([
            { clicks: 25, impressions: 590, ctr: 0.042, position: 3 },
        ]);
        expect(result.truncated).toBe(false);
    });

    it('returns no rows when the site has no data for the range', async () => {
        const { connector } = createConnector(jsonResponse({}));
        const result = await connector.execute(
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
        const { connector, send } = createConnector(jsonResponse({}));
        const run = connector.execute({
            payload: { kind: 'query', query: raw },
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
        const { connector } = createConnector(response);
        const run = connector.execute(
            query({ startDate: '2026-10-01', endDate: '2026-10-28' }),
        );
        await expect(run).rejects.toBeInstanceOf(errorClass);
        await expect(run).rejects.toThrow(message);
    });
});
