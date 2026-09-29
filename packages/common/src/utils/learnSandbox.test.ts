import {
    checkLearnLessonEntry,
    describeLearnWorkspaceYamlError,
    validateLearnWorkspaceYaml,
} from './learnSandbox';

describe('validateLearnWorkspaceYaml', () => {
    it('accepts a model file', () => {
        expect(
            validateLearnWorkspaceYaml(
                'models:\n  - name: a\n    columns:\n      - name: id\n',
            ),
        ).toBeNull();
    });

    it('names the line of a stray word between mapping items', () => {
        const message = validateLearnWorkspaceYaml(
            'columns:\n  - name: id\n  oops\n    description: x\n',
        );
        expect(message).not.toBeNull();
        expect(describeLearnWorkspaceYamlError(message!)).toMatch(
            /^Fix the YAML error on line \d+ to continue$/,
        );
    });

    it('falls back to a plain sentence when the parser names no line', () => {
        expect(describeLearnWorkspaceYamlError('Invalid YAML')).toBe(
            'Fix the YAML error to continue',
        );
    });
});

describe('checkLearnLessonEntry', () => {
    const columnLesson = {
        model: 'fm_buildings',
        under: 'columns',
        field: 'number_of_floors',
    };
    const file = (columns: string, other = '      - name: id\n') =>
        `models:\n  - name: fm_buildings\n    columns:\n${columns}  - name: other_model\n    columns:\n${other}`;

    it.each([
        [
            'at the start of columns',
            '      - name: number_of_floors\n      - name: building_id\n',
        ],
        [
            'at the end of columns',
            '      - name: building_id\n      - name: number_of_floors\n',
        ],
        ['quoted', '      - name: "number_of_floors"\n'],
        [
            'with extra spaces after the dash',
            '      -   name: number_of_floors\n',
        ],
        [
            'with description first',
            '      - description: x\n        name: number_of_floors\n',
        ],
        ['in flow style', '      - { name: number_of_floors }\n'],
        ['with a trailing comment', '      - name: number_of_floors # new\n'],
    ])('accepts a declared column %s', (_label, columns) => {
        expect(checkLearnLessonEntry(file(columns), columnLesson)).toBeNull();
    });

    it('says where the column went when it is under another model', () => {
        expect(
            checkLearnLessonEntry(
                file(
                    '      - name: building_id\n',
                    '      - name: number_of_floors\n',
                ),
                columnLesson,
            ),
        ).toBe(
            'number_of_floors is under the other_model model. Add it under fm_buildings',
        );
    });

    it('does not count a commented-out line, and says what to add', () => {
        expect(
            checkLearnLessonEntry(
                file(
                    '      # - name: number_of_floors\n      - name: building_id\n',
                ),
                columnLesson,
            ),
        ).toBe("Add number_of_floors to the fm_buildings model's columns");
    });

    const metricLesson = {
        model: 'payments',
        column: 'amount',
        under: 'metrics',
        field: 'average_payment_amount',
    };
    const payments = (amount: string, paymentId = '') =>
        `models:\n  - name: payments\n    columns:\n      - name: payment_id\n${paymentId}      - name: amount\n${amount}`;

    it.each([
        [
            'under config.meta',
            '        config:\n          meta:\n            metrics:\n              average_payment_amount:\n                type: average\n',
        ],
        [
            'under meta',
            '        meta:\n          metrics:\n            average_payment_amount:\n              type: average\n',
        ],
        [
            'in flow style',
            '        meta:\n          metrics:\n            average_payment_amount: { type: average }\n',
        ],
    ])('accepts a metric %s', (_label, amount) => {
        expect(
            checkLearnLessonEntry(payments(amount), metricLesson),
        ).toBeNull();
    });

    it('says which column the metric went under when it is the wrong one', () => {
        expect(
            checkLearnLessonEntry(
                payments(
                    '',
                    '        meta:\n          metrics:\n            average_payment_amount:\n              type: average\n',
                ),
                metricLesson,
            ),
        ).toBe(
            'average_payment_amount is under the payment_id column. Add it under amount',
        );
    });

    it('says what to add when the metric is nowhere', () => {
        expect(checkLearnLessonEntry(payments(''), metricLesson)).toBe(
            "Add average_payment_amount under the amount column's metrics",
        );
    });

    it('points at the line when the file does not parse', () => {
        expect(
            checkLearnLessonEntry(
                'models:\n  - name: a\n  oops\n    x: 1\n',
                columnLesson,
            ),
        ).toMatch(/^Fix the YAML error on line \d+, then check again$/);
    });
});
