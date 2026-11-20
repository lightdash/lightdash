import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { hubspotIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { toHubspotError } from './errors';
import { HUBSPOT_MAX_ROWS } from './explores';
import {
    HUBSPOT_DEAL_PROPERTIES,
    hubspotDeal,
    hubspotSearchPage,
} from './hubspot.fixtures';
import { summarizeHubspotTest } from './testSummary';

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (
    object: 'deals' | 'contacts',
    ...responses: LiveHttpResponse[]
) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: {
            object,
            ...connectLiveSource(
                hubspotIntegration,
                { connector: ApiConnectorType.HUBSPOT },
                send,
            ),
        },
    };
};

/** Runs a request on the object the source was connected for. */
const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) =>
    source.run({
        query: JSON.stringify({ object: source.object, ...request }),
        limit,
    });

const deals = (count: number, from = 0) =>
    Array.from({ length: count }, (_, index) => hubspotDeal(`${from + index}`));

describe('hubspotIntegration records', () => {
    it('reads each column as its type, in one call when the limit fits a page', async () => {
        const { source, send } = connect(
            'deals',
            response(hubspotSearchPage([hubspotDeal('101')], 1)),
        );

        const result = await run(source, {
            kind: 'records',
            columns: [
                { name: 'id', type: 'string' },
                { name: 'createdAt', type: 'timestamp' },
                { name: 'dealname', type: 'string' },
                { name: 'amount', type: 'number' },
                { name: 'dealstage', type: 'string' },
                { name: 'closedate', type: 'timestamp' },
                { name: 'contract_date', type: 'date' },
                { name: 'hs_is_closed_won', type: 'boolean' },
                { name: 'deal_tags', type: 'string' },
                { name: 'missing_property', type: 'string' },
            ],
            filters: [
                {
                    propertyName: 'dealstage',
                    operator: 'EQ',
                    value: 'closedwon',
                },
            ],
            sort: { propertyName: 'createdAt', direction: 'DESCENDING' },
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith({
            method: 'POST',
            path: '/crm/v3/objects/deals/search',
            body: {
                filterGroups: [
                    {
                        filters: [
                            {
                                propertyName: 'dealstage',
                                operator: 'EQ',
                                value: 'closedwon',
                            },
                        ],
                    },
                ],
                sorts: [
                    { propertyName: 'createdate', direction: 'DESCENDING' },
                ],
                properties: [
                    'dealname',
                    'amount',
                    'dealstage',
                    'closedate',
                    'contract_date',
                    'hs_is_closed_won',
                    'deal_tags',
                    'missing_property',
                ],
                limit: 10,
            },
        });
        expect(result.rows).toEqual([
            {
                id: '101',
                createdAt: '2026-09-01T10:00:00.000Z',
                dealname: 'Deal 101',
                amount: 1500.5,
                dealstage: 'closedwon',
                closedate: '2026-10-31T12:00:00Z',
                contract_date: '2026-10-01',
                hs_is_closed_won: true,
                deal_tags: null,
                missing_property: null,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('names built-in fields as each object’s own properties', async () => {
        const { source, send } = connect(
            'contacts',
            response(hubspotSearchPage([], 0)),
        );

        await run(source, {
            kind: 'records',
            columns: [{ name: 'id', type: 'string' }],
            filters: [
                { propertyName: 'updatedAt', operator: 'GTE', value: '1' },
            ],
            sort: { propertyName: 'id', direction: 'ASCENDING' },
        });

        expect(send.mock.calls[0][0].body).toEqual({
            filterGroups: [
                {
                    filters: [
                        {
                            propertyName: 'lastmodifieddate',
                            operator: 'GTE',
                            value: '1',
                        },
                    ],
                },
            ],
            sorts: [{ propertyName: 'hs_object_id', direction: 'ASCENDING' }],
            properties: ['hs_object_id'],
            limit: 10,
        });
    });

    it('reads only the pages the limit needs, and takes more rows from the total', async () => {
        const { source, send } = connect(
            'deals',
            response(hubspotSearchPage(deals(200), 4321, '200')),
            response(hubspotSearchPage(deals(200, 200), 4321, '400')),
            response(hubspotSearchPage(deals(100, 400), 4321, '500')),
        );

        const result = await run(
            source,
            {
                kind: 'records',
                columns: [{ name: 'id', type: 'string' }],
                filters: [],
            },
            500,
        );

        expect(send).toHaveBeenCalledTimes(3);
        expect(send.mock.calls.map(([call]) => call.body)).toEqual([
            { properties: ['hs_object_id'], limit: 200 },
            { properties: ['hs_object_id'], limit: 200, after: '200' },
            { properties: ['hs_object_id'], limit: 100, after: '400' },
        ]);
        expect(result.rows).toHaveLength(500);
        expect(result.hasMoreRows).toBe(true);
    });

    it('stops when HubSpot has no next page', async () => {
        const { source, send } = connect(
            'deals',
            response(hubspotSearchPage(deals(3), 3)),
        );

        const result = await run(
            source,
            {
                kind: 'records',
                columns: [{ name: 'id', type: 'string' }],
                filters: [],
            },
            500,
        );

        expect(send).toHaveBeenCalledTimes(1);
        expect(result.rows).toHaveLength(3);
        expect(result.hasMoreRows).toBe(false);
    });

    it('refuses a limit past what one query reads, before calling', async () => {
        const { source, send } = connect('deals');

        await expect(
            run(
                source,
                {
                    kind: 'records',
                    columns: [{ name: 'id', type: 'string' }],
                    filters: [],
                },
                HUBSPOT_MAX_ROWS + 1,
            ),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses more filters than one search takes, before calling', async () => {
        const { source, send } = connect('deals');
        const filter = { propertyName: 'amount', operator: 'GT', value: '1' };

        await expect(
            run(source, {
                kind: 'records',
                columns: [{ name: 'id', type: 'string' }],
                filters: Array.from({ length: 7 }, () => filter),
            }),
        ).rejects.toThrow('HubSpot takes at most 6 filters in one search');
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses property names HubSpot could not have, before calling', async () => {
        const { source, send } = connect('deals');

        await expect(
            run(source, {
                kind: 'records',
                columns: [{ name: '../owners', type: 'string' }],
                filters: [],
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses a response of another shape', async () => {
        const { source } = connect('deals', response({ data: [] }));

        await expect(
            run(source, {
                kind: 'records',
                columns: [{ name: 'id', type: 'string' }],
                filters: [],
            }),
        ).rejects.toThrow();
    });
});

describe('hubspotIntegration count', () => {
    it('answers from the search total in one call, reading one record', async () => {
        const { source, send } = connect(
            'deals',
            response(hubspotSearchPage([hubspotDeal('1')], 12_345, '1')),
        );

        const result = await run(source, {
            kind: 'count',
            filters: [
                { propertyName: 'amount', operator: 'GT', value: '1000' },
            ],
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].body).toEqual({
            filterGroups: [
                {
                    filters: [
                        {
                            propertyName: 'amount',
                            operator: 'GT',
                            value: '1000',
                        },
                    ],
                },
            ],
            properties: ['hs_object_id'],
            limit: 1,
        });
        expect(result.rows).toEqual([{ total: 12_345 }]);
        expect(result.hasMoreRows).toBe(false);
    });
});

describe('hubspotIntegration scan and test', () => {
    it('reads each object’s properties, one call per object', async () => {
        const { source, send } = connect(
            'deals',
            response(HUBSPOT_DEAL_PROPERTIES),
            response({ results: [] }),
            response({ results: [] }),
        );

        await expect(source.scan()).resolves.toEqual({
            hubspotProperties: {
                deals: HUBSPOT_DEAL_PROPERTIES,
                contacts: { results: [] },
                companies: { results: [] },
            },
        });
        expect(send.mock.calls.map(([request]) => request.path)).toEqual([
            '/crm/v3/properties/deals',
            '/crm/v3/properties/contacts',
            '/crm/v3/properties/companies',
        ]);
    });

    it('reads a request for another object only on that object', async () => {
        const { source, send } = connect(
            'contacts',
            response(hubspotSearchPage([hubspotDeal('1')], 1)),
        );
        await run(source, { kind: 'count', filters: [] });
        expect(send.mock.calls[0][0].path).toBe(
            '/crm/v3/objects/contacts/search',
        );
    });

    it('summarizes the setup test as the account and its deal properties', () => {
        expect(summarizeHubspotTest(HUBSPOT_DEAL_PROPERTIES)).toEqual({
            summary: 'Connected to your HubSpot account',
            facts: [{ label: 'Deal properties', value: '14' }],
        });
        expect(summarizeHubspotTest({ status: 'error' })).toBe(null);
    });
});

describe('toHubspotError', () => {
    it('asks for a new token on 401', () => {
        const error = toHubspotError(
            response({ message: 'Authentication credentials not found.' }, 401),
        );
        expect(error).toBeInstanceOf(WarehouseConnectionError);
        expect(error.message).toContain('access token');
    });

    it('names the scopes on 403', () => {
        const error = toHubspotError(
            response(
                {
                    status: 'error',
                    message: 'This app hasn’t been granted all required scopes',
                    category: 'MISSING_SCOPES',
                },
                403,
            ),
        );
        expect(error).toBeInstanceOf(WarehouseConnectionError);
        expect(error.message).toContain('crm.objects.deals.read');
        expect(error.message).toContain('crm.schemas.companies.read');
    });

    it('says when to retry on 429', () => {
        const error = toHubspotError(
            response({ message: 'Too many requests' }, 429, {
                'retry-after': '2',
            }),
        );
        expect(error).toBeInstanceOf(TooManyRequestsError);
        expect(error.message).toContain('in 2 seconds');
    });

    it('passes on why a search was refused', () => {
        const error = toHubspotError(
            response(
                {
                    status: 'error',
                    message: 'There was a problem with the request.',
                    category: 'VALIDATION_ERROR',
                },
                400,
            ),
        );
        expect(error).toBeInstanceOf(WarehouseQueryError);
        expect(error.message).toContain(
            'There was a problem with the request.',
        );
    });

    it('reports a server error as unexpected', () => {
        expect(toHubspotError(response('boom', 502))).toBeInstanceOf(
            UnexpectedServerError,
        );
    });
});
