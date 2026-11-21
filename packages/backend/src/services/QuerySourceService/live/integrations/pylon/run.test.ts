import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { pylonIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';

// Synthetic fixtures only: never paste rows from a real Pylon workspace here.

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(
            pylonIntegration,
            { connector: ApiConnectorType.PYLON },
            send,
        ),
    };
};

const issue = (number: number, overrides: Record<string, unknown> = {}) => ({
    id: `issue-${number}`,
    number,
    title: `Issue ${number}`,
    link: `https://app.usepylon.com/issues?issueNumber=${number}`,
    body_html: '<p>Synthetic</p>',
    state: 'new',
    type: 'conversation',
    source: 'slack',
    is_issue_group: false,
    customer_portal_title: '',
    customer_portal_visible: false,
    account: { id: 'acc-1' },
    assignee: { id: 'user-1', email: 'agent@example.com' },
    requester: { id: 'contact-1', email: 'person@example.org' },
    team: null,
    tags: ['billing', 'urgent'],
    created_at: '2026-11-01T09:30:00Z',
    updated_at: '2026-11-02T10:00:00Z',
    first_response_time: '2026-11-01T10:00:00Z',
    first_response_seconds: 1_800,
    resolution_time: null,
    number_of_touches: 3,
    ...overrides,
});

const page = (data: unknown[], cursor?: string) =>
    response({
        data,
        pagination: { cursor: cursor ?? '', has_next_page: !!cursor },
        request_id: 'request',
    });

const accounts = (...names: [string, string][]) =>
    page(
        names.map(([id, name]) => ({
            id,
            name,
            type: 'customer',
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
            is_disabled: false,
            logo_url: '',
            latest_customer_activity_time: '',
            latest_vendor_activity_time: '',
        })),
    );

const LAST_30_DAYS = {
    field: 'created_at',
    operator: 'time_range',
    values: ['2026-10-18T00:00:00Z', '2026-11-17T00:00:00Z'],
};

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) =>
    source.run({
        query: JSON.stringify({ filters: [], ...request }),
        limit,
    });

