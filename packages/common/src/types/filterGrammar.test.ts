import peg from 'pegjs';
import { FilterOperator, type MetricFilterRule } from './filter';
import filterGrammar, {
    parseFilters,
    parseModelRequiredFilters,
} from './filterGrammar';

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

    it('Negative numbers in operators', async () => {
        expect(parser.parse('>= -1')).toEqual({ type: '>=', values: [-1] });
        expect(parser.parse('< -5')).toEqual({ type: '<', values: [-5] });
        expect(parser.parse('> -10.5')).toEqual({ type: '>', values: [-10.5] });
    });

    it('Float number', async () => {
        expect(parser.parse('< 15.0')).toEqual({ type: '<', values: [15] });
        expect(parser.parse('> 15.05')).toEqual({ type: '>', values: [15.05] });
        expect(parser.parse('<= 15.5555')).toEqual({
            type: '<=',
            values: [15.5555],
        });
    });

    it('Positive and negative floats', async () => {
        // Positive floats
        expect(parser.parse('> 3.14')).toEqual({ type: '>', values: [3.14] });
        expect(parser.parse('< 0.5')).toEqual({ type: '<', values: [0.5] });
        expect(parser.parse('>= 100.001')).toEqual({
            type: '>=',
            values: [100.001],
        });
        expect(parser.parse('<= 2.718')).toEqual({
            type: '<=',
            values: [2.718],
        });

        // Negative floats
        expect(parser.parse('< -3.14')).toEqual({ type: '<', values: [-3.14] });
        expect(parser.parse('> -0.5')).toEqual({ type: '>', values: [-0.5] });
        expect(parser.parse('<= -100.001')).toEqual({
            type: '<=',
            values: [-100.001],
        });
        expect(parser.parse('>= -2.718')).toEqual({
            type: '>=',
            values: [-2.718],
        });

        // Edge cases with zero
        expect(parser.parse('> 0.0')).toEqual({ type: '>', values: [0] });
        expect(parser.parse('< -0.0')).toEqual({ type: '<', values: [-0] });
    });

    it('Should reject invalid negative float expressions', async () => {
        // This test ensures that expressions like "-10.-5" are not valid
        // The grammar should not parse these as valid numbers
        expect(() => parser.parse('> -10.-5')).toThrow();
        expect(() => parser.parse('< -3.-14')).toThrow();
    });

    it('Between operator', async () => {
        expect(parser.parse('between 1 and 100')).toEqual({
            type: 'inBetween',
            values: [1, 100],
            is: true,
        });
        expect(parser.parse('BETWEEN 0 AND 3600')).toEqual({
            type: 'inBetween',
            values: [0, 3600],
            is: true,
        });
        expect(parser.parse('between -10 and 10')).toEqual({
            type: 'inBetween',
            values: [-10, 10],
            is: true,
        });
        expect(parser.parse('between 0.5 and 99.9')).toEqual({
            type: 'inBetween',
            values: [0.5, 99.9],
            is: true,
        });
    });

    it('Between operator with dates', async () => {
        expect(parser.parse('between 2024-01-01 and 2024-12-31')).toEqual({
            type: 'inBetween',
            values: ['2024-01-01', '2024-12-31'],
            is: true,
        });
        expect(parser.parse('BETWEEN 2023-06-15 AND 2024-06-15')).toEqual({
            type: 'inBetween',
            values: ['2023-06-15', '2024-06-15'],
            is: true,
        });
        expect(parser.parse('between "2024-01-01" and "2024-12-31"')).toEqual({
            type: 'inBetween',
            values: ['2024-01-01', '2024-12-31'],
            is: true,
        });
    });

    it('Between operator with timestamps', async () => {
        expect(
            parser.parse('between 2024-01-01T00:00:00 and 2024-12-31T23:59:59'),
        ).toEqual({
            type: 'inBetween',
            values: ['2024-01-01T00:00:00', '2024-12-31T23:59:59'],
            is: true,
        });
        expect(
            parser.parse(
                'between 2024-01-01T00:00:00Z and 2024-12-31T23:59:59Z',
            ),
        ).toEqual({
            type: 'inBetween',
            values: ['2024-01-01T00:00:00Z', '2024-12-31T23:59:59Z'],
            is: true,
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

const removeIds = (filters: MetricFilterRule[]) =>
    filters.map((filter) => ({ ...filter, id: undefined }));

describe('Parse metric filters', () => {
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
                parseFilters([{ order_id: '> 5' }, { order_id: '<= 10' }]),
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
                operator: FilterOperator.LESS_THAN_OR_EQUAL,
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

    it('Should parse date in the current operator with singular interval', () => {
        const filters = [{ order_date: 'inTheCurrent day' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_THE_CURRENT,
                settings: {
                    unitOfTime: 'days',
                },
                target: {
                    fieldRef: 'order_date',
                },
                values: [1],
            },
        ]);
    });

    it('Should parse date in the current operator with plural interval', () => {
        const filters = [{ order_date: 'inTheCurrent months' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_THE_CURRENT,
                settings: {
                    unitOfTime: 'months',
                },
                target: {
                    fieldRef: 'order_date',
                },
                values: [1],
            },
        ]);
    });

    it('Should parse date not in the current operator with interval', () => {
        const filters = [{ order_date: 'notInTheCurrent week' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.NOT_IN_THE_CURRENT,
                settings: {
                    unitOfTime: 'weeks',
                },
                target: {
                    fieldRef: 'order_date',
                },
                values: [1],
            },
        ]);
    });

    it('Should parse date in the current operator with quarter interval', () => {
        const filters = [{ order_date: 'inTheCurrent quarter' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_THE_CURRENT,
                settings: {
                    unitOfTime: 'quarters',
                },
                target: {
                    fieldRef: 'order_date',
                },
                values: [1],
            },
        ]);
    });

    describe('in the current period to date', () => {
        const currentFilter = (
            operator: FilterOperator,
            settings: Record<string, unknown>,
        ) => [
            {
                id: undefined,
                operator,
                settings,
                target: { fieldRef: 'order_date' },
                values: [1],
            },
        ];

        it.each([
            ['inTheCurrent month to date', 'months'],
            ['inTheCurrent months to date', 'months'],
            ['inTheCurrent week to date', 'weeks'],
            ['inTheCurrent weeks to date', 'weeks'],
            ['inTheCurrent quarter to date', 'quarters'],
            ['inTheCurrent quarters to date', 'quarters'],
            ['inTheCurrent year to date', 'years'],
            ['inTheCurrent years to date', 'years'],
        ])('Should parse "%s" as to date', (expression, unitOfTime) => {
            expect(
                removeIds(parseFilters([{ order_date: expression }])),
            ).toStrictEqual(
                currentFilter(FilterOperator.IN_THE_CURRENT, {
                    unitOfTime,
                    toDate: true,
                }),
            );
        });

        it.each([
            ['inTheCurrent month to date excluding today', 'months'],
            ['inTheCurrent weeks to date excluding today', 'weeks'],
            ['inTheCurrent quarter to date excluding today', 'quarters'],
            ['inTheCurrent years to date excluding today', 'years'],
        ])(
            'Should parse "%s" as to date excluding today',
            (expression, unitOfTime) => {
                expect(
                    removeIds(parseFilters([{ order_date: expression }])),
                ).toStrictEqual(
                    currentFilter(FilterOperator.IN_THE_CURRENT, {
                        unitOfTime,
                        toDate: true,
                        excludeToday: true,
                    }),
                );
            },
        );

        it('Should parse notInTheCurrent with to date', () => {
            expect(
                removeIds(
                    parseFilters([
                        { order_date: 'notInTheCurrent month to date' },
                    ]),
                ),
            ).toStrictEqual(
                currentFilter(FilterOperator.NOT_IN_THE_CURRENT, {
                    unitOfTime: 'months',
                    toDate: true,
                }),
            );
        });

        it('Should parse notInTheCurrent with to date excluding today', () => {
            expect(
                removeIds(
                    parseFilters([
                        {
                            order_date:
                                'notInTheCurrent year to date excluding today',
                        },
                    ]),
                ),
            ).toStrictEqual(
                currentFilter(FilterOperator.NOT_IN_THE_CURRENT, {
                    unitOfTime: 'years',
                    toDate: true,
                    excludeToday: true,
                }),
            );
        });

        it.each([
            '  inTheCurrent   month   to   date  ',
            'inTheCurrent month  to date   excluding   today',
            ' notInTheCurrent  month to date excluding today ',
        ])('Should accept flexible whitespace in "%s"', (expression) => {
            const [rule] = parseFilters([{ order_date: expression }]);
            expect(rule.settings).toStrictEqual({
                unitOfTime: 'months',
                toDate: true,
                ...(expression.includes('excluding') && { excludeToday: true }),
            });
        });

        it('Should not write excludeToday when it is not in the expression', () => {
            const [rule] = parseFilters([
                { order_date: 'inTheCurrent month to date' },
            ]);
            expect(rule.settings).not.toHaveProperty('excludeToday');
        });

        it('Should not write toDate on whole-period expressions', () => {
            const [rule] = parseFilters([{ order_date: 'inTheCurrent month' }]);
            expect(rule.settings).toStrictEqual({ unitOfTime: 'months' });
        });

        it.each([
            'inTheCurrent day to date',
            'inTheCurrent days to date',
            'inTheCurrent hour to date',
            'inTheCurrent minutes to date excluding today',
            'notInTheCurrent day to date',
        ])('Should reject "%s"', (expression) => {
            expect(() => parseFilters([{ order_date: expression }])).toThrow();
        });

        it.each([
            'inTheCurrent month to',
            'inTheCurrent month date',
            'inTheCurrent month excluding today',
            'inTheCurrent month todate',
            'inTheCurrent month to date excluding',
            'inTheCurrent month To Date',
        ])('Should reject malformed suffix "%s"', (expression) => {
            expect(() => parseFilters([{ order_date: expression }])).toThrow();
        });

        it('Should parse to date in model required filters', () => {
            const [rule] = parseModelRequiredFilters({
                requiredFilters: [
                    {
                        order_date:
                            'inTheCurrent month to date excluding today',
                    },
                ],
                defaultFilters: undefined,
            });
            expect(rule.operator).toBe(FilterOperator.IN_THE_CURRENT);
            expect(rule.settings).toStrictEqual({
                unitOfTime: 'months',
                toDate: true,
                excludeToday: true,
            });
            expect(rule.required).toBe(true);
        });
    });

    it('Should parse between operator with two values', () => {
        const filters = [{ length_of_session: 'between 1 and 3600' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_BETWEEN,
                target: {
                    fieldRef: 'length_of_session',
                },
                values: [1, 3600],
            },
        ]);
    });

    it('Should parse between operator with date values', () => {
        const filters = [{ order_date: 'between 2024-01-01 and 2024-12-31' }];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_BETWEEN,
                target: {
                    fieldRef: 'order_date',
                },
                values: ['2024-01-01', '2024-12-31'],
            },
        ]);
    });

    it('Should parse between operator with timestamp values', () => {
        const filters = [
            {
                created_at:
                    'between 2024-01-01T00:00:00Z and 2024-12-31T23:59:59Z',
            },
        ];
        expect(removeIds(parseFilters(filters))).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_BETWEEN,
                target: {
                    fieldRef: 'created_at',
                },
                values: ['2024-01-01T00:00:00Z', '2024-12-31T23:59:59Z'],
            },
        ]);
    });
});

