import {
    ApiConnectorType,
    isSalesforceInstanceOrigin,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { salesforceIntegration } from '.';
import { validateLiveConnection } from '../../integration';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import {
    SALESFORCE_MAX_AGGREGATE_ROWS,
    SALESFORCE_MAX_RECORD_ROWS,
} from './api';
import { toSalesforceError } from './errors';
import {
    AGGREGATE_RESPONSE,
    LIMITS_RESPONSE,
    OPPORTUNITY_DESCRIBE,
    recordsBatch,
    salesforceError,
} from './salesforce.fixtures';
import { summarizeSalesforceTest } from './testSummary';

const SETTINGS = { connector: ApiConnectorType.SALESFORCE } as const;

const response = (body: unknown, status = 200): LiveHttpResponse => ({
    status,
    headers: {},
    body,
});

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(salesforceIntegration, SETTINGS, send),
    };
};

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) => source.run({ query: JSON.stringify(request), limit });

const AGGREGATE_REQUEST = {
    object: 'Opportunity',
    kind: 'aggregate',
    columns: [
        { name: 'StageName', type: 'string' },
        { name: 'CALENDAR_MONTH(CloseDate)', type: 'date' },
        { name: 'SUM(Amount)', type: 'number' },
        { name: 'COUNT(Id)', type: 'number' },
    ],
    where: null,
    having: null,
    sorts: [],
};

const RECORDS_REQUEST = {
    object: 'Opportunity',
    kind: 'records',
    columns: [
        { name: 'Id', type: 'string' },
        { name: 'Owner.Name', type: 'string' },
        { name: 'CALENDAR_QUARTER(CloseDate)', type: 'date' },
        { name: 'CreatedDate', type: 'timestamp' },
    ],
    where: null,
    having: null,
    sorts: [],
};

const NEXT = '/services/data/v62.0/query/01gD0000002HU6KIAW-2000';