describe('pylonIntegration issues', () => {
    it('lists issues over cursor pages, asking only for what is left', async () => {
        const { source, send } = connect(
            page([issue(1), issue(2)], 'next'),
            page([issue(3)]),
        );

        const result = await run(
            source,
            {
                kind: 'issues',
                filters: [LAST_30_DAYS],
                columns: [
                    'number',
                    'tags',
                    'created_at',
                    'first_response_minutes',
                ],
                sort: { field: 'created_at', order: 'desc' },
            },
            5,
        );

        expect(send).toHaveBeenNthCalledWith(1, {
            method: 'POST',
            path: '/issues/search',
            body: {
                filter: LAST_30_DAYS,
                limit: 6,
                sort: [{ field: 'created_at', order: 'desc' }],
            },
        });
        expect(send.mock.calls[1][0].body).toMatchObject({
            cursor: 'next',
            limit: 4,
        });
        expect(result.rows).toEqual([
            {
                number: 1,
                tags: 'billing, urgent',
                created_at: '2026-11-01',
                first_response_minutes: 30,
            },
            {
                number: 2,
                tags: 'billing, urgent',
                created_at: '2026-11-01',
                first_response_minutes: 30,
            },
            {
                number: 3,
                tags: 'billing, urgent',
                created_at: '2026-11-01',
                first_response_minutes: 30,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
        expect(result.columns).toEqual([
            { name: 'number', type: 'number' },
            { name: 'tags', type: 'string' },
            { name: 'created_at', type: 'date' },
            { name: 'first_response_minutes', type: 'number' },
        ]);
    });

    it('says when more issues match than the limit', async () => {
        const { source } = connect(page([issue(1), issue(2)], 'next'));

        const result = await run(
            source,
            { kind: 'issues', columns: ['number'] },
            1,
        );

        expect(result.rows).toEqual([{ number: 1 }]);
        expect(result.hasMoreRows).toBe(true);
    });

    it('filters first response on the rows read, counting only kept rows against the limit', async () => {
        const { source, send } = connect(
            page([
                issue(1, { first_response_seconds: 600 }),
                issue(2, { first_response_seconds: 7_200 }),
                issue(3, { first_response_time: null }),
                issue(4, { first_response_seconds: 9_000 }),
                issue(5, { first_response_seconds: 6_000 }),
            ]),
        );

        const result = await run(
            source,
            {
                kind: 'issues',
                columns: ['number', 'first_response_minutes'],
                localFilters: [
                    {
                        column: 'first_response_minutes',
                        operator: 'greater_than',
                        value: 90,
                    },
                ],
            },
            2,
        );

        expect(send.mock.calls[0][0].body.limit).toBe(1_000);
        expect(result.rows).toEqual([
            { number: 2, first_response_minutes: 120 },
            { number: 4, first_response_minutes: 150 },
        ]);
        expect(result.hasMoreRows).toBe(true);
    });

    it('applies null checks on the rows read, whatever Pylon returns', async () => {
        const { source } = connect(
            page([
                issue(1),
                issue(2, { account: null }),
                issue(3, { account: null, assignee: null }),
            ]),
        );

        const result = await run(source, {
            kind: 'issues',
            columns: ['number'],
            localFilters: [
                { column: 'account_id', operator: 'is_null' },
                { column: 'assignee_id', operator: 'is_not_null' },
            ],
        });

        expect(result.rows).toEqual([{ number: 2 }]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('returns no rows when no issues match', async () => {
        const { source } = connect(page([]));

        const result = await run(source, {
            kind: 'issues',
            columns: ['number'],
        });

        expect(result.rows).toEqual([]);
        expect(result.hasMoreRows).toBe(false);
    });

    it('names accounts with one lookup of the accounts read', async () => {
        const { source, send } = connect(
            page([
                issue(1),
                issue(2, { account: { id: 'acc-2' } }),
                issue(3, { account: null }),
            ]),
            accounts(['acc-1', 'Example Co'], ['acc-2', 'Sample Ltd']),
        );

        const result = await run(source, {
            kind: 'issues',
            columns: ['number', 'account_name'],
        });

        expect(send.mock.calls[1][0]).toEqual({
            method: 'POST',
            path: '/accounts/search',
            body: {
                filter: {
                    field: 'account_id',
                    operator: 'in',
                    values: ['acc-1', 'acc-2'],
                },
                limit: 1_000,
            },
        });
        expect(result.rows).toEqual([
            { number: 1, account_name: 'Example Co' },
            { number: 2, account_name: 'Sample Ltd' },
            { number: 3, account_name: null },
        ]);
    });

    it('filters by account name and assignee email through their IDs', async () => {
        const { source, send } = connect(
            accounts(['acc-1', 'Example Co']),
            response({
                data: [
                    { id: 'user-1', email: 'agent@example.com' },
                    {
                        id: 'user-2',
                        email: 'other@example.com',
                        emails: ['alias@example.com'],
                    },
                ],
                request_id: 'request',
            }),
            page([issue(1)]),
        );

        await run(source, {
            kind: 'issues',
            filters: [
                {
                    field: 'account_name',
                    operator: 'in',
                    values: ['Example Co'],
                },
                {
                    field: 'assignee_email',
                    operator: 'not_in',
                    values: ['ALIAS@example.com'],
                },
            ],
            columns: ['number'],
        });

        expect(send.mock.calls[0][0].body.filter).toEqual({
            field: 'name',
            operator: 'in',
            values: ['Example Co'],
        });
        expect(send.mock.calls[1][0]).toMatchObject({
            method: 'GET',
            path: '/users',
        });
        expect(send.mock.calls[2][0].body.filter).toEqual({
            operator: 'and',
            subfilters: [
                { field: 'account_id', operator: 'in', values: ['acc-1'] },
                {
                    field: 'assignee_id',
                    operator: 'not_in',
                    values: ['user-2'],
                },
            ],
        });
    });

    it('answers without searching issues when no account has the name', async () => {
        const { source, send } = connect(accounts());

        const result = await run(source, {
            kind: 'issues',
            filters: [
                { field: 'account_name', operator: 'in', values: ['Missing'] },
            ],
            columns: ['number'],
        });

        expect(send).toHaveBeenCalledTimes(1);
        expect(result.rows).toEqual([]);
    });
});

describe('pylonIntegration people', () => {
    it('reads assignee emails from the teammates', async () => {
        const { source, send } = connect(
            page([
                issue(1, { assignee: { id: 'user-1' } }),
                issue(2, { assignee: null }),
            ]),
            response({
                data: [{ id: 'user-1', email: 'agent@example.com' }],
                request_id: 'request',
            }),
        );

        const result = await run(source, {
            kind: 'issues',
            columns: ['number', 'assignee_email'],
        });

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0]).toMatchObject({
            method: 'GET',
            path: '/users',
        });
        expect(result.rows).toEqual([
            { number: 1, assignee_email: 'agent@example.com' },
            { number: 2, assignee_email: null },
        ]);
    });

    it('reads account owner emails from the teammates', async () => {
        const { source } = connect(
            accounts(['acc-1', 'Example Co']),
            response({ data: [], request_id: 'request' }),
        );

        const result = await run(source, {
            kind: 'accounts',
            columns: ['name', 'owner_email'],
        });

        expect(result.rows).toEqual([
            { name: 'Example Co', owner_email: null },
        ]);
    });

    it('makes no extra calls when no name column is asked for', async () => {
        const { source, send } = connect(page([issue(1)]));

        await run(source, {
            kind: 'issues',
            columns: ['number', 'account_id'],
        });

        expect(send).toHaveBeenCalledTimes(1);
    });
});

describe('pylonIntegration accounts and contacts', () => {
    it('lists accounts', async () => {
        const { source, send } = connect(
            page([
                {
                    id: 'acc-1',
                    name: 'Example Co',
                    domain: 'example.com',
                    primary_domain: null,
                    type: 'customer',
                    owner: { id: 'user-1', email: 'owner@example.com' },
                    tags: null,
                    created_at: '2025-03-04T05:06:07Z',
                    updated_at: '2025-03-04T05:06:07Z',
                    is_disabled: false,
                    logo_url: '',
                    latest_customer_activity_time: '2026-11-10T08:00:00Z',
                    latest_vendor_activity_time: '',
                },
            ]),
            response({
                data: [{ id: 'user-1', email: 'owner@example.com' }],
                request_id: 'request',
            }),
        );

        const result = await run(source, {
            kind: 'accounts',
            columns: [
                'name',
                'domain',
                'owner_email',
                'tags',
                'created_at',
                'last_customer_activity_at',
                'last_vendor_activity_at',
            ],
            sort: { field: 'name', order: 'asc' },
        });

        expect(send.mock.calls[0][0].path).toBe('/accounts/search');
        expect(result.rows).toEqual([
            {
                name: 'Example Co',
                domain: 'example.com',
                owner_email: 'owner@example.com',
                tags: null,
                created_at: '2025-03-04',
                last_customer_activity_at: '2026-11-10',
                last_vendor_activity_at: null,
            },
        ]);
    });

    it('names the account of each contact', async () => {
        const contact = (id: string, accountId: string | null) => ({
            id,
            name: `Contact ${id}`,
            email: `${id}@example.org`,
            avatar_url: '',
            portal_role: 'member',
            account: accountId ? { id: accountId } : null,
        });
        const { source, send } = connect(
            page([
                contact('c1', 'acc-1'),
                contact('c2', 'acc-1'),
                contact('c3', null),
            ]),
            accounts(['acc-1', 'Example Co']),
        );

        const result = await run(source, {
            kind: 'contacts',
            columns: ['name', 'account_name'],
        });

        expect(send.mock.calls[0][0].path).toBe('/contacts/search');
        expect(result.rows).toEqual([
            { name: 'Contact c1', account_name: 'Example Co' },
            { name: 'Contact c2', account_name: 'Example Co' },
            { name: 'Contact c3', account_name: null },
        ]);
    });
});

describe('pylonIntegration requests and errors', () => {
    it.each([
        [
            { kind: 'issues', columns: ['nope'] },
            '"nope" isn\'t a issues column',
        ],
        [
            {
                kind: 'contacts',
                columns: ['name'],
                sort: { field: 'name', order: 'asc' },
            },
            'Pylon sorts contacts by nothing',
        ],
        [
            {
                kind: 'issues',
                columns: ['number'],
                filters: [
                    {
                        field: 'account_name',
                        operator: 'equals',
                        value: 'Example Co',
                    },
                ],
            },
            'account_name takes "in" or "not_in"',
        ],
        [{ kind: 'issues', columns: [] }, 'Ask for at least one column'],
        [
            {
                kind: 'issues',
                columns: ['number'],
                filters: [
                    {
                        operator: 'or',
                        subfilters: [
                            {
                                field: 'assignee_email',
                                operator: 'in',
                                values: ['agent@example.com'],
                            },
                        ],
                    },
                ],
            },
            'assignee_email can\'t be inside an "and" or "or" group',
        ],
    ])('refuses a malformed request %#', async (request, message) => {
        const { source, send } = connect();
        await expect(run(source, request)).rejects.toThrow(message);
        await expect(run(source, request)).rejects.toBeInstanceOf(
            ParameterError,
        );
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses a limit past what one query reads', async () => {
        const { source } = connect();
        await expect(
            run(source, { kind: 'issues', columns: ['number'] }, 10_000),
        ).rejects.toBeInstanceOf(ParameterError);
    });

    it.each([
        [
            response({ errors: ['Invalid API token!'] }, 401),
            WarehouseConnectionError,
            'Pylon rejected the API token: Invalid API token. Ask',
        ],
        [
            response({ message: 'forbidden' }, 403),
            WarehouseConnectionError,
            'created by admins',
        ],
        [
            response({}, 429, { 'retry-after': '12' }),
            TooManyRequestsError,
            'retry in 12 seconds',
        ],
        [
            response({ errors: ['unknown field "nope"'] }, 400),
            WarehouseQueryError,
            'Pylon couldn\'t run this search: unknown field "nope"',
        ],
        [
            response('upstream down', 502),
            UnexpectedServerError,
            'Pylon returned 502',
        ],
    ])('explains a failed call %#', async (failed, errorClass, message) => {
        const { source } = connect(failed);
        const result = run(source, { kind: 'issues', columns: ['number'] });
        await expect(result).rejects.toBeInstanceOf(errorClass);
        await expect(
            run(connect(failed).source, {
                kind: 'issues',
                columns: ['number'],
            }),
        ).rejects.toThrow(message);
    });

    it('refuses a response in an unexpected shape', async () => {
        const { source } = connect(response({ items: [] }));
        await expect(
            run(source, { kind: 'issues', columns: ['number'] }),
        ).rejects.toThrow();
    });
});
