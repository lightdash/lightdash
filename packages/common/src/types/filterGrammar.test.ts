import filterGrammar from './filterGrammar';

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
            type: 'match',
            value: [],
        });
    });

    it('Equals grammar', async () => {
        expect(parser.parse('pedram')).toEqual({
            is: true,
            type: 'match',
            value: ['pedram'],
        });
    });

    it('Not equals grammar', async () => {
        expect(parser.parse('!pedram')).toEqual({
            is: false,
            type: 'match',
            value: ['pedram'],
        });
    });

    it('Contains grammar', async () => {
        expect(parser.parse('%katie%')).toEqual({
            is: true,
            type: 'contains',
            value: ['katie'],
        });
    });
    it('Not contains grammar', async () => {
        expect(parser.parse('!%katie%')).toEqual({
            is: false,
            type: 'contains',
            value: ['katie'],
        });
    });

    it('Numerical operators', async () => {
        expect(parser.parse('< 15')).toEqual({ type: '<', values: [15] });
        expect(parser.parse('> 15')).toEqual({ type: '>', values: [15] });
        expect(parser.parse('<= 15')).toEqual({ type: '<=', values: [15] });
        expect(parser.parse('>= 15')).toEqual({ type: '>=', values: [15] });
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
