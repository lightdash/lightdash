import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { hubspotIntegration } from '.';
import {
    connectLiveSource,
    getExploresWithDiscoveredFields,
} from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { HUBSPOT_MAX_ROWS, toHubspotError } from './api';
import { summarizeHubspotTest } from './connection';
import {
    HUBSPOT_DEAL_PIPELINES,
    HUBSPOT_DEAL_PROPERTIES,
    HUBSPOT_TICKET_PIPELINES,
    hubspotDeal,
    hubspotSearchPage,
} from './hubspot.fixtures';
import { HUBSPOT_EXPLORES } from './model';

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (
    object: 'deals' | 'contacts' | 'tickets' | 'leads',
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

/** HubSpot's 403 for a token without the leads scope. */
const MISSING_LEADS_SCOPE = {
    status: 'error',
    message:
        'This app hasn’t been granted all required scopes to make this call.',
    category: 'MISSING_SCOPES',
    errors: [
        {
            message: 'One or more of the following scopes are required.',
            context: { requiredGranularScopes: ['crm.objects.leads.read'] },
        },
    ],
};

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

    it('names declared fields as each object’s own properties', async () => {
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

describe('hubspotIntegration discover and test', () => {
    it('reads each object’s properties, one call per object', async () => {
        const { source, send } = connect(
            'deals',
            response(HUBSPOT_DEAL_PROPERTIES),
            response({ results: [] }),
            response({ results: [] }),
            response({ results: [] }),
            response({ results: [] }),
        );

        const explores = await source.discover();

        expect(
            getExploresWithDiscoveredFields(HUBSPOT_EXPLORES, explores),
        ).toEqual(['deals']);
        expect(send.mock.calls.map(([request]) => request.path)).toEqual([
            '/crm/v3/properties/deals',
            '/crm/v3/properties/contacts',
            '/crm/v3/properties/companies',
            '/crm/v3/properties/tickets',
            '/crm/v3/properties/leads',
        ]);
    });

    it('leaves out an object the token can’t read and still scans the others', async () => {
        const { source } = connect(
            'deals',
            response(HUBSPOT_DEAL_PROPERTIES),
            response({ results: [] }),
            response({ results: [] }),
            response({ results: [] }),
            response(MISSING_LEADS_SCOPE, 403),
        );

        const explores = await source.discover();

        expect(explores.map(({ name }) => name)).toEqual(
            HUBSPOT_EXPLORES.map(({ name }) => name),
        );
        expect(
            getExploresWithDiscoveredFields(HUBSPOT_EXPLORES, explores),
        ).toEqual(['deals']);
    });

    it('fails the scan when no object can be read', async () => {
        const { source } = connect(
            'deals',
            ...Array.from({ length: 5 }, () =>
                response(
                    { message: 'Authentication credentials not found.' },
                    401,
                ),
            ),
        );
        await expect(source.discover()).rejects.toThrow('access token');
    });

    it('fails the scan when HubSpot is briefly unavailable, keeping the last one', async () => {
        const { source } = connect(
            'deals',
            response(HUBSPOT_DEAL_PROPERTIES),
            response({ message: 'Too many requests' }, 429),
            response({ results: [] }),
            response({ results: [] }),
            response({ results: [] }),
        );
        await expect(source.discover()).rejects.toBeInstanceOf(
            TooManyRequestsError,
        );
    });

    it('fails the scan when one object’s call times out, keeping the last one', async () => {
        const { source, send } = connect('deals');
        send.mockResolvedValueOnce(response(HUBSPOT_DEAL_PROPERTIES))
            .mockRejectedValueOnce(new Error('HubSpot timed out'))
            .mockResolvedValue(response({ results: [] }));
        await expect(source.discover()).rejects.toThrow('HubSpot timed out');
    });

    it.each([
        ['tickets', 'createdate'],
        ['leads', 'hs_createdate'],
    ] as const)(
        'searches %s by their own created-date property',
        async (object, propertyName) => {
            const { source, send } = connect(
                object,
                response(hubspotSearchPage([], 0)),
            );
            await run(source, {
                kind: 'count',
                filters: [
                    { propertyName: 'createdAt', operator: 'GTE', value: '1' },
                ],
            });
            expect(send.mock.calls[0][0]).toMatchObject({
                path: `/crm/v3/objects/${object}/search`,
                body: {
                    filterGroups: [
                        {
                            filters: [
                                { propertyName, operator: 'GTE', value: '1' },
                            ],
                        },
                    ],
                },
            });
        },
    );

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
        expect(error.message).toContain('tickets: tickets');
        expect(error.message).toContain('Sales Hub Professional');
    });

    it('names the scope HubSpot says the call needed', () => {
        const error = toHubspotError(response(MISSING_LEADS_SCOPE, 403));
        expect(error.message).toContain(
            'to make this call. This call needs crm.objects.leads.read.',
        );
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

describe('hubspotIntegration label columns', () => {
    const LABELS = {
        appointmentscheduled: 'Appointment Scheduled',
        closedwon: 'Closed Won',
    };

    it('shows option labels, reading each property once', async () => {
        const { source, send } = connect(
            'deals',
            response(
                hubspotSearchPage(
                    [
                        hubspotDeal('1'),
                        {
                            ...hubspotDeal('2'),
                            properties: {
                                dealstage: 'appointmentscheduled;gone',
                            },
                        },
                        { ...hubspotDeal('3'), properties: { dealstage: '' } },
                    ],
                    3,
                ),
            ),
        );

        const result = await run(source, {
            kind: 'records',
            columns: [
                { name: 'dealstage', type: 'string' },
                { name: 'dealstage:label', type: 'string', labels: LABELS },
            ],
            filters: [],
        });

        expect(send.mock.calls[0][0].body.properties).toEqual(['dealstage']);
        expect(result.rows).toEqual([
            { dealstage: 'closedwon', 'dealstage:label': 'Closed Won' },
            {
                dealstage: 'appointmentscheduled;gone',
                // A value the scan didn't see stays as it is
                'dealstage:label': 'Appointment Scheduled;gone',
            },
            { dealstage: null, 'dealstage:label': null },
        ]);
    });

    it('refuses a label column on a name HubSpot could not have', async () => {
        const { source, send } = connect('deals');
        await expect(
            run(source, {
                kind: 'records',
                columns: [{ name: 'Deal Stage:label', type: 'string' }],
                filters: [],
            }),
        ).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });
});

describe('hubspotIntegration pipeline stages', () => {
    const ALL_COLUMNS = [
        { name: 'objectType', type: 'string' },
        { name: 'pipelineId', type: 'string' },
        { name: 'pipelineLabel', type: 'string' },
        { name: 'stageId', type: 'string' },
        { name: 'stageLabel', type: 'string' },
        { name: 'stageDisplayOrder', type: 'number' },
        { name: 'probability', type: 'number' },
        { name: 'isClosed', type: 'boolean' },
    ];

    it('lists each object’s stages in HubSpot’s order, one call per object', async () => {
        const { source, send } = connect(
            'deals',
            response(HUBSPOT_DEAL_PIPELINES),
            response(HUBSPOT_TICKET_PIPELINES),
        );

        const result = await source.run({
            query: JSON.stringify({
                kind: 'pipeline_stages',
                objects: ['deals', 'tickets'],
                columns: ALL_COLUMNS,
            }),
            limit: 100,
        });

        expect(send.mock.calls.map(([request]) => request.path)).toEqual([
            '/crm/v3/pipelines/deals',
            '/crm/v3/pipelines/tickets',
        ]);
        expect(
            result.rows.map((row) => [
                row.objectType,
                row.pipelineLabel,
                row.stageId,
                row.stageLabel,
                row.probability,
                row.isClosed,
            ]),
        ).toEqual([
            [
                'Deals',
                'Sales Pipeline',
                'appointmentscheduled',
                'Appointment Scheduled',
                0.2,
                false,
            ],
            ['Deals', 'Sales Pipeline', 'closedwon', 'Closed Won', 1, true],
            ['Deals', 'Renewals', '1001', 'Renewal won', 1, true],
            ['Tickets', 'Support Pipeline', '1', 'New', null, false],
            ['Tickets', 'Support Pipeline', '4', 'Closed', null, true],
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('leaves out an object the token can’t read', async () => {
        const { source } = connect(
            'deals',
            response(HUBSPOT_DEAL_PIPELINES),
            response(
                { message: 'missing scopes', category: 'MISSING_SCOPES' },
                403,
            ),
        );
        const result = await source.run({
            query: JSON.stringify({
                kind: 'pipeline_stages',
                objects: ['deals', 'tickets'],
                columns: [{ name: 'objectType', type: 'string' }],
            }),
            limit: 100,
        });
        expect(result.rows).toHaveLength(3);
    });

    it('fails when no object can be read, or HubSpot is briefly unavailable', async () => {
        const forbidden = connect(
            'deals',
            response({ message: 'missing scopes' }, 403),
        );
        await expect(
            forbidden.source.run({
                query: JSON.stringify({
                    kind: 'pipeline_stages',
                    objects: ['deals'],
                    columns: [{ name: 'stageId', type: 'string' }],
                }),
                limit: 100,
            }),
        ).rejects.toBeInstanceOf(WarehouseConnectionError);

        const limited = connect(
            'deals',
            response(HUBSPOT_DEAL_PIPELINES),
            response({ message: 'Too many requests' }, 429),
        );
        await expect(
            limited.source.run({
                query: JSON.stringify({
                    kind: 'pipeline_stages',
                    objects: ['deals', 'tickets'],
                    columns: [{ name: 'stageId', type: 'string' }],
                }),
                limit: 100,
            }),
        ).rejects.toBeInstanceOf(TooManyRequestsError);
    });

    it('says when more stages exist than the limit', async () => {
        const { source } = connect('deals', response(HUBSPOT_DEAL_PIPELINES));
        const result = await source.run({
            query: JSON.stringify({
                kind: 'pipeline_stages',
                objects: ['deals'],
                columns: [{ name: 'stageId', type: 'string' }],
            }),
            limit: 2,
        });
        expect(result.rows).toEqual([
            { stageId: 'appointmentscheduled' },
            { stageId: 'closedwon' },
        ]);
        expect(result.hasMoreRows).toBe(true);
    });
});
