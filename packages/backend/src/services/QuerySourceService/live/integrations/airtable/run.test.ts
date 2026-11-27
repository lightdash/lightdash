import {
    ApiConnectorType,
    ParameterError,
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { airtableIntegration } from '.';
import { findAccessRule } from '../../integration';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import {
    BASE_ID,
    BASE_SCHEMA,
    PEOPLE_TABLE,
    PEOPLE_TABLE_ID,
    TABLE_ID,
    TICKETS_TABLE,
} from './airtable.fixtures';
import { summarizeAirtableTest } from './connection';
import { AIRTABLE_MAX_QUERY_ROWS, toAirtableQuery } from './run';

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
        source: connectLiveSource(
            airtableIntegration,
            {
                connector: ApiConnectorType.AIRTABLE,
                baseId: BASE_ID,
            },
            send,
        ),
    };
};

const run = (
    source: ReturnType<typeof connect>['source'],
    request: Record<string, unknown>,
    limit = 10,
) =>
    source.run({
        query: JSON.stringify({ read: 'records', table: TABLE_ID, ...request }),
        limit,
    });

const records = (count: number, start = 0) =>
    Array.from({ length: count }, (_, index) => ({
        id: `rec${String(start + index).padStart(14, '0')}`,
        createdTime: '2026-11-01T10:00:00.000Z',
        fields: {
            Name: `Ticket ${start + index}`,
            Assignee: { id: 'usr1', email: 'a@example.com', name: 'Ada' },
            Tags: ['P1', 'Login'],
            Points: 3,
        },
    }));

describe('toAirtableQuery', () => {
    it('lists fields and sorts as indexed parameters', () => {
        expect(
            toAirtableQuery({
                read: 'records',
                table: TABLE_ID,
                fields: ['$id', 'Name', 'Status'],
                filterByFormula: '{Status} = "Open"',
                sort: [{ field: 'Status', direction: 'desc' }],
                view: 'Grid view',
            }),
        ).toEqual({
            'fields[0]': 'Name',
            'fields[1]': 'Status',
            filterByFormula: '{Status} = "Open"',
            'sort[0][field]': 'Status',
            'sort[0][direction]': 'desc',
            view: 'Grid view',
        });
    });
});

describe('runAirtableQuery', () => {
    it('reads records, flattening people, lists and record columns', async () => {
        const { source, send } = connect(response({ records: records(2) }));
        const result = await run(source, {
            fields: [
                '$id',
                '$createdTime',
                'Name',
                'Assignee',
                'Tags',
                'Points',
                'Missing',
            ],
        });
        expect(result.rows[0]).toEqual({
            $id: 'rec00000000000000',
            $createdTime: '2026-11-01T10:00:00.000Z',
            Name: 'Ticket 0',
            Assignee: 'Ada',
            Tags: 'P1, Login',
            Points: 3,
            Missing: null,
        });
        expect(result.columns.map(({ type }) => type)).toEqual([
            'string',
            'timestamp',
            'string',
            'string',
            'string',
            'number',
            'string',
        ]);
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                path: `/v0/${BASE_ID}/${TABLE_ID}`,
                query: expect.objectContaining({ pageSize: '11' }),
            }),
        );
    });

    it('reads an unticked checkbox, which Airtable leaves out, as false', async () => {
        const { source } = connect(
            response({
                records: [
                    { ...records(1)[0], fields: { Resolved: true } },
                    records(1)[0],
                ],
            }),
        );
        const result = await run(source, {
            fields: ['Resolved'],
            checkboxes: ['Resolved'],
        });
        expect(result.rows).toEqual([{ Resolved: true }, { Resolved: false }]);
        expect(result.columns).toEqual([{ name: 'Resolved', type: 'boolean' }]);
    });

    it('follows the offset token across pages', async () => {
        const { source, send } = connect(
            response({ records: records(100), offset: 'itr1/rec1' }),
            response({ records: records(20, 100) }),
        );
        const result = await run(source, { fields: ['Name'] }, 500);
        expect(result.rows).toHaveLength(120);
        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1][0].query).toMatchObject({
            offset: 'itr1/rec1',
        });
    });

    it('reads another table of the base by its id', async () => {
        const { source, send } = connect(response({ records: records(1) }));
        await run(source, { table: PEOPLE_TABLE_ID, fields: ['Name'] });
        expect(send.mock.calls[0][0].path).toBe(
            `/v0/${BASE_ID}/${PEOPLE_TABLE_ID}`,
        );
    });

    it('refuses a table that is not an id', async () => {
        const { source, send } = connect();
        await expect(
            run(source, { table: '../meta/whoami', fields: ['Name'] }),
        ).rejects.toThrow(ParameterError);
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses a sort Airtable cannot run and a limit past the cap', async () => {
        const { source } = connect();
        await expect(
            run(source, {
                fields: ['Name'],
                sort: [{ field: '$createdTime', direction: 'asc' }],
            }),
        ).rejects.toThrow(ParameterError);
        await expect(
            run(source, { fields: ['Name'] }, AIRTABLE_MAX_QUERY_ROWS + 2),
        ).rejects.toThrow();
    });

    it.each([
        [429, TooManyRequestsError],
        [401, WarehouseConnectionError],
        [403, WarehouseConnectionError],
        [422, WarehouseQueryError],
    ])('explains a %s', async (status, ErrorType) => {
        const { source } = connect(
            response(
                {
                    error: {
                        type: 'INVALID_FILTER_BY_FORMULA',
                        message: 'Invalid formula',
                    },
                },
                status,
            ),
        );
        await expect(run(source, { fields: ['Name'] })).rejects.toThrow(
            ErrorType,
        );
    });
});

