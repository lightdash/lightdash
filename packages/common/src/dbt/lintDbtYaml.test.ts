import { lintDbtYaml } from './lintDbtYaml';

const model = (column: string) =>
    `version: 2\nmodels:\n  - name: orders\n    columns:\n      - name: status\n${column}\n`;

describe('lintDbtYaml', () => {
    it('passes a valid file', () => {
        expect(
            lintDbtYaml(
                model(
                    '        meta:\n          dimension:\n            type: string',
                ),
            ),
        ).toEqual([]);
        expect(lintDbtYaml('')).toEqual([]);
    });

    it('underlines a wrong value and says what is allowed', () => {
        expect(
            lintDbtYaml(
                model(
                    '        meta:\n          dimension:\n            type: strng',
                ),
            ),
        ).toEqual([
            {
                start: { line: 7, character: 18 },
                end: { line: 7, character: 23 },
                message:
                    'Must be one of: string, number, timestamp, date, boolean.',
            },
        ]);
        expect(lintDbtYaml(model('        tests: unique'))[0].message).toBe(
            'Must be a list.',
        );
    });

    it('underlines an unknown key where the schema closes them', () => {
        expect(lintDbtYaml('modls:\n  - name: orders\n')).toEqual([
            {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 },
                message: '"modls" is not a known key here.',
            },
        ]);
    });

    it('reports YAML syntax errors before the schema', () => {
        const [problem] = lintDbtYaml('models:\n  - name: [orders\n');
        expect(problem.message).toMatch(/^Flow sequence.*\]\.$/);
    });
});
