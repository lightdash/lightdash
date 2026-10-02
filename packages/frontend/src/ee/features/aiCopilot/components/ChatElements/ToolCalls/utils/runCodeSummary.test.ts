import { describe, expect, it } from 'vitest';
import { getRunCodeJs, summarizeRunCode } from './runCodeSummary';

describe('summarizeRunCode', () => {
    it('uses the leading line comment as the summary', () => {
        expect(
            summarizeRunCode(
                '// Top charts by views\nconst charts = await tools.findContent({ query: "x" });',
            ),
        ).toBe('Top charts by views');
    });

    it('uses a leading block comment as the summary', () => {
        expect(
            summarizeRunCode('/* Count orders per status */\nreturn 1;'),
        ).toBe('Count orders per status');
    });

    it('lists the distinct tools the program calls', () => {
        expect(
            summarizeRunCode(
                [
                    'const fields = await tools.grepFields({ pattern: "rev" });',
                    'const rows = await Promise.all(',
                    '    fields.map((f) => tools.runQuery({ metric: f.id })),',
                    ');',
                    'const again = await tools.grepFields({ pattern: "cost" });',
                    'return rows;',
                ].join('\n'),
            ),
        ).toBe('grepFields, runQuery');
    });

    it('falls back to the first line of code', () => {
        expect(summarizeRunCode('\n\n  return [1, 2, 3].length;  \n')).toBe(
            'return [1, 2, 3].length;',
        );
    });

    it('returns null for an empty program', () => {
        expect(summarizeRunCode('  \n\n')).toBeNull();
    });
});

describe('getRunCodeJs', () => {
    it('returns the program for runCode args', () => {
        expect(getRunCodeJs({ js: 'return 1;' })).toBe('return 1;');
    });

    it('returns null for anything else', () => {
        expect(getRunCodeJs({ query: 'x' })).toBeNull();
        expect(getRunCodeJs(undefined)).toBeNull();
    });
});
