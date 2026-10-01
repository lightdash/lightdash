import { describe, expect, it } from 'vitest';
import {
    DuckdbConnectionType,
    WarehouseTypes,
    type CreatePostgresCredentials,
    type CreateWarehouseCredentials,
} from '../types/projects';
import {
    applyAutomaticConnectionInputFixes,
    ConnectionInputParseKind,
    getWarehouseConnectionInputIssues,
    parseHostInput,
    parseMotherduckDatabaseInput,
    parsePortInput,
    parseSnowflakeAccountInput,
    parseTrimmedInput,
} from './warehouseConnectionInput';

const cloud = {
    allowLocalHosts: false,
    schemeAffectsTransport: true,
    fieldLabel: 'host',
};

describe('parseHostInput', () => {
    it('leaves a plain host alone', () => {
        expect(parseHostInput('db.example.com', cloud)).toEqual({
            kind: ConnectionInputParseKind.UNCHANGED,
            value: 'db.example.com',
        });
    });

    it('trims spaces automatically', () => {
        expect(parseHostInput('  db.example.com ', cloud)).toEqual({
            kind: ConnectionInputParseKind.NORMALISED,
            value: 'db.example.com',
            original: '  db.example.com ',
            changes: ['We removed spaces around the host'],
        });
    });

    it('asks before removing a scheme that can change TLS', () => {
        expect(parseHostInput('https://db.example.com', cloud)).toEqual({
            kind: ConnectionInputParseKind.NEEDS_CONFIRMATION,
            value: 'https://db.example.com',
            original: 'https://db.example.com',
            proposed: 'db.example.com',
            proposedPort: null,
            scheme: 'https',
            changes: ['Remove https:// from the host'],
        });
    });

    it('removes a scheme automatically when it cannot change transport', () => {
        expect(
            parseHostInput('https://dbc-1.cloud.databricks.com', {
                ...cloud,
                schemeAffectsTransport: false,
            }),
        ).toMatchObject({
            kind: ConnectionInputParseKind.NORMALISED,
            value: 'dbc-1.cloud.databricks.com',
        });
    });

    it('words every change as a proposal when it asks first', () => {
        expect(
            parseHostInput(' postgresql://db.example.com:6543/ ', cloud),
        ).toMatchObject({
            kind: ConnectionInputParseKind.NEEDS_CONFIRMATION,
            changes: [
                'Remove spaces around the host',
                'Remove the trailing /',
                'Remove postgresql:// from the host',
                'Move port 6543 to the port field',
            ],
        });
    });

    it('asks before splitting host and port', () => {
        expect(parseHostInput('db.example.com:6543', cloud)).toMatchObject({
            kind: ConnectionInputParseKind.NEEDS_CONFIRMATION,
            proposed: 'db.example.com',
            proposedPort: 6543,
            changes: ['Move port 6543 to the port field'],
        });
    });

    it('asks before removing a path, and keeps the original input', () => {
        expect(
            parseHostInput('postgres://db.example.com:5432/analytics', cloud),
        ).toMatchObject({
            kind: ConnectionInputParseKind.NEEDS_CONFIRMATION,
            value: 'postgres://db.example.com:5432/analytics',
            original: 'postgres://db.example.com:5432/analytics',
            proposed: 'db.example.com',
            proposedPort: 5432,
            scheme: 'postgres',
        });
    });

    it('removes a lone trailing slash automatically', () => {
        expect(parseHostInput('db.example.com/', cloud)).toMatchObject({
            kind: ConnectionInputParseKind.NORMALISED,
            value: 'db.example.com',
        });
    });

    it('does not split a bare IPv6 address on its colons', () => {
        expect(parseHostInput('2001:db8::10', cloud)).toEqual({
            kind: ConnectionInputParseKind.UNCHANGED,
            value: '2001:db8::10',
        });
    });

    it('splits a bracketed IPv6 address and its port', () => {
        expect(parseHostInput('[2001:db8::10]:5432', cloud)).toMatchObject({
            kind: ConnectionInputParseKind.NEEDS_CONFIRMATION,
            proposed: '2001:db8::10',
            proposedPort: 5432,
        });
    });

    it('asks before removing a user name from the host', () => {
        expect(parseHostInput('admin@db.example.com', cloud)).toMatchObject({
            kind: ConnectionInputParseKind.NEEDS_CONFIRMATION,
            proposed: 'db.example.com',
        });
    });

    it.each(['localhost', '127.0.0.1', '::1', 'https://localhost:5432'])(
        'blocks %s where local hosts are not reachable',
        (host) => {
            expect(parseHostInput(host, cloud).kind).toBe(
                ConnectionInputParseKind.BLOCKED,
            );
        },
    );

    it('allows local hosts where they are reachable', () => {
        expect(
            parseHostInput('localhost', { ...cloud, allowLocalHosts: true }),
        ).toEqual({
            kind: ConnectionInputParseKind.UNCHANGED,
            value: 'localhost',
        });
    });
});

