import {
    clearSqlRunnerHandoff,
    readSqlRunnerHandoff,
    writeSqlRunnerHandoff,
} from './sqlRunnerHandoff';

describe('sqlRunnerHandoff', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.useRealTimers();
    });

    it('round-trips the SQL and connection until cleared', () => {
        const id = writeSqlRunnerHandoff({
            sql: 'select 1',
            warehouseConnectionUuid: null,
        });
        expect(id).not.toBeNull();
        expect(readSqlRunnerHandoff(id!)).toEqual({
            sql: 'select 1',
            warehouseConnectionUuid: null,
        });
        clearSqlRunnerHandoff(id!);
        expect(readSqlRunnerHandoff(id!)).toBeNull();
    });

    it('ignores and prunes expired entries', () => {
        vi.useFakeTimers();
        const id = writeSqlRunnerHandoff({ sql: 'select 1' });
        vi.advanceTimersByTime(11 * 60 * 1000);
        expect(readSqlRunnerHandoff(id!)).toBeNull();
        writeSqlRunnerHandoff({ sql: 'select 2' });
        expect(window.localStorage.length).toBe(1);
    });

    it('returns null for unknown or malformed entries', () => {
        expect(readSqlRunnerHandoff('missing')).toBeNull();
        window.localStorage.setItem('sqlRunnerHandoff:bad', '{');
        expect(readSqlRunnerHandoff('bad')).toBeNull();
    });
});