describe('scan', () => {
    it('keeps every table of the base, the way the metadata stores it', async () => {
        const { source, send } = connect(response(BASE_SCHEMA));
        const scanned = (await source.scan()) as {
            tables: { id: string; fields: unknown[] }[];
        };
        expect(
            scanned.tables.map(({ id, fields }) => [id, fields.length]),
        ).toEqual([
            [TICKETS_TABLE.id, TICKETS_TABLE.fields.length],
            [PEOPLE_TABLE.id, PEOPLE_TABLE.fields.length],
        ]);
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                path: `/v0/meta/bases/${BASE_ID}/tables`,
            }),
        );
    });

    it('adds one explore per table, named by its id', async () => {
        const { source } = connect(response(BASE_SCHEMA));
        const explores = await source.discover();
        expect(
            explores.map(({ name, apiName, label }) => [name, apiName, label]),
        ).toEqual([
            ['tables', undefined, 'Tables'],
            [TABLE_ID.toLowerCase(), TABLE_ID, 'Tickets'],
            [PEOPLE_TABLE_ID.toLowerCase(), PEOPLE_TABLE_ID, 'People'],
        ]);
        const people = explores.find(
            ({ apiName }) => apiName === PEOPLE_TABLE_ID,
        );
        expect(
            people?.dimensions.map(({ name, apiName, type }) => [
                name,
                apiName,
                type,
            ]),
        ).toEqual([
            ['record_id', '$id', 'string'],
            ['created_time', '$createdTime', 'timestamp'],
            ['full_name', 'Full Name', 'string'],
            ['joined', 'Joined', 'date'],
            ['score', 'Score', 'number'],
        ]);
    });
});

describe('tables explore', () => {
    it('lists the base tables with their primary field and field count', async () => {
        const { source } = connect(response(BASE_SCHEMA));
        const result = await source.run({
            query: JSON.stringify({
                read: 'tables',
                fields: ['id', 'name', 'primaryField', 'fieldCount'],
            }),
            limit: 10,
        });
        expect(result.rows).toEqual([
            {
                id: TABLE_ID,
                name: 'Tickets',
                primaryField: 'Name',
                fieldCount: 11,
            },
            {
                id: PEOPLE_TABLE_ID,
                name: 'People',
                primaryField: null,
                fieldCount: 4,
            },
        ]);
    });
});

describe('access', () => {
    const settings = {
        connector: ApiConnectorType.AIRTABLE,
        baseId: BASE_ID,
    } as const;
    const allows = (rules: { path: string }[], path: string) =>
        findAccessRule(rules as never, { method: 'GET', path }) !== undefined;

    it('reads the base schema and the tables of its explores only', async () => {
        const { source } = connect(response(BASE_SCHEMA));
        const { rules } = airtableIntegration.connection.access(
            settings,
            await source.discover(),
        );
        expect(allows(rules, `/v0/meta/bases/${BASE_ID}/tables`)).toBe(true);
        expect(allows(rules, `/v0/${BASE_ID}/${TABLE_ID}`)).toBe(true);
        expect(allows(rules, `/v0/${BASE_ID}/${PEOPLE_TABLE_ID}`)).toBe(true);
        expect(allows(rules, `/v0/${BASE_ID}/tblOtherOtherOthe`)).toBe(false);
        expect(allows(rules, `/v0/appOtherOtherOthe/${TABLE_ID}`)).toBe(false);
        expect(allows(rules, '/v0/meta/bases')).toBe(false);
        expect(
            findAccessRule(rules, {
                method: 'POST',
                path: `/v0/${BASE_ID}/${TABLE_ID}`,
            }),
        ).toBeUndefined();
    });

    it('reads only the base schema before the first Refresh', () => {
        const { rules } = airtableIntegration.connection.access(
            settings,
            airtableIntegration.model.explores,
        );
        expect(rules.map(({ path }) => path)).toEqual([
            `/v0/meta/bases/${BASE_ID}/tables`,
        ]);
    });
});

describe('summarizeAirtableTest', () => {
    it('names the tables and counts them', () => {
        expect(summarizeAirtableTest(BASE_SCHEMA)).toEqual({
            summary: 'Connected to the base: Tickets, People',
            facts: [{ label: 'Tables', value: '2' }],
        });
    });
});