describe('Parse required filters', () => {
    it('Should parse a filter field called "required"', () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    requiredFilters: [{ required: true }],
                    defaultFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'required',
                },
                values: [true],
                required: true, // Default
            },
        ]);
        expect(
            removeIds(
                parseModelRequiredFilters({
                    requiredFilters: [{ required: false }],
                    defaultFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'required',
                },
                values: [false],
                required: true, // Default
            },
        ]);
    });
    it('Should required filters default to "required: true"', () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    requiredFilters: [{ position: 1 }],
                    defaultFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: true,
            },
        ]);
    });
    it('Should parse required option on required filters', () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    requiredFilters: [{ position: 1, required: true }],
                    defaultFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: true,
            },
        ]);
        expect(
            removeIds(
                parseModelRequiredFilters({
                    requiredFilters: [{ position: 1, required: false }],
                    defaultFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: false,
            },
        ]);
    });

    it('Should default filters default to "required: false"', () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    defaultFilters: [{ position: 1 }],
                    requiredFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: false,
            },
        ]);
    });

    it('Should parse required option on default filters', () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    defaultFilters: [{ position: 1, required: true }],
                    requiredFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: true,
            },
        ]);
        expect(
            removeIds(
                parseModelRequiredFilters({
                    defaultFilters: [{ position: 1, required: false }],
                    requiredFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: false,
            },
        ]);
    });

    it('Should parse default and required filters with default values', () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    requiredFilters: [{ name: 'javi' }],

                    defaultFilters: [{ position: 1 }],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'name',
                },
                values: ['javi'],
                required: true,
            },
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: false,
            },
        ]);
    });

    it('Should reject a filter whose value is a map', () => {
        expect(() =>
            parseModelRequiredFilters({
                requiredFilters: [{ order_date: { inThePast: '14 days' } }],
                defaultFilters: [],
            }),
        ).toThrow(
            'Filter "order_date" must be a single value or a list of values, not a map',
        );
    });

    it('Should parse default and required filters with opposite values', () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    defaultFilters: [{ position: 1, required: true }],
                    requiredFilters: [{ name: 'javi', required: false }],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'name',
                },
                values: ['javi'],
                required: false,
            },
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'position',
                },
                values: [1],
                required: true,
            },
        ]);
    });
    it('Should take required from required filters if there is a duplicated filter', () => {
        const consoleWarnSpy = vi
            .spyOn(console, 'warn')
            .mockImplementation(() => {});

        const requiredFilters = removeIds(
            parseModelRequiredFilters({
                requiredFilters: [{ name: 'javi' }],
                defaultFilters: [{ name: 'javi' }],
            }),
        );
        expect(requiredFilters.length).toBe(1);
        expect(requiredFilters).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'name',
                },
                values: ['javi'],
                required: true,
            },
        ]);

        removeIds(
            parseModelRequiredFilters({
                requiredFilters: [{ name: 'javi' }],
                defaultFilters: [{ name: 'javi' }],
            }),
        );

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Duplicate filter key "name" in default filters',
        );

        consoleWarnSpy.mockRestore();

        // Take required from required filters
        expect(
            removeIds(
                parseModelRequiredFilters({
                    requiredFilters: [{ name: 'javi', required: false }],
                    defaultFilters: [{ name: 'javi' }],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.EQUALS,
                target: {
                    fieldRef: 'name',
                },
                values: ['javi'],
                required: false,
            },
        ]);
    });

    it('Should parse between operator in default filters', async () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    defaultFilters: [
                        { length_of_session: 'between 1 and 3600' },
                    ],
                    requiredFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_BETWEEN,
                target: {
                    fieldRef: 'length_of_session',
                },
                values: [1, 3600],
                required: false,
            },
        ]);
    });

    it('Should parse between operator with dates in default filters', async () => {
        expect(
            removeIds(
                parseModelRequiredFilters({
                    defaultFilters: [
                        { order_date: 'between 2024-01-01 and 2024-12-31' },
                    ],
                    requiredFilters: [],
                }),
            ),
        ).toStrictEqual([
            {
                id: undefined,
                operator: FilterOperator.IN_BETWEEN,
                target: {
                    fieldRef: 'order_date',
                },
                values: ['2024-01-01', '2024-12-31'],
                required: false,
            },
        ]);
    });
});
