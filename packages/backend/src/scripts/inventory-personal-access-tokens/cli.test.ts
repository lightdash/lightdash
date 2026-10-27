import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    formatReport,
    INVENTORY_NOTICE,
    parseArguments,
    run,
    type InventoryReport,
} from './cli';

const before = '2026-10-26T00:00:00.000Z';
const organizationUuid = 'a93fbb7e-b0ba-46e4-b00b-74ed42b96a18';

describe('parseArguments', () => {
    it('requires a cutoff and defaults to JSON with all organizations', () => {
        expect(parseArguments(['--before', before])).toEqual({
            before,
            organizationUuid: null,
            format: 'json',
        });
    });

    it('accepts an organization, CSV and a timezone offset', () => {
        expect(
            parseArguments([
                '--format',
                'csv',
                '--organization',
                organizationUuid,
                '--before',
                '2026-10-26T01:00:00+01:00',
            ]),
        ).toEqual({ before, organizationUuid, format: 'csv' });
    });

    it.each([
        [],
        ['--before'],
        ['--before', 'not-a-date'],
        ['--before', '2026-02-30T00:00:00Z'],
        ['--before', '2026-10-26'],
        ['--before', '2026-10-26T00:00:00'],
        ['--before', before, '--before', before],
        ['--before', before, '--organization'],
        ['--before', before, '--organization', 'not-a-uuid'],
        ['--before', before, '--format'],
        ['--before', before, '--format', 'xml'],
        ['--before', before, '--description', 'cli'],
        ['--before', before, '--execute'],
    ])('rejects invalid arguments %j', (...argv) => {
        expect(() => parseArguments(argv)).toThrow();
    });
});

const database = knex({ client: MockClient, dialect: 'pg' });
let tracker: Tracker;
beforeAll(() => {
    tracker = getTracker();
});
afterEach(() => tracker.reset());
afterAll(async () => database.destroy());

describe('run', () => {
    it.each([null, organizationUuid])(
        'only reads tokens created before the cutoff, organization %s',
        async (organization) => {
            tracker.on.select('personal_access_tokens').response([
                {
                    personal_access_token_uuid: 'token-uuid',
                    organization_uuid: organization,
                    user_uuid: 'user-uuid',
                    created_at: new Date('2026-01-01T00:00:00Z'),
                    expires_at: new Date('2026-02-01T00:00:00Z'),
                    rotated_at: new Date('2026-03-01T00:00:00Z'),
                    last_used_at: new Date('2026-04-01T00:00:00Z'),
                    description: 'Unrelated description',
                    token_hash: 'never-output-this-hash',
                },
            ]);
            const report = await run(database, {
                before,
                organizationUuid: organization,
                format: 'json',
            });
            const queries = tracker.history.all;
            expect(queries).toHaveLength(1);
            const [query] = queries;
            expect(query.method).toBe('select');
            expect(query.sql).toContain(
                '"personal_access_tokens"."created_at" < $1',
            );
            expect(query.sql).toContain(
                '"users"."user_id" = "personal_access_tokens"."created_by_user_id"',
            );
            expect(query.sql).toContain(
                'left join "organization_memberships" on "organization_memberships"."user_id" = "users"."user_id"',
            );
            expect(query.sql).toContain(
                'left join "organizations" on "organizations"."organization_id" = "organization_memberships"."organization_id"',
            );
            expect(query.bindings).toEqual(
                organization ? [before, organization] : [before],
            );
            expect(query.sql.split(' where ')[1].split(' order by ')[0]).toBe(
                `"personal_access_tokens"."created_at" < $1${
                    organization
                        ? ' and "organizations"."organization_uuid" = $2'
                        : ''
                }`,
            );
            expect(query.sql).not.toMatch(/token_hash|select \*/);
            expect(report).toEqual({
                notice: INVENTORY_NOTICE,
                tokens: [
                    {
                        personal_access_token_uuid: 'token-uuid',
                        organization_uuid: organization,
                        user_uuid: 'user-uuid',
                        created_at: '2026-01-01T00:00:00.000Z',
                        expires_at: '2026-02-01T00:00:00.000Z',
                        rotated_at: '2026-03-01T00:00:00.000Z',
                        last_used_at: '2026-04-01T00:00:00.000Z',
                        description: 'Unrelated description',
                    },
                ],
            });
        },
    );

    it('returns an empty inventory with the caveat', async () => {
        tracker.on.select('personal_access_tokens').response([]);
        expect(
            await run(database, {
                before,
                organizationUuid: null,
                format: 'json',
            }),
        ).toEqual({ notice: INVENTORY_NOTICE, tokens: [] });
    });

    it('preserves absent timestamps and organization membership', async () => {
        tracker.on.select('personal_access_tokens').response([
            {
                personal_access_token_uuid: 'token-uuid',
                organization_uuid: null,
                user_uuid: 'user-uuid',
                created_at: new Date(before),
                expires_at: null,
                rotated_at: null,
                last_used_at: null,
                description: '',
            },
        ]);
        const report = await run(database, {
            before,
            organizationUuid: null,
            format: 'json',
        });
        expect(report.tokens[0]).toMatchObject({
            organization_uuid: null,
            expires_at: null,
            rotated_at: null,
            last_used_at: null,
        });
    });
});

describe('formatReport', () => {
    const report: InventoryReport = {
        notice: INVENTORY_NOTICE,
        tokens: [
            {
                personal_access_token_uuid: 'token-uuid',
                organization_uuid: null,
                user_uuid: 'user-uuid',
                created_at: before,
                expires_at: null,
                rotated_at: null,
                last_used_at: null,
                description: 'comma, "quote"\nnext line',
            },
        ],
    };

    it('prints JSON with the origin caveat and null values', () => {
        expect(formatReport(report, 'json')).toBe(
            JSON.stringify(report, null, 2),
        );
        expect(formatReport(report, 'json')).toContain(
            'The server cannot tell which tokens were minted through OAuth.',
        );
    });

    it('escapes CSV quotes, commas and newlines, with empty fields for null', () => {
        expect(formatReport(report, 'csv')).toBe(
            'personal_access_token_uuid,organization_uuid,user_uuid,created_at,expires_at,rotated_at,last_used_at,description\r\n' +
                '"token-uuid",,"user-uuid","2026-10-26T00:00:00.000Z",,,,"comma, ""quote""\nnext line"',
        );
    });

    it.each(['=', '+', '-', '@', '\t', '\r'])(
        'neutralizes a description starting with %j',
        (prefix) => {
            const description = `${prefix}formula`;
            const unsafeReport = {
                ...report,
                tokens: [{ ...report.tokens[0], description }],
            };
            expect(formatReport(unsafeReport, 'csv')).toContain(
                `,"'${description}"`,
            );
            expect(formatReport(unsafeReport, 'json')).toBe(
                JSON.stringify(unsafeReport, null, 2),
            );
        },
    );

    it('neutralizes formulas before escaping double quotes', () => {
        expect(
            formatReport(
                {
                    ...report,
                    tokens: [
                        {
                            ...report.tokens[0],
                            description: '=HYPERLINK("https://example.test")',
                        },
                    ],
                },
                'csv',
            ),
        ).toContain(`,"'=HYPERLINK(""https://example.test"")"`);
    });

    it('prints a CSV header even when no tokens match', () => {
        expect(
            formatReport({ notice: INVENTORY_NOTICE, tokens: [] }, 'csv'),
        ).toBe(
            'personal_access_token_uuid,organization_uuid,user_uuid,created_at,expires_at,rotated_at,last_used_at,description',
        );
    });
});
