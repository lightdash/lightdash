import {
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import type { ApiConnectorResponse } from '../ApiConnector';
import { META_ADS_MAX_QUERY_ROWS, MetaAdsConnector } from './MetaAdsConnector';

const jsonResponse = (body: unknown, status = 200): ApiConnectorResponse => ({
    status,
    headers: {},
    body,
});

const createConnector = (...responses: ApiConnectorResponse[]) => {
    const send = vi.fn();
    responses.forEach((response) => send.mockResolvedValueOnce(response));
    return {
        send,
        connector: new MetaAdsConnector({ adAccountId: '123', send }),
    };
};

const BASE_REQUEST = {
    level: 'campaign',
    time_range: { since: '2026-10-01', until: '2026-10-30' },
    fields: ['campaign_name', 'spend'],
};

const execute = (
    connector: MetaAdsConnector,
    request: Record<string, unknown> = BASE_REQUEST,
    limit = 2,
) =>
    connector.execute({
        payload: { kind: 'query', query: JSON.stringify(request) },
        limit,
    });

// A page of the documented Insights response: every value is a string, and
// action lists hold { action_type, value } entries.
const page = (
    data: Record<string, unknown>[],
    { next }: { next: boolean } = { next: false },
) => ({
    data,
    paging: {
        cursors: { before: 'BEFORE', after: 'CURSOR' },
        ...(next ? { next: 'https://graph.facebook.com/next' } : {}),
    },
});

describe('MetaAdsConnector', () => {
    it('reads the Insights edge of the ad account with the query parameters', async () => {
        const { connector, send } = createConnector(
            jsonResponse(page([{ campaign_name: 'Spring', spend: '12.5' }])),
        );

        await execute(connector, {
            ...BASE_REQUEST,
            time_increment: 1,
            breakdowns: ['country'],
            filtering: [
                {
                    field: 'campaign.name',
                    operator: 'CONTAIN',
                    value: 'Spring',
                },
            ],
            sort: ['spend_descending'],
        });

        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v25.0/act_123/insights',
            query: {
                level: 'campaign',
                time_range: '{"since":"2026-10-01","until":"2026-10-30"}',
                time_increment: '1',
                fields: 'campaign_name,spend',
                breakdowns: 'country',
                filtering:
                    '[{"field":"campaign.name","operator":"CONTAIN","value":"Spring"}]',
                sort: '["spend_descending"]',
                limit: '3',
            },
            body: undefined,
        });
    });

    it('turns numeric strings into numbers and ctr into a fraction', async () => {
        const { connector } = createConnector(
            jsonResponse(
                page([
                    {
                        spend: '12.50',
                        impressions: '1000',
                        ctr: '2.5',
                        reach: '800',
                        date_start: '2026-10-01',
                        date_stop: '2026-10-01',
                    },
                ]),
            ),
        );

        const result = await execute(connector, {
            ...BASE_REQUEST,
            time_increment: 1,
            fields: ['spend', 'impressions', 'ctr', 'reach'],
        });

        expect(result.rows).toEqual([
            {
                date_start: '2026-10-01',
                spend: 12.5,
                impressions: 1000,
                ctr: 0.025,
                reach: 800,
            },
        ]);
    });

    it('reads one action type out of an action list, and leaves others empty', async () => {
        const { connector, send } = createConnector(
            jsonResponse(
                page([
                    {
                        actions: [
                            { action_type: 'link_click', value: '40' },
                            { action_type: 'omni_purchase', value: '3' },
                        ],
                        action_values: [
                            { action_type: 'omni_purchase', value: '89.97' },
                        ],
                    },
                ]),
            ),
        );

        const result = await execute(connector, {
            ...BASE_REQUEST,
            fields: [
                'actions:omni_purchase',
                'action_values:omni_purchase',
                'actions:lead',
                'purchase_roas:omni_purchase',
            ],
        });

        expect(send.mock.calls[0][0].query.fields).toBe(
            'actions,action_values,purchase_roas',
        );
        // A missing entry reads as empty: Meta also omits unavailable actions,
        // so zero could be a false number
        expect(result.rows).toEqual([
            {
                'actions:omni_purchase': 3,
                'action_values:omni_purchase': 89.97,
                'actions:lead': null,
                'purchase_roas:omni_purchase': null,
            },
        ]);
    });

    it('starts monthly rows on the first of the month, even mid-range', async () => {
        const { connector } = createConnector(
            jsonResponse(page([{ date_start: '2026-10-15', spend: '5' }])),
        );

        const result = await execute(connector, {
            ...BASE_REQUEST,
            time_increment: 'monthly',
            fields: ['spend'],
        });

        expect(result.rows[0].date_start).toBe('2026-10-01');
    });

    it('declares the columns it returns', async () => {
        const { connector } = createConnector(jsonResponse(page([])));

        const result = await execute(connector, {
            ...BASE_REQUEST,
            time_increment: 1,
            fields: ['campaign_name', 'spend', 'actions:lead'],
            breakdowns: ['age'],
        });

        expect(result.columns).toEqual([
            { name: 'date_start', type: 'date' },
            { name: 'campaign_name', type: 'string' },
            { name: 'spend', type: 'number' },
            { name: 'actions:lead', type: 'number' },
            { name: 'age', type: 'string' },
        ]);
    });

    it('pages with the cursor until it has more rows than the limit', async () => {
        const { connector, send } = createConnector(
            jsonResponse(
                page([{ spend: '1' }, { spend: '2' }], { next: true }),
            ),
            jsonResponse(page([{ spend: '3' }], { next: true })),
        );

        const result = await execute(
            connector,
            { ...BASE_REQUEST, fields: ['spend'] },
            2,
        );

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].query).toMatchObject({
            after: 'CURSOR',
            limit: '1',
        });
        expect(result.rows).toEqual([{ spend: 1 }, { spend: 2 }]);
        expect(result.truncated).toBe(true);
    });

    it('reports a complete result when the pages end within the limit', async () => {
        const { connector, send } = createConnector(
            jsonResponse(page([{ spend: '1' }])),
        );

        const result = await execute(
            connector,
            { ...BASE_REQUEST, fields: ['spend'] },
            5,
        );

        expect(send).toHaveBeenCalledTimes(1);
        expect(result.truncated).toBe(false);
    });

    it('refuses a result the page cap would leave incomplete', async () => {
        const fullPage = jsonResponse(
            page(
                Array.from({ length: 500 }, (_, index) => ({
                    spend: String(index),
                })),
                { next: true },
            ),
        );
        const { connector, send } = createConnector(
            ...Array.from({ length: 10 }, () => fullPage),
        );

        await expect(
            execute(
                connector,
                { ...BASE_REQUEST, fields: ['spend'] },
                META_ADS_MAX_QUERY_ROWS,
            ),
        ).rejects.toThrow(
            /more rows than the 5,000 one query can read, so this result would be incomplete/,
        );
        expect(send).toHaveBeenCalledTimes(10);
    });

    it.each([
        ['bad JSON', 'not json', 'must be a JSON object'],
        [
            'an unknown field',
            JSON.stringify({ ...BASE_REQUEST, fields: ['spend; DROP'] }),
            'Unknown Insights field',
        ],
        [
            'an unknown breakdown',
            JSON.stringify({
                ...BASE_REQUEST,
                breakdowns: ['device_platform'],
            }),
            'Invalid Meta Ads request at breakdowns.0',
        ],
        [
            'a range that ends before it starts',
            JSON.stringify({
                ...BASE_REQUEST,
                time_range: { since: '2026-10-30', until: '2026-10-01' },
            }),
            'The date range starts after it ends',
        ],
    ])('refuses %s', async (_name, query, message) => {
        const { connector, send } = createConnector();

        await expect(
            connector.execute({ payload: { kind: 'query', query }, limit: 2 }),
        ).rejects.toThrow(ParameterError);
        await expect(
            connector.execute({ payload: { kind: 'query', query }, limit: 2 }),
        ).rejects.toThrow(message);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses a limit past the cap', async () => {
        const { connector } = createConnector();

        await expect(
            execute(connector, BASE_REQUEST, META_ADS_MAX_QUERY_ROWS + 1),
        ).rejects.toThrow(
            `limit must be between 1 and ${META_ADS_MAX_QUERY_ROWS}`,
        );
    });

    it.each([
        [
            'an expired token',
            401,
            { message: 'Session has expired', code: 190 },
            WarehouseConnectionError,
            /Generate a new system user token/,
        ],
        [
            'a token without access to the account',
            400,
            { message: 'Permissions error', code: 200 },
            WarehouseConnectionError,
            /denied access to ad account 123.*ads_read/,
        ],
        [
            'an app over its load limit',
            400,
            { message: 'Application request limit reached', code: 4 },
            TooManyRequestsError,
            /rate limit reached/,
        ],
        [
            'an Insights-specific throttle',
            400,
            { message: 'Too many calls', code: 80000 },
            TooManyRequestsError,
            /rate limit reached/,
        ],
        [
            'a query over the data limit',
            400,
            { message: 'Too much data', code: 100, error_subcode: 1487534 },
            WarehouseQueryError,
            /can't return this much data.*Narrow the date range/,
        ],
        [
            'a date past the retention limit',
            400,
            { message: 'start date too old', code: 3018 },
            WarehouseQueryError,
            /37 months/,
        ],
        [
            'an invalid parameter',
            400,
            { message: 'Invalid parameter', code: 100 },
            WarehouseQueryError,
            /rejected the request: Invalid parameter/,
        ],
        [
            'a server failure',
            500,
            { message: 'Internal', code: 2 },
            UnexpectedServerError,
            /returned 500: Internal/,
        ],
    ])('explains %s', async (_name, status, error, errorClass, message) => {
        const makeConnector = () =>
            createConnector(jsonResponse({ error }, status)).connector;

        await expect(execute(makeConnector())).rejects.toThrow(errorClass);
        await expect(execute(makeConnector())).rejects.toThrow(message);
    });

    it('fails clearly on a response in an unexpected shape', async () => {
        const { connector } = createConnector(jsonResponse({ rows: [] }));

        await expect(execute(connector)).rejects.toThrow(
            'Meta Ads returned a response in an unexpected shape',
        );
    });
});
