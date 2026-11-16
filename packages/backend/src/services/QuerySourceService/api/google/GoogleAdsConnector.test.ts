import {
    DimensionType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import type { ApiConnectorResponse } from '../ApiConnector';
import {
    getGoogleAdsSearchPath,
    GOOGLE_ADS_MAX_QUERY_ROWS,
    GoogleAdsConnector,
} from './GoogleAdsConnector';

const jsonResponse = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): ApiConnectorResponse => ({ status, headers, body });

const createConnector = (response: ApiConnectorResponse) => {
    const send = vi.fn().mockResolvedValue(response);
    return {
        send,
        connector: new GoogleAdsConnector({ customerId: '1234567890', send }),
    };
};

const run = (connector: GoogleAdsConnector, query: string, limit = 2) =>
    connector.execute({ payload: { kind: 'query', query }, limit });

const CAMPAIGN_QUERY =
    "SELECT segments.date, campaign.name, ad_group.id, metrics.cost_micros, metrics.clicks, metrics.ctr FROM ad_group WHERE segments.date BETWEEN '2026-10-01' AND '2026-10-28' LIMIT 2";

// The shape of GoogleAdsService.Search over REST: nested camelCase resources,
// 64-bit values as strings.
const adGroupPage = {
    results: [
        {
            segments: { date: '2026-10-01' },
            campaign: {
                resourceName: 'customers/1234567890/campaigns/11',
                name: 'Brand',
            },
            adGroup: {
                resourceName: 'customers/1234567890/adGroups/22',
                id: '22',
            },
            metrics: { costMicros: '12500000', clicks: '40', ctr: 0.08 },
        },
        {
            segments: { date: '2026-10-02' },
            campaign: { name: 'Brand' },
            adGroup: { id: '22' },
            metrics: { costMicros: '500000', clicks: '3', ctr: 0.01 },
        },
        {
            segments: { date: '2026-10-03' },
            campaign: { name: 'Brand' },
            adGroup: { id: '22' },
            metrics: { costMicros: '0', clicks: '0', ctr: 0 },
        },
    ],
    fieldMask: 'segments.date,campaign.name,adGroup.id',
    requestId: 'abc',
};

