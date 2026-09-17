import { WarehouseTypes, type Connection } from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    isReplaceableSql,
    readLastUsedConnection,
    resolveActiveConnection,
    tableClickOutcome,
    writeLastUsedConnection,
} from './activeConnection';

const connection = (connectionUuid: string, name: string): Connection => ({
    connectionUuid,
    name,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
});

const connections = [
    connection('connection-1', 'Analytics'),
    connection('connection-2', 'Reporting'),
];

describe('resolveActiveConnection', () => {
    it('opens a new document on the last connection used in this project', () => {
        expect(
            resolveActiveConnection({
                connections,
                savedConnectionUuid: undefined,
                lastUsedConnectionUuid: 'connection-2',
                isSavedChart: false,
            }),
        ).toBe('connection-2');
    });

    it('opens a saved chart on the connection stored with its version', () => {
        expect(
            resolveActiveConnection({
                connections,
                savedConnectionUuid: 'connection-2',
                lastUsedConnectionUuid: 'connection-1',
                isSavedChart: true,
            }),
        ).toBe('connection-2');
    });

    it('falls back to the sole connection when a chart stored none', () => {
        expect(
            resolveActiveConnection({
                connections: [connections[0]],
                savedConnectionUuid: undefined,
                lastUsedConnectionUuid: 'connection-2',
                isSavedChart: true,
            }),
        ).toBe('connection-1');
    });

    it('ignores a connection the project no longer has', () => {
        expect(
            resolveActiveConnection({
                connections,
                savedConnectionUuid: 'removed-connection',
                lastUsedConnectionUuid: undefined,
                isSavedChart: true,
            }),
        ).toBe('connection-1');
        expect(
            resolveActiveConnection({
                connections,
                savedConnectionUuid: undefined,
                lastUsedConnectionUuid: 'removed-connection',
                isSavedChart: false,
            }),
        ).toBe('connection-1');
    });

    it('resolves nothing while the project has no connections', () => {
        expect(
            resolveActiveConnection({
                connections: [],
                savedConnectionUuid: 'connection-1',
                lastUsedConnectionUuid: 'connection-1',
                isSavedChart: false,
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

    it('never asks for a table on the active connection', () => {
        expect(
            tableClickOutcome({
                sql: 'SELECT id, total FROM orders',
                activeConnectionUuid: 'connection-1',
                tableConnectionUuid: 'connection-1',
            }),
        ).toBe('insert');
    });

    it('never asks while the project resolves no connection', () => {
        expect(
            tableClickOutcome({
                sql: 'SELECT id, total FROM orders',
                activeConnectionUuid: undefined,
                tableConnectionUuid: 'connection-2',
            }),
        ).toBe('insert');
    });
});