describe('parseSnowflakeAccountInput', () => {
    it('drops the Snowflake suffix automatically', () => {
        expect(
            parseSnowflakeAccountInput(
                'xy12345.eu-west-1.snowflakecomputing.com',
            ),
        ).toEqual({
            kind: ConnectionInputParseKind.NORMALISED,
            value: 'xy12345.eu-west-1',
            original: 'xy12345.eu-west-1.snowflakecomputing.com',
            changes: ['We removed .snowflakecomputing.com'],
        });
    });

    it('drops a pasted URL down to the account', () => {
        expect(
            parseSnowflakeAccountInput(
                ' https://org-acct.snowflakecomputing.com/console ',
            ),
        ).toMatchObject({
            kind: ConnectionInputParseKind.NORMALISED,
            value: 'org-acct',
        });
    });

    it('leaves an account identifier alone', () => {
        expect(parseSnowflakeAccountInput('org-acct').kind).toBe(
            ConnectionInputParseKind.UNCHANGED,
        );
    });
});

describe('parsePortInput', () => {
    it.each([5432, '6543'])('accepts %s', (port) => {
        expect(parsePortInput(port).kind).toBe(
            ConnectionInputParseKind.UNCHANGED,
        );
    });

    it.each([0, 70000, 543215432, 'abc'])('blocks %s', (port) => {
        expect(parsePortInput(port).kind).toBe(
            ConnectionInputParseKind.BLOCKED,
        );
    });
});

describe('parseTrimmedInput', () => {
    it('trims a BigQuery project id', () => {
        expect(parseTrimmedInput(' my-project', 'project')).toMatchObject({
            kind: ConnectionInputParseKind.NORMALISED,
            value: 'my-project',
        });
    });
});

describe('parseMotherduckDatabaseInput', () => {
    it.each(['/Users/me/jaffle.duckdb', './local.db', '~/data/x.duckdb'])(
        'blocks the local path %s',
        (path) => {
            expect(parseMotherduckDatabaseInput(path).kind).toBe(
                ConnectionInputParseKind.BLOCKED,
            );
        },
    );

    it('accepts a MotherDuck database name', () => {
        expect(parseMotherduckDatabaseInput('my_db').kind).toBe(
            ConnectionInputParseKind.UNCHANGED,
        );
    });
});

describe('getWarehouseConnectionInputIssues', () => {
    it('skips fields that are missing from stored credentials', () => {
        expect(
            getWarehouseConnectionInputIssues(
                { type: WarehouseTypes.POSTGRES } as CreateWarehouseCredentials,
                { allowLocalHosts: false },
            ),
        ).toEqual([]);
    });

    const postgres: CreatePostgresCredentials = {
        type: WarehouseTypes.POSTGRES,
        host: 'localhost',
        user: 'user',
        password: 'password',
        port: 5432,
        dbname: 'db',
        schema: 'public',
    };

    it('allows a local host behind an SSH tunnel', () => {
        expect(
            getWarehouseConnectionInputIssues(
                { ...postgres, useSshTunnel: true },
                { allowLocalHosts: false },
            ),
        ).toEqual([]);
    });

    it('reports a local host without a tunnel', () => {
        expect(
            getWarehouseConnectionInputIssues(postgres, {
                allowLocalHosts: false,
            }),
        ).toMatchObject([
            {
                field: 'host',
                result: { kind: ConnectionInputParseKind.BLOCKED },
            },
        ]);
    });

    it('applies automatic fixes and leaves confirmations untouched', () => {
        const credentials: CreateWarehouseCredentials = {
            type: WarehouseTypes.SNOWFLAKE,
            account: 'acct.snowflakecomputing.com',
            user: 'user',
            password: 'password',
            role: 'role',
            database: 'db',
            warehouse: 'wh',
            schema: 'public',
        };
        const issues = getWarehouseConnectionInputIssues(credentials, {
            allowLocalHosts: false,
        });
        expect(
            applyAutomaticConnectionInputFixes(credentials, issues),
        ).toMatchObject({ account: 'acct' });
    });

    it('checks only MotherDuck databases for local paths', () => {
        expect(
            getWarehouseConnectionInputIssues(
                {
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.MOTHERDUCK,
                    database: '/tmp/x.duckdb',
                    token: 'token',
                    schema: 'main',
                } as CreateWarehouseCredentials,
                { allowLocalHosts: true },
            ),
        ).toHaveLength(1);
    });
});
