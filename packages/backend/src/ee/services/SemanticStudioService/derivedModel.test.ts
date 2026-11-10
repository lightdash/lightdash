import { isDerivedSqlFrom, toDerivedSqlFrom } from './derivedModel';

describe('derived sql_from', () => {
    it('tells a query from a table', () => {
        expect(isDerivedSqlFrom('select 1')).toBe(true);
        expect(
            isDerivedSqlFrom(' (WITH a AS (select 1) select * from a)'),
        ).toBe(true);
        expect(isDerivedSqlFrom('public.selected_orders')).toBe(false);
    });

    it('wraps a query so a trailing comment cannot swallow the bracket', () => {
        expect(toDerivedSqlFrom('select 1 -- note')).toBe(
            '(\nselect 1 -- note\n)',
        );
        expect(toDerivedSqlFrom('select 1 ;')).toBe('(\nselect 1\n)');
        expect(toDerivedSqlFrom('(select 1)')).toBe('(select 1)');
    });

    it('refuses a second statement', () => {
        expect(toDerivedSqlFrom('select 1; drop table orders')).toBeNull();
    });
});
