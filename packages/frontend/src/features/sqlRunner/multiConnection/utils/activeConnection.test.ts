import {
    WarehouseTypes,
    type SqlRunnerWarehouseConnection,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    forgetLastUsedConnection,
    isMissingConnectionError,
    isReplaceableSql,
    readLastUsedConnection,
    resolveActiveConnection,
    tableClickOutcome,
    writeLastUsedConnection,
} from './activeConnection';

const connection = (
    warehouseConnectionUuid: string,
    name: string,
): SqlRunnerWarehouseConnection => ({
    warehouseConnectionUuid,
    name,
    isOriginal: false,
    warehouseType: WarehouseTypes.POSTGRES,
});

const connections = [
    connection('connection-1', 'Analytics'),
    connection('connection-2', 'Reporting'),
];

describe('resolveActiveConnection', () => {
    it('opens on the last connection used in this project', () => {
        expect(
            resolveActiveConnection({
                connections,
                lastUsedConnectionUuid: 'connection-2',
            }),
        ).toBe('connection-2');
    });

    it('waits for the picker rather than guessing the first connection', () => {
        expect(
            resolveActiveConnection({
                connections,
                lastUsedConnectionUuid: undefined,
            }),
        ).toBeUndefined();
        expect(
            resolveActiveConnection({
                connections,
                lastUsedConnectionUuid: 'removed-connection',
            }),
        ).toBeUndefined();
    });

    it('needs no choice while the project has one connection', () => {
        expect(
            resolveActiveConnection({
                connections: [connections[0]],
                lastUsedConnectionUuid: undefined,
            }),
        ).toBe('connection-1');
    });

    it('resolves nothing while the project has no connections', () => {
        expect(
            resolveActiveConnection({
                connections: [],
                lastUsedConnectionUuid: 'connection-1',
            }),
        ).toBeUndefined();
    });
});

describe('last used connection storage', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('remembers the connection per project', () => {
        writeLastUsedConnection('project-a', 'connection-1');
        writeLastUsedConnection('project-b', 'connection-2');

        expect(readLastUsedConnection('project-a')).toBe('connection-1');
        expect(readLastUsedConnection('project-b')).toBe('connection-2');
        expect(readLastUsedConnection('project-c')).toBeUndefined();
    });

    it('survives storage that throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });

        expect(() =>
            writeLastUsedConnection('project-a', 'connection-1'),
        ).not.toThrow();
        expect(readLastUsedConnection('project-a')).toBeUndefined();
    });
});

describe('isReplaceableSql', () => {
    it('treats an empty editor as replaceable', () => {
        expect(isReplaceableSql('')).toBe(true);
        expect(isReplaceableSql('   \n  ')).toBe(true);
    });

    it('treats a generated select as replaceable', () => {
        expect(isReplaceableSql('SELECT * FROM "raw"."public"."orders"')).toBe(
            true,
        );
        expect(isReplaceableSql('select * from `db`.`schema`.`table`')).toBe(
            true,
        );
    });

    it('treats a generated select with a partition filter as replaceable', () => {
        expect(
            isReplaceableSql(
                'SELECT * FROM "raw"."public"."events" \nWHERE created_at = \'2026-09-17\' -- This table has a date partition on this field',
            ),
        ).toBe(true);
    });

    it('never replaces SQL the user wrote', () => {
        expect(isReplaceableSql('SELECT id FROM orders')).toBe(false);
        expect(
            isReplaceableSql('SELECT * FROM orders JOIN customers USING (id)'),
        ).toBe(false);
        expect(
            isReplaceableSql('-- my notes\nSELECT * FROM "raw"."public"."o"'),
        ).toBe(false);
        expect(
            isReplaceableSql(
                'SELECT * FROM "a"."b"."c" WHERE 1 = 1 UNION SELECT * FROM "d"."e"."f"',
            ),
        ).toBe(false);
    });
});