describe('salesforceIntegration aggregate queries', () => {
    it('totals on Salesforce in one call and reads months from year and month', async () => {
        const { source, send } = connect(response(AGGREGATE_RESPONSE));

        const result = await run(source, AGGREGATE_REQUEST, 10);

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            path: '/services/data/v62.0/query',
            query: {
                q: 'SELECT StageName c0, CALENDAR_YEAR(CloseDate) c1y, CALENDAR_MONTH(CloseDate) c1m, SUM(Amount) c2, COUNT(Id) c3 FROM Opportunity GROUP BY StageName, CALENDAR_YEAR(CloseDate), CALENDAR_MONTH(CloseDate) LIMIT 11',
            },
        });
        expect(result.rows).toEqual([
            {
                StageName: 'Closed Won',
                'CALENDAR_MONTH(CloseDate)': '2026-03-01',
                'SUM(Amount)': 120000.5,
                'COUNT(Id)': 4,
            },
            {
                StageName: 'Prospecting',
                'CALENDAR_MONTH(CloseDate)': '2026-04-01',
                'SUM(Amount)': null,
                'COUNT(Id)': 2,
            },
            {
                StageName: null,
                'CALENDAR_MONTH(CloseDate)': null,
                'SUM(Amount)': 10,
                'COUNT(Id)': 1,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('says there are more rows from the one past the limit', async () => {
        const { source } = connect(response(AGGREGATE_RESPONSE));

        const result = await run(source, AGGREGATE_REQUEST, 2);

        expect(result.rows).toHaveLength(2);
        expect(result.hasMoreRows).toBe(true);
    });

    it('never asks for more than 2,000 rows, and refuses a full batch it cannot finish', async () => {
        const full = {
            totalSize: SALESFORCE_MAX_AGGREGATE_ROWS,
            done: true,
            records: Array.from(
                { length: SALESFORCE_MAX_AGGREGATE_ROWS },
                (_, index) => ({
                    c0: `${index}`,
                    c1y: 2026,
                    c1m: 1,
                    c2: 1,
                    c3: 1,
                }),
            ),
        };
        const { source, send } = connect(response(full));

        await expect(run(source, AGGREGATE_REQUEST, 5000)).rejects.toThrow(
            /at most 2,000 totalled rows/,
        );
        expect(send.mock.calls[0][0].query.q).toMatch(/ LIMIT 2000$/);
    });
});

describe('salesforceIntegration record lists', () => {
    it('reads lookups and grains from records, in one call when the limit fits a batch', async () => {
        const { source, send } = connect(
            response(recordsBatch({ from: 0, count: 2, totalSize: 2 })),
        );

        const result = await run(source, RECORDS_REQUEST, 10);

        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].query.q).toBe(
            'SELECT Id, Owner.Name, CloseDate, CreatedDate FROM Opportunity LIMIT 11',
        );
        expect(result.rows[0]).toEqual({
            Id: '006000000000000000',
            'Owner.Name': 'Sales Rep',
            'CALENDAR_QUARTER(CloseDate)': '2026-04-01',
            CreatedDate: '2026-02-03T10:15:00.000Z',
        });
        expect(result.hasMoreRows).toBe(false);
    });

    it('follows nextRecordsUrl only up to the row past the limit', async () => {
        const { source, send } = connect(
            response(
                recordsBatch({
                    from: 0,
                    count: 2000,
                    totalSize: 2501,
                    next: NEXT,
                }),
            ),
            response(recordsBatch({ from: 2000, count: 501, totalSize: 2501 })),
        );

        const result = await run(source, RECORDS_REQUEST, 2500);

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0]).toMatchObject({ path: NEXT });
        expect(send.mock.calls[1][0].query).toBeUndefined();
        expect(result.rows).toHaveLength(2500);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a list longer than one query reads', async () => {
        const batches = Array.from({ length: 5 }, (_, index) =>
            response(
                recordsBatch({
                    from: index * 2000,
                    count: 2000,
                    totalSize: SALESFORCE_MAX_RECORD_ROWS + 1,
                    next: index < 4 ? `${NEXT}${index}` : undefined,
                }),
            ),
        );
        const { source, send } = connect(...batches);

        await expect(run(source, RECORDS_REQUEST, 50_000)).rejects.toThrow(
            /more than 9,999 rows/,
        );
        expect(send).toHaveBeenCalledTimes(5);
    });

    it('flags rows as incomplete when smaller batches use up the calls', async () => {
        const batches = Array.from({ length: 5 }, (_, index) =>
            response(
                recordsBatch({
                    from: index * 200,
                    count: 200,
                    totalSize: 5000,
                    next: `${NEXT}${index}`,
                }),
            ),
        );
        const { source, send } = connect(...batches);

        const result = await run(source, RECORDS_REQUEST, 5000);

        expect(send).toHaveBeenCalledTimes(5);
        expect(result.rows).toHaveLength(1000);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses a next link off the query path before calling it', async () => {
        const { source, send } = connect(
            response(
                recordsBatch({
                    from: 0,
                    count: 2000,
                    totalSize: 4000,
                    next: '/services/data/v62.0/sobjects/User',
                }),
            ),
        );

        await expect(run(source, RECORDS_REQUEST, 3000)).rejects.toThrow(
            ParameterError,
        );
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('fails on a response that is not a query result', async () => {
        const { source } = connect(response({ unexpected: true }));
        await expect(run(source, RECORDS_REQUEST)).rejects.toThrow();
    });
});

describe('salesforceIntegration requests', () => {
    it('refuses what SOQL cannot run before any call', async () => {
        const refused = [
            {
                ...AGGREGATE_REQUEST,
                columns: [{ name: 'StageName', type: 'string' }],
            },
            {
                ...AGGREGATE_REQUEST,
                columns: [
                    { name: 'CreatedDate', type: 'timestamp' },
                    { name: 'COUNT(Id)', type: 'number' },
                ],
            },
            {
                ...AGGREGATE_REQUEST,
                columns: [{ name: 'COUNT(Id)', type: 'number' }],
                having: {
                    field: 'COUNT(Id)',
                    operator: 'gt',
                    values: [1],
                    valueType: 'number',
                },
            },
            {
                ...RECORDS_REQUEST,
                columns: [{ name: 'SUM(Amount)', type: 'number' }],
            },
            {
                ...RECORDS_REQUEST,
                where: {
                    field: 'SUM(Amount)',
                    operator: 'gt',
                    values: [1],
                    valueType: 'number',
                },
            },
        ];
        for (const request of refused) {
            const { source, send } = connect();
            // eslint-disable-next-line no-await-in-loop
            await expect(run(source, request)).rejects.toBeInstanceOf(
                ParameterError,
            );
            expect(send).not.toHaveBeenCalled();
        }
    });
});

describe('salesforceIntegration scan and setup test', () => {
    it('reads every object describe in one scan', async () => {
        const { source, send } = connect(
            response(OPPORTUNITY_DESCRIBE),
            response({ name: 'Account', fields: [] }),
            response({ name: 'Lead', fields: [] }),
            response({ name: 'Contact', fields: [] }),
        );

        const scan = await source.discover();

        expect(send.mock.calls.map(([call]) => call.path)).toEqual([
            '/services/data/v62.0/sobjects/Opportunity/describe',
            '/services/data/v62.0/sobjects/Account/describe',
            '/services/data/v62.0/sobjects/Lead/describe',
            '/services/data/v62.0/sobjects/Contact/describe',
        ]);
        expect(scan.salesforceDescribe).toMatchObject({
            Opportunity: OPPORTUNITY_DESCRIBE,
            Contact: { name: 'Contact' },
        });
    });

    it('skips objects the user cannot read, and fails only when none can be read', async () => {
        const forbidden = response(
            salesforceError('INSUFFICIENT_ACCESS', 'no access'),
            403,
        );
        const partial = connect(
            response(OPPORTUNITY_DESCRIBE),
            forbidden,
            forbidden,
            forbidden,
        );
        expect(
            Object.keys(
                ((await partial.source.discover()).salesforceDescribe ??
                    {}) as Record<string, unknown>,
            ),
        ).toEqual(['Opportunity']);

        const none = connect(forbidden, forbidden, forbidden, forbidden);
        await expect(none.source.discover()).rejects.toThrow('read access');
    });

    it('fails the scan when a describe is throttled, so the last good scan stays', async () => {
        const { source } = connect(
            response(OPPORTUNITY_DESCRIBE),
            response(salesforceError('REQUEST_LIMIT_EXCEEDED', 'limit'), 403),
            response({ name: 'Lead', fields: [] }),
            response({ name: 'Contact', fields: [] }),
        );
        await expect(source.discover()).rejects.toBeInstanceOf(
            TooManyRequestsError,
        );
    });

    it('reports the API calls the org has left today', () => {
        expect(summarizeSalesforceTest(LIMITS_RESPONSE)).toEqual({
            summary: 'Connected to your Salesforce org',
            facts: [
                { label: 'API calls left today', value: '14,820 of 15,000' },
            ],
        });
        expect(summarizeSalesforceTest(OPPORTUNITY_DESCRIBE)).toEqual({
            summary: 'Connected to your Salesforce org',
            facts: [{ label: 'Fields', value: '17' }],
        });
        expect(summarizeSalesforceTest('nope')).toBeNull();
    });
});

describe('salesforceIntegration access', () => {
    it("calls only the org's own My Domain", () => {
        expect(
            isSalesforceInstanceOrigin('https://acme.my.salesforce.com'),
        ).toBe(true);
        for (const origin of [
            'https://login.salesforce.com',
            'https://test.salesforce.com',
            'https://acme.my.salesforce.com.evil.com',
            'http://acme.my.salesforce.com',
            'https://salesforce.com',
            'https://evil.com/.salesforce.com',
            'https://acme.my.salesforce.com:8443',
        ]) {
            expect(isSalesforceInstanceOrigin(origin)).toBe(false);
        }
    });

    it('accepts a signed-in source on a My Domain and refuses other sign-ins', () => {
        const connection = {
            apiSource: SETTINGS,
            type: 'oauth_authorization_code' as const,
            origin: 'https://acme.my.salesforce.com',
            oauthTokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        };
        expect(() =>
            validateLiveConnection(salesforceIntegration, connection),
        ).not.toThrow();
        expect(() =>
            validateLiveConnection(salesforceIntegration, {
                ...connection,
                origin: 'https://acme--uat.sandbox.my.salesforce.com',
                oauthTokenUrl:
                    'https://test.salesforce.com/services/oauth2/token',
            }),
        ).not.toThrow();
        expect(() =>
            validateLiveConnection(salesforceIntegration, {
                ...connection,
                origin: 'https://example.com',
            }),
        ).toThrow(ParameterError);
        expect(() =>
            validateLiveConnection(salesforceIntegration, {
                ...connection,
                type: 'bearer_token',
            }),
        ).toThrow(ParameterError);
        expect(() =>
            validateLiveConnection(salesforceIntegration, {
                ...connection,
                oauthTokenUrl: 'https://example.com/token',
            }),
        ).toThrow(ParameterError);
    });

    it('reads only the query, describe and limits endpoints, with GET', () => {
        expect(salesforceIntegration.connection.access(SETTINGS)).toEqual({
            rules: [
                '/services/data/v62.0/query',
                '/services/data/v62.0/sobjects/Opportunity/describe',
                '/services/data/v62.0/sobjects/Account/describe',
                '/services/data/v62.0/sobjects/Lead/describe',
                '/services/data/v62.0/sobjects/Contact/describe',
                '/services/data/v62.0/limits',
            ].map((path) => ({ method: 'GET', path, effect: 'read' })),
        });
    });
});

describe('toSalesforceError', () => {
    const error = (status: number, code: string) =>
        toSalesforceError(response(salesforceError(code, 'detail'), status));

    it('says what to change', () => {
        expect(error(403, 'REQUEST_LIMIT_EXCEEDED')).toBeInstanceOf(
            TooManyRequestsError,
        );
        expect(error(401, 'INVALID_SESSION_ID')).toBeInstanceOf(
            WarehouseConnectionError,
        );
        expect(error(403, 'INSUFFICIENT_ACCESS').message).toContain(
            'read access',
        );
        expect(error(403, 'API_DISABLED_FOR_ORG').message).toContain(
            'API Enabled',
        );
        expect(error(400, 'QUERY_TIMEOUT')).toBeInstanceOf(WarehouseQueryError);
        expect(error(400, 'INVALID_FIELD').message).toContain('rescan');
        expect(error(400, 'MALFORMED_QUERY')).toBeInstanceOf(
            WarehouseQueryError,
        );
        expect(error(503, 'SERVER_UNAVAILABLE')).toBeInstanceOf(
            UnexpectedServerError,
        );
    });
});
