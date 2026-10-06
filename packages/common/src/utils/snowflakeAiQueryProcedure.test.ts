import { describe, expect, it } from 'vitest';
import {
    getAiQueryProcedureCallSql,
    parseSnowflakeProcedureName,
} from './snowflakeAiQueryProcedure';

describe('parseSnowflakeProcedureName', () => {
    it.each([
        'DB.SCHEMA.RUN_SQL',
        'db_1._schema.RUN_SQL',
        '"My database"."a""b"."Run.Sql"',
    ])('accepts %s', (name) => {
        expect(parseSnowflakeProcedureName(`  ${name}  `)).toBe(name);
        expect(getAiQueryProcedureCallSql(name)).toBe(`CALL ${name}(?)`);
    });

    it.each([
        '',
        'DB.SCHEMA',
        'DB.SCHEMA.RUN_SQL.EXTRA',
        'DB..RUN_SQL',
        'DB.SCHEMA.',
        'DB. SCHEMA.RUN_SQL',
        'DB.SCHEMA.RUN_SQL;',
        'DB.SCHEMA.RUN_SQL()',
        'DB.SCHEMA.RUN_SQL--comment',
        '"".SCHEMA.RUN_SQL',
        '"DB\n".SCHEMA.RUN_SQL',
        '"DB"x.SCHEMA.RUN_SQL',
    ])('rejects %s', (name) => {
        expect(parseSnowflakeProcedureName(name)).toBeNull();
        expect(() => getAiQueryProcedureCallSql(name)).toThrow();
    });
});
