import peg from 'pegjs';
import { FilterOperator, type MetricFilterRule } from './filter';
import filterGrammar, { parseFilters } from './filterGrammar';

describe('Parse grammar', () => {
    const parser = peg.generate(filterGrammar);

    it('Simple peg grammar test', async () => {
        const simpleParser = peg.generate("start = ('a' / 'b')+");
        expect(simpleParser.parse('abba')).toEqual(['a', 'b', 'b', 'a']);
    });

    it('Empty Filter grammar', async () => {
        expect(parser.parse('')).toEqual({
            is: true,
            type: 'equals',
            values: [],
        });
    });

    it('Equals grammar', async () => {
        expect(parser.parse('pedram')).toEqual({
            is: true,
            type: 'equals',
            values: ['pedram'],
        });

        expect(parser.parse('with space')).toEqual({
            is: true,
            type: 'equals',
            values: ['with space'],
        });

        expect(parser.parse('with_multiple_underscores')).toEqual({
            is: true,
            type: 'equals',
            values: ['with_multiple_underscores'],
        });
    });

    it('should compile grammar with escaped underscore', async () => {
        expect(parser.parse('katie\\_')).toEqual({
            is: true,
            type: 'equals',
            values: ['katie_'],
        });
    });

    it('Not equals grammar', async () => {
        expect(parser.parse('!pedram')).toEqual({
            is: false,
            type: 'equals',
            values: ['pedram'],
        });
        expect(parser.parse('!song_played')).toEqual({
            is: false,
            type: 'equals',
            values: ['song_played'],
        });

        expect(parser.parse('!with_underscores')).toEqual({
            is: false,
            type: 'equals',
            values: ['with_underscores'],
        });
    });

    it('Starts with grammar', async () => {
        expect(parser.parse('katie%')).toEqual({
            is: true,
            type: 'startsWith',
            values: ['katie'],
        });

        expect(parser.parse('with_underscores%')).toEqual({
            is: true,
            type: 'startsWith',
            values: ['with_underscores'],
        });
    });

    it('Ends with grammar', async () => {
        expect(parser.parse('%katie')).toEqual({
            is: true,
            type: 'endsWith',
            values: ['katie'],
        });

        expect(parser.parse('%with_underscores')).toEqual({
            is: true,
            type: 'endsWith',
            values: ['with_underscores'],
        });
    });

    it('Contains grammar', async () => {
        expect(parser.parse('%katie%')).toEqual({
            is: true,
            type: 'include',
            values: ['katie'],
        });

        expect(parser.parse('%with_underscores%')).toEqual({
            is: true,
            type: 'include',
            values: ['with_underscores'],
        });
    });

    it('Not contains grammar', async () => {
        expect(parser.parse('!%katie%')).toEqual({
            is: false,
            type: 'include',
            values: ['katie'],
        });
    });

    it('Numerical operators', async () => {
        expect(parser.parse('< 15')).toEqual({ type: '<', values: [15] });
        expect(parser.parse('> 15')).toEqual({ type: '>', values: [15] });
        expect(parser.parse('<= 15')).toEqual({ type: '<=', values: [15] });
        expect(parser.parse('>= 15')).toEqual({ type: '>=', values: [15] });
    });

    it('Float number', async () => {
        expect(parser.parse('< 15.0')).toEqual({ type: '<', values: [15] });
        expect(parser.parse('> 15.05')).toEqual({ type: '>', values: [15.05] });
        expect(parser.parse('<= 15.5555')).toEqual({
            type: '<=',
            values: [15.5555],
        });
    });

    it('Numerical operator < grammar with spaces', async () => {
        const expected = { type: '<', values: [25] };

        expect(parser.parse('<25')).toEqual(expected);
        expect(parser.parse('< 25')).toEqual(expected);
        expect(parser.parse(' <25')).toEqual(expected);
        expect(parser.parse(' < 25')).toEqual(expected);
    });

    it('Numerical operator >= grammar with spaces', async () => {
        const expected = { type: '>=', values: [32] };
        expect(parser.parse('>=32')).toEqual(expected);
        expect(parser.parse('>= 32')).toEqual(expected);
        expect(parser.parse(' >=32')).toEqual(expected);
        expect(parser.parse(' >= 32')).toEqual(expected);
    });

    it('Is null', async () => {
        expect(parser.parse('NULL')).toEqual({
            is: true,
            type: 'null',
        });

        expect(parser.parse('null')).toEqual({
            is: true,
            type: 'null',
        });
    });

    it('Is not null', async () => {
        expect(parser.parse('!null')).toEqual({
            is: false,
            type: 'null',
        });
    });
});

describe('Parse metric filters', () => {
    const removeIds = (filters: MetricFilterRule[]) =>
        filters.map((filter) => ({ ...filter, id: undefined }));
    it('Should directly transform boolean filter', () => {
        const filters = [{ is_active: true }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'is_active',
                },
                values: [true],
            },
        ]);
    });
    it('Should directly transform number filter', () => {
        const filters = [{ position: 1 }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
            },
        ]);
    });
    it('Should parse string filter using grammar', () => {
        const filters = [{ name: '%katie%' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.INCLUDE,
                target: {
                    fieldRef: 'name',
                },
                values: ['katie'],
            },
        ]);
    });

    it('Should parse multiple filters', () => {
        expect(
            removeIds(parseFilters([{ name: '!%katie%' }, { money: 15.33 }])),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.NOT_INCLUDE,
                target: {
                    fieldRef: 'name',
                },
                values: ['katie'],
            },
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'money',
                },
                values: [15.33],
            },
        ]);

        expect(
            removeIds(
                parseFilters([{ order_id: '> 5' }, { order_id: '< 10' }]),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.GREATER_THAN,
                target: {
                    fieldRef: 'order_id',
                },
                values: [5],
            },
            {
                id: undefined,
                operator: FilterOperator.LESS_THAN,
                target: {
                    fieldRef: 'order_id',
                },
                values: [10],
            },
        ]);
    });

    it('Should parse NULL using grammar', () => {
        const filters = [{ name: null }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.NULL,
                target: {
                    fieldRef: 'name',
                },
                values: [1],
            },
        ]);
    });
    it('Should parse NOT_NULL using grammar', () => {
        const filters = [{ name: '!null' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.NOT_NULL,
                target: {
                    fieldRef: 'name',
                },
                values: [1],
            },
        ]);
    });

    it('Should parse multiple filter values using grammar', () => {
        const filters = [{ name: ['cat', 'dog'] }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'name',
                },
                values: ['cat', 'dog'],
            },
        ]);
    });

    it('Should parse date in the past operator with interval', () => {
        const filters = [{ name: 'inThePast 14 days' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_THE_PAST,
                settings: {
                    unitOfTime: 'days',
                },
                target: {
                    fieldRef: 'name',
                },
                values: [14],
            },
        ]);
    });

    it('Should parse date in the next operator with interval', () => {
        const filters = [{ name: 'inTheNext 14 years' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_THE_NEXT,
                settings: {
                    unitOfTime: 'years',
                },
                target: {
                    fieldRef: 'name',
                },
                values: [14],
            },
        ]);
    });
});
