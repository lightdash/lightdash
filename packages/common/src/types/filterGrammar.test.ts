import { FilterOperator, FilterRule } from './filter';
import filterGrammar, { parseFilters } from './filterGrammar';

const peg = require('pegjs');

describe('attachTypesToModels', () => {
    const parser = peg.generate(filterGrammar);

    it('Simple peg grammar test', async () => {
        const simpleParser = peg.generate("start = ('a' / 'b')+");
        expect(simpleParser.parse('abba')).toEqual(['a', 'b', 'b', 'a']);
    });

    it('Empty Filter grammar', async () => {
        expect(parser.parse('')).toEqual({
            is: true,
            type: 'equals',
            value: [],
        });
    });

    it('Equals grammar', async () => {
        expect(parser.parse('pedram')).toEqual({
            is: true,
            type: 'equals',
            value: ['pedram'],
        });
    });

    it('Not equals grammar', async () => {
        expect(parser.parse('!pedram')).toEqual({
            is: false,
            type: 'equals',
            value: ['pedram'],
        });
    });

    it('Contains grammar', async () => {
        expect(parser.parse('%katie%')).toEqual({
            is: true,
            type: 'include',
            value: ['katie'],
        });
    });
    it('Not contains grammar', async () => {
        expect(parser.parse('!%katie%')).toEqual({
            is: false,
            type: 'include',
            value: ['katie'],
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
});

describe('Parse metric filters', () => {
    const removeIds = (filters: FilterRule[]) =>
        filters.map((filter) => ({ ...filter, id: undefined }));
    it('Should directly transform boolean filter', () => {
        const filters = [{ is_active: true }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldId: 'is_active',
                },
                values: true,
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
                    fieldId: 'position',
                },
                values: 1,
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
                    fieldId: 'name',
                },
                values: ['katie'],
            },
        ]);
    });

    it.only('Should parse multiple filters', () => {
        expect(
            removeIds(parseFilters([{ name: '!%katie%' }, { money: 15.33 }])),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.NOT_INCLUDE,
                target: {
                    fieldId: 'name',
                },
                values: ['katie'],
            },
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldId: 'money',
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
                    fieldId: 'order_id',
                },
                values: [5],
            },
            {
                id: undefined,
                operator: FilterOperator.LESS_THAN,
                target: {
                    fieldId: 'order_id',
                },
                values: [10],
            },
        ]);
    });
});