describe('tableClickOutcome', () => {
    const onOtherConnection = (sql: string) =>
        tableClickOutcome({
            sql,
            activeConnectionUuid: 'connection-1',
            tableConnectionUuid: 'connection-2',
        });

    it('switches and inserts when the editor is empty', () => {
        expect(onOtherConnection('')).toBe('switch-and-insert');
        expect(onOtherConnection('   \n ')).toBe('switch-and-insert');
    });

    it('switches and inserts over a generated select', () => {
        expect(onOtherConnection('SELECT * FROM "raw"."public"."orders"')).toBe(
            'switch-and-insert',
        );
        expect(
            onOtherConnection(
                'SELECT * FROM "raw"."public"."events" \nWHERE day = \'2026-09-17\' -- This table has a date partition on this field',
            ),
        ).toBe('switch-and-insert');
    });

    it('asks first when the user wrote the SQL', () => {
        expect(onOtherConnection('SELECT id, total FROM orders')).toBe(
            'prompt',
        );
        expect(
            onOtherConnection('SELECT * FROM orders JOIN customers USING (id)'),
        ).toBe('prompt');
    });

    it('inserts over a replaceable editor on the active connection', () => {
        expect(
            tableClickOutcome({
                sql: 'SELECT * FROM "raw"."public"."orders"',
                activeConnectionUuid: 'connection-1',
                tableConnectionUuid: 'connection-1',
            }),
        ).toBe('insert');
    });

    it('selects without touching SQL the user wrote on the active connection', () => {
        expect(
            tableClickOutcome({
                sql: 'SELECT id, total FROM orders',
                activeConnectionUuid: 'connection-1',
                tableConnectionUuid: 'connection-1',
            }),
        ).toBe('select-only');
    });

    it('keeps SQL that merely contains a select on the active connection', () => {
        expect(
            tableClickOutcome({
                sql: 'WITH recent AS (SELECT * FROM "raw"."public"."orders") SELECT 1',
                activeConnectionUuid: 'connection-1',
                tableConnectionUuid: 'connection-1',
            }),
        ).toBe('select-only');
        expect(
            tableClickOutcome({
                sql: '-- draft\nSELECT * FROM "raw"."public"."orders" LIMIT 10',
                activeConnectionUuid: 'connection-1',
                tableConnectionUuid: 'connection-1',
            }),
        ).toBe('select-only');
    });

    it('never asks while the project resolves no connection', () => {
        expect(
            tableClickOutcome({
                sql: 'SELECT id, total FROM orders',
                activeConnectionUuid: undefined,
                tableConnectionUuid: 'connection-2',
            }),
        ).toBe('select-only');
    });
});

describe('isMissingConnectionError', () => {
    it('recognises the api error a removed connection returns', () => {
        expect(
            isMissingConnectionError({
                status: 'error',
                error: {
                    name: 'NotFoundError',
                    message: 'Connection not found',
                },
            }),
        ).toBe(true);
    });

    it('recognises the error the query slice stores', () => {
        expect(
            isMissingConnectionError({
                name: 'NotFoundError',
                message: 'Connection not found',
            }),
        ).toBe(true);
    });

    it('leaves every other failure alone', () => {
        expect(isMissingConnectionError(undefined)).toBe(false);
        expect(isMissingConnectionError(null)).toBe(false);
        expect(isMissingConnectionError('Connection not found')).toBe(false);
        expect(
            isMissingConnectionError(new Error('syntax error near SELCT')),
        ).toBe(false);
        expect(
            isMissingConnectionError({
                error: {
                    name: 'MultipleConnectionsError',
                    message: 'This project has several connections.',
                },
            }),
        ).toBe(false);
    });
});

describe('forgetLastUsedConnection', () => {
    const projectUuid = 'project-uuid';

    beforeEach(() => window.localStorage.clear());

    it('clears the stored connection when it is the one removed', () => {
        writeLastUsedConnection(projectUuid, 'connection-1');

        forgetLastUsedConnection(projectUuid, 'connection-1');

        expect(readLastUsedConnection(projectUuid)).toBeUndefined();
    });

    it('keeps a different stored connection', () => {
        writeLastUsedConnection(projectUuid, 'connection-2');

        forgetLastUsedConnection(projectUuid, 'connection-1');

        expect(readLastUsedConnection(projectUuid)).toBe('connection-2');
    });
});
