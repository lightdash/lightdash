import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { attioIntegration } from '.';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { ATTIO_DEAL_ATTRIBUTES, attioDeal } from './attio.fixtures';
import { toAttioError } from './errors';
import { ATTIO_MAX_RECORDS, ATTIO_PAGE_SIZE } from './explores';

const response = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
): LiveHttpResponse => ({ status, headers, body });

const page = (records: unknown[]) => response({ data: records });

const SETTINGS = {
    connector: ApiConnectorType.ATTIO,
    object: 'deals',
} as const;

const connect = (...responses: LiveHttpResponse[]) => {
    const send = vi.fn();
    responses.forEach((item) => send.mockResolvedValueOnce(item));
    return {
        send,
        source: connectLiveSource(attioIntegration, SETTINGS, send),
    };
};

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) => source.run({ query: JSON.stringify(request), limit });

const deals = (count: number, from = 0) =>
    Array.from({ length: count }, (_, index) => attioDeal(`d${from + index}`));

describe('attioIntegration listing', () => {
    it('reads each column from the property its type keeps the value in', async () => {
        const { source, send } = connect(page([attioDeal('d1')]));

        const result = await run(source, {
            columns: [
                'record_id',
                'web_url',
                'created_at',
                'name',
                'stage.status',
                'value.currency_value',
                'probability',
                'close_date',
                'is_won',
                'categories.option',
                'owner.referenced_actor_id',
                'associated_company.target_record_id',
                'point_of_contact.full_name',
                'contact_email.email_address',
                'missing_attribute',
            ],
            filter: { stage: 'Won' },
            sorts: [{ attribute: 'name', direction: 'asc' }],
        });

        expect(send).toHaveBeenCalledWith({
            method: 'POST',
            path: '/v2/objects/deals/records/query',
            body: {
                filter: { stage: 'Won' },
                sorts: [{ attribute: 'name', direction: 'asc' }],
                limit: 11,
                offset: 0,
            },
        });
        expect(result.rows).toEqual([
            {
                record_id: 'd1',
                web_url: 'https://app.attio.com/acme/deals/d1',
                created_at: '2026-11-12',
                name: 'Deal d1',
                'stage.status': 'Won',
                'value.currency_value': 1000,
                probability: 0.5,
                close_date: '2026-12-01',
                is_won: true,
                'categories.option': 'Enterprise, EMEA',
                'owner.referenced_actor_id': 'member-1',
                'associated_company.target_record_id': 'company-1',
                'point_of_contact.full_name': 'Ada Lovelace',
                // Only the current email; the replaced one has ended
                'contact_email.email_address': 'ada@example.com',
                missing_attribute: null,
            },
        ]);
        expect(result.hasMoreRows).toBe(false);
        expect(
            Object.fromEntries(
                result.columns.map(({ name, type }) => [name, type]),
            ),
        ).toMatchObject({
            created_at: 'date',
            'value.currency_value': 'number',
            is_won: 'boolean',
            close_date: 'date',
            name: 'string',
        });
    });

    it('pages with offsets and reports rows past the limit', async () => {
        const { source, send } = connect(
            page(deals(ATTIO_PAGE_SIZE)),
            page(deals(101, ATTIO_PAGE_SIZE)),
        );

        const result = await run(source, { columns: ['record_id'] }, 600);

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].body).toEqual({
            limit: 101,
            offset: ATTIO_PAGE_SIZE,
        });
        expect(result.rows).toHaveLength(600);
        expect(result.hasMoreRows).toBe(true);
    });

    it('refuses to list more rows than one query can read, before calling', async () => {
        const { source, send } = connect();
        await expect(
            run(source, { columns: ['record_id'] }, ATTIO_MAX_RECORDS + 1),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses a column that is not an attribute, before calling', async () => {
        const { source, send } = connect();
        await expect(
            run(source, { columns: ['name.secret_property'] }),
        ).rejects.toThrow('columns are attribute slugs');
        expect(send).not.toHaveBeenCalled();
    });

    it('fails clearly when Attio answers in an unexpected shape', async () => {
        const { source } = connect(response({ records: [] }));
        await expect(run(source, { columns: ['name'] })).rejects.toThrow();
    });
});

describe('attioIntegration scan', () => {
    it('reads the attributes of the source object', async () => {
        const { source, send } = connect(response(ATTIO_DEAL_ATTRIBUTES));

        const scan = await source.scan();

        expect(send).toHaveBeenCalledWith({
            method: 'GET',
            path: '/v2/objects/deals/attributes',
            body: undefined,
        });
        expect(scan).toEqual({ attioAttributes: ATTIO_DEAL_ATTRIBUTES });
    });
});

describe('toAttioError', () => {
    const error = (status: number, headers: Record<string, string> = {}) =>
        toAttioError(
            response(
                { status_code: status, code: 'x', message: 'Nope' },
                status,
                headers,
            ),
            SETTINGS,
            new Date('2026-11-17T12:00:00Z'),
        );

    it('says when to retry after a rate limit', () => {
        const rateLimited = error(429, {
            'retry-after': 'Tue, 17 Nov 2026 12:00:03 GMT',
        });
        expect(rateLimited).toBeInstanceOf(TooManyRequestsError);
        expect(rateLimited.message).toContain('retry in 3 seconds');
    });

    it('names what to fix for token, scope and object problems', () => {
        expect(error(401)).toBeInstanceOf(WarehouseConnectionError);
        expect(error(401).message).toContain('Create a new token');
        expect(error(403).message).toContain('record_permission:read');
        expect(error(404).message).toContain('Attio has no object "deals"');
    });

    it('explains a rejected query and an Attio outage', () => {
        expect(error(400)).toBeInstanceOf(WarehouseQueryError);
        expect(error(400).message).toContain(
            "Attio couldn't run this query: Nope",
        );
        expect(error(503)).toBeInstanceOf(UnexpectedServerError);
    });

    it('is what a failed call throws', async () => {
        const { source } = connect(response({ message: 'Nope' }, 404));
        await expect(run(source, { columns: ['name'] })).rejects.toBeInstanceOf(
            WarehouseConnectionError,
        );
    });
});