describe('GoogleAdsConnector', () => {
    it('searches the account, asking for one row more than the limit', async () => {
        const { connector, send } = createConnector(jsonResponse(adGroupPage));

        const result = await run(connector, CAMPAIGN_QUERY);

        expect(send).toHaveBeenCalledWith({
            method: 'POST',
            path: getGoogleAdsSearchPath('1234567890'),
            body: {
                query: CAMPAIGN_QUERY.replace('LIMIT 2', 'LIMIT 3'),
            },
        });
        expect(result.hasMoreRows).toBe(true);
        expect(result.rows).toHaveLength(2);
    });

    it('reads nested camelCase rows into GAQL columns and converts micros', async () => {
        const { connector } = createConnector(jsonResponse(adGroupPage));

        const result = await run(connector, CAMPAIGN_QUERY);

        expect(result.rows[0]).toEqual({
            'segments.date': '2026-10-01',
            'campaign.name': 'Brand',
            'ad_group.id': '22',
            'metrics.cost_micros': 12.5,
            'metrics.clicks': 40,
            'metrics.ctr': 0.08,
        });
        expect(result.columns).toEqual([
            { name: 'segments.date', type: DimensionType.DATE },
            { name: 'campaign.name', type: DimensionType.STRING },
            { name: 'ad_group.id', type: DimensionType.STRING },
            { name: 'metrics.cost_micros', type: DimensionType.NUMBER },
            { name: 'metrics.clicks', type: DimensionType.NUMBER },
            { name: 'metrics.ctr', type: DimensionType.NUMBER },
        ]);
    });

    it('converts every money metric but not conversion value', async () => {
        const { connector } = createConnector(
            jsonResponse({
                results: [
                    {
                        metrics: {
                            averageCpc: 1500000.5,
                            averageCpm: 2000000,
                            costPerConversion: 3000000,
                            conversionsValue: 45.5,
                        },
                    },
                ],
            }),
        );

        const { rows } = await run(
            connector,
            'SELECT metrics.average_cpc, metrics.average_cpm, metrics.cost_per_conversion, metrics.conversions_value FROM customer',
        );

        expect(rows[0]).toEqual({
            'metrics.average_cpc': 1.5000005,
            'metrics.average_cpm': 2,
            'metrics.cost_per_conversion': 3,
            'metrics.conversions_value': 45.5,
        });
    });

    it('keeps a metric the API left out as missing, not zero', async () => {
        const { connector } = createConnector(
            jsonResponse({ results: [{ metrics: {} }] }),
        );

        const { rows } = await run(
            connector,
            'SELECT metrics.search_impression_share FROM customer',
        );

        expect(rows[0]).toEqual({ 'metrics.search_impression_share': null });
    });

    it('reports no rows when the API returns none', async () => {
        const { connector } = createConnector(jsonResponse({}));

        const result = await run(
            connector,
            'SELECT metrics.clicks FROM customer',
        );

        expect(result).toMatchObject({ rows: [], hasMoreRows: false });
    });

    it('lets a smaller LIMIT in the query win and replaces it', async () => {
        const { connector, send } = createConnector(jsonResponse(adGroupPage));

        const result = await run(
            connector,
            'SELECT metrics.clicks FROM customer LIMIT 1',
            100,
        );

        expect(send.mock.calls[0][0].body).toEqual({
            query: 'SELECT metrics.clicks FROM customer LIMIT 2',
        });
        expect(result.rows).toHaveLength(1);
        expect(result.hasMoreRows).toBe(true);
    });

    it('adds a LIMIT when the query has none', async () => {
        const { connector, send } = createConnector(jsonResponse({}));

        await run(connector, 'SELECT metrics.clicks FROM customer', 5);

        expect(send.mock.calls[0][0].body).toEqual({
            query: 'SELECT metrics.clicks FROM customer LIMIT 6',
        });
    });

    it('refuses more rows than one query can return instead of cutting them off', async () => {
        const { connector, send } = createConnector(
            jsonResponse({
                results: Array.from(
                    { length: GOOGLE_ADS_MAX_QUERY_ROWS + 1 },
                    () => ({ metrics: { clicks: '1' } }),
                ),
            }),
        );

        await expect(
            run(connector, 'SELECT metrics.clicks FROM campaign', 50_000),
        ).rejects.toThrow(/more than 9,999 rows/);
        expect(send.mock.calls[0][0].body).toEqual({
            query: 'SELECT metrics.clicks FROM campaign LIMIT 10000',
        });
    });

    it('answers a large limit when the rows fit', async () => {
        const { connector } = createConnector(jsonResponse(adGroupPage));

        const result = await run(
            connector,
            'SELECT metrics.clicks FROM campaign',
            50_000,
        );

        expect(result).toMatchObject({ hasMoreRows: false });
        expect(result.rows).toHaveLength(3);
    });

    it.each([
        ['not GAQL', 'hello'],
        ['SELECT *', 'SELECT * FROM campaign'],
        ['PARAMETERS', 'SELECT metrics.clicks FROM customer PARAMETERS a=b'],
    ])('refuses %s', async (_, query) => {
        const { connector, send } = createConnector(jsonResponse({}));

        await expect(run(connector, query)).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('fails on a response in an unexpected shape', async () => {
        const { connector } = createConnector(jsonResponse({ results: 'no' }));

        await expect(
            run(connector, 'SELECT metrics.clicks FROM customer'),
        ).rejects.toThrow(/unexpected shape/);
    });

    describe('errors', () => {
        const failure = (message: string) => ({
            error: {
                code: 400,
                message: 'Request contains an invalid argument.',
                status: 'INVALID_ARGUMENT',
                details: [
                    {
                        '@type':
                            'type.googleapis.com/google.ads.googleads.v26.errors.GoogleAdsFailure',
                        errors: [
                            {
                                errorCode: {
                                    queryError: 'PROHIBITED_METRIC_IN_SELECT',
                                },
                                message,
                            },
                        ],
                    },
                ],
            },
        });

        it('explains a rejected query with the reason from the failure details', async () => {
            const { connector } = createConnector(
                jsonResponse(failure('Cannot select metrics.x with y.'), 400),
            );

            const error = await run(
                connector,
                'SELECT metrics.clicks FROM customer',
            ).catch((e) => e);

            expect(error).toBeInstanceOf(WarehouseQueryError);
            expect(error.message).toBe(
                'Google Ads rejected the request: Cannot select metrics.x with y.',
            );
        });

        it('keeps the top-level message when there are no details', async () => {
            const { connector } = createConnector(
                jsonResponse(
                    {
                        error: {
                            message: 'The caller does not have permission',
                            status: 'PERMISSION_DENIED',
                        },
                    },
                    403,
                ),
            );

            await expect(
                run(connector, 'SELECT metrics.clicks FROM customer'),
            ).rejects.toThrow(WarehouseConnectionError);
        });

        it('reports exhausted quota as rate limiting', async () => {
            const { connector } = createConnector(
                jsonResponse(
                    {
                        error: {
                            message: 'Too many requests',
                            status: 'RESOURCE_EXHAUSTED',
                        },
                    },
                    429,
                    { 'retry-after': '30' },
                ),
            );

            await expect(
                run(connector, 'SELECT metrics.clicks FROM customer'),
            ).rejects.toThrow(TooManyRequestsError);
        });
    });
});
