import {
    ApiConnectorType,
    SupportedDbtAdapter,
    TooManyRequestsError,
    type MetricQuery,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { attioIntegration } from '.';
import { buildLiveExplore } from '../../explores/definition';
import { findAccessRule } from '../../integration';
import { connectLiveSource } from '../../liveSource.mock';
import { type LiveHttpResponse } from '../../types';
import { ATTIO_DEAL_ATTRIBUTES, attioDeal } from './attio.fixtures';
import { compileAttioQuery } from './compile';
import { ATTIO_EXPLORES } from './model';

const SETTINGS = { connector: ApiConnectorType.ATTIO } as const;

const response = (body: unknown, status = 200): LiveHttpResponse => ({
    status,
    headers: {},
    body,
});

const object = (slug: string | null, singular: string, plural: string) => ({
    id: { workspace_id: 'workspace', object_id: `object-${slug}` },
    api_slug: slug,
    singular_noun: singular,
    plural_noun: plural,
    created_at: '2026-01-01T00:00:00.000000000Z',
});

const OBJECTS = response({
    data: [
        object('companies', 'Company', 'Companies'),
        object('people', 'Person', 'People'),
        object('organizations', 'Organization', 'Organizations'),
        object('Bad Slug', 'Bad', 'Bads'),
        object(null, 'No slug', 'No slugs'),
    ],
});

/** Answers each call by its path; attributes are the deal fixture's. */
const connect = (
    objects: LiveHttpResponse,
    attributes = ATTIO_DEAL_ATTRIBUTES,
) => {
    const send = vi.fn((call: { path: string }) =>
        Promise.resolve(
            call.path === '/v2/objects' ? objects : response(attributes),
        ),
    );
    return {
        send,
        source: connectLiveSource(attioIntegration, SETTINGS, send),
    };
};

describe('Attio custom objects', () => {
    it('offers each custom object as an explore that starts off', async () => {
        const { source, send } = connect(OBJECTS);

        const explores = await source.discover();

        expect(send.mock.calls.map(([call]) => call.path)).toContain(
            '/v2/objects/organizations/attributes',
        );
        expect(explores.map(({ name }) => name)).toEqual([
            ...ATTIO_EXPLORES.map(({ name }) => name),
            'organizations',
        ]);
        const organizations = explores.at(-1)!;
        expect(organizations).toMatchObject({
            name: 'organizations',
            apiName: 'organizations',
            label: 'Organizations',
            onByDefault: false,
        });
        expect(
            organizations.dimensions.map(({ name, onByDefault }) => [
                name,
                onByDefault ?? true,
            ]),
        ).toEqual(
            expect.arrayContaining([
                ['record_id', true],
                ['web_url', true],
                ['created_at', true],
                ['name', true],
                ['stage', true],
                ['stage__entered_at', true],
                ['owner__name', true],
                // Reference ids start hidden, as on the standard objects
                ['associated_company', false],
                ['owner', false],
            ]),
        );
    });

    it("offers none when the token can't list objects", async () => {
        const { source } = connect(response({ message: 'Forbidden' }, 403));

        const explores = await source.discover();

        expect(explores.map(({ name }) => name)).toEqual(
            ATTIO_EXPLORES.map(({ name }) => name),
        );
    });

    it('fails on a throttled objects call, so the last good scan stays', async () => {
        const { source } = connect(response({ message: 'Slow down' }, 429));

        await expect(source.discover()).rejects.toBeInstanceOf(
            TooManyRequestsError,
        );
    });

    it('keeps the attributes a scan stored before custom objects', async () => {
        const { source } = connect(response({ data: [] }));
        const metadata = (await source.scan()) as Record<string, unknown>;

        const extension = attioIntegration.model.extend!({
            attributes: metadata.attributes,
        });

        expect(Object.keys(extension.fields ?? {})).toEqual(
            ATTIO_EXPLORES.map(({ name }) => name),
        );
        expect(extension.explores).toEqual([]);
    });

    it("lets a source query a custom object's records only once a Refresh offered it", async () => {
        const { source } = connect(OBJECTS);
        const explores = await source.discover();
        const before = attioIntegration.connection.access(
            SETTINGS,
            ATTIO_EXPLORES,
        ).rules;
        const after = attioIntegration.connection.access(
            SETTINGS,
            explores,
        ).rules;
        const queryRecords = {
            method: 'POST' as const,
            path: '/v2/objects/organizations/records/query',
        };

        expect(findAccessRule(before, queryRecords)).toBeUndefined();
        expect(findAccessRule(after, queryRecords)).toMatchObject({
            exact: true,
            entry: 'organizations',
        });
        expect(
            findAccessRule(after, {
                method: 'POST',
                path: '/v2/objects/secrets/records/query',
            }),
        ).toBeUndefined();
        // A Refresh reads any object's attributes, and nothing under them
        expect(
            findAccessRule(before, {
                method: 'GET',
                path: '/v2/objects/organizations/attributes',
            }),
        ).toBeDefined();
        expect(
            findAccessRule(before, {
                method: 'GET',
                path: '/v2/objects/organizations/attributes/name/options',
            }),
        ).toBeUndefined();
    });

    it("queries a custom object's records by its slug", async () => {
        const { source } = connect(OBJECTS);
        const definition = (await source.discover()).at(-1)!;
        const explore = buildLiveExplore({
            definition,
            exploreName: 'attio_organizations',
            label: 'Attio organizations',
            connectionUuid: 'connection-uuid',
            integration: ApiConnectorType.ATTIO,
            baseVersion: 1,
            capabilities: attioIntegration.query.capabilities,
            warehouseSqlBuilder: warehouseSqlBuilderFromType(
                SupportedDbtAdapter.DUCKDB,
            ),
        });
        const metricQuery: MetricQuery = {
            exploreName: explore.name,
            dimensions: [
                'attio_organizations_record_id',
                'attio_organizations_name',
            ],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
        };

        const { query } = compileAttioQuery({
            explore,
            metricQuery,
            today: '2026-11-27',
        });

        expect(JSON.parse(query)).toEqual({
            object: 'organizations',
            columns: ['record_id', 'name'],
        });

        const send = vi
            .fn()
            .mockResolvedValue(response({ data: [attioDeal('o1')] }));
        const result = await connectLiveSource(
            attioIntegration,
            SETTINGS,
            send,
        ).run({ query, limit: 10 });

        expect(send.mock.calls[0][0].path).toBe(
            '/v2/objects/organizations/records/query',
        );
        expect(result.rows).toEqual([
            { record_id: 'o1', name: expect.any(String) },
        ]);
    });

    it('refuses a request for an object that is not a slug', async () => {
        const send = vi.fn();

        await expect(
            connectLiveSource(attioIntegration, SETTINGS, send).run({
                query: JSON.stringify({
                    object: '../workspace_members',
                    columns: ['record_id'],
                }),
                limit: 10,
            }),
        ).rejects.toThrow('object must be an Attio object slug');
        expect(send).not.toHaveBeenCalled();
    });
});
