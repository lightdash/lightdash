import moment from 'moment/moment';
import { FilterOperator, UnitOfTime } from '../types/filter';
import { WeekDay } from '../utils/timeFrames';
import {
    renderBooleanFilterSql,
    renderDateFilterSql,
    renderFilterRuleSqlFromField,
    renderNumberFilterSql,
    renderStringFilterSql,
} from './filtersCompiler';
import {
    DimensionSqlMock,
    ExpectedInTheCurrentFilterSQL,
    ExpectedInTheCurrentWeekFilterSQLWithCustomStartOfWeek,
    ExpectedInTheNextCompleteFilterSQL,
    ExpectedInTheNextCompleteWeekFilterSQLWithCustomStartOfWeek,
    ExpectedInTheNextFilterSQL,
    ExpectedInThePastCompleteWeekFilterSQLWithCustomStartOfWeek,
    ExpectedNumberFilterSQL,
    InBetweenPastTwoYearsFilter,
    InBetweenPastTwoYearsFilterSQL,
    InBetweenPastTwoYearsTimestampFilterSQL,
    InTheCurrentFilterBase,
    InTheLast1CompletedDayFilter,
    InTheLast1CompletedDayFilterSQL,
    InTheLast1CompletedHourFilter,
    InTheLast1CompletedHourFilterSQL,
    InTheLast1CompletedMinuteFilter,
    InTheLast1CompletedMinuteFilterSQL,
    InTheLast1CompletedMonthFilter,
    InTheLast1CompletedMonthFilterSQL,
    InTheLast1CompletedWeekFilter,
    InTheLast1CompletedWeekFilterSQL,
    InTheLast1CompletedYearFilter,
    InTheLast1CompletedYearFilterSQL,
    InTheLast1DayFilter,
    InTheLast1DayFilterSQL,
    InTheLast1HourFilter,
    InTheLast1HourFilterSQL,
    InTheLast1MinuteFilter,
    InTheLast1MinuteFilterSQL,
    InTheLast1MonthFilter,
    InTheLast1MonthFilterSQL,
    InTheLast1WeekFilter,
    InTheLast1WeekFilterSQL,
    InTheLast1YearFilter,
    InTheLast1YearFilterSQL,
    InTheNextFilterBase,
    InThePastFilterBase,
    NumberDimensionMock,
    NumberFilterBase,
    NumberFilterBaseWithMultiValues,
    NumberOperatorsWithMultipleValues,
    TrinoExpectedInTheCurrentFilterSQL,
    TrinoExpectedInTheCurrentWeekFilterSQLWithCustomStartOfWeek,
    TrinoExpectedInTheNextCompleteFilterSQL,
    TrinoExpectedInTheNextCompleteWeekFilterSQLWithCustomStartOfWeek,
    TrinoExpectedInTheNextFilterSQL,
    TrinoExpectedInThePastCompleteWeekFilterSQLWithCustomStartOfWeek,
    TrinoInBetweenPastTwoYearsFilterSQL,
    TrinoInBetweenPastTwoYearsTimestampFilterSQL,
    TrinoInTheLast1CompletedDayFilterSQL,
    TrinoInTheLast1CompletedHourFilterSQL,
    TrinoInTheLast1CompletedMinuteFilterSQL,
    TrinoInTheLast1CompletedMonthFilterSQL,
    TrinoInTheLast1CompletedWeekFilterSQL,
    TrinoInTheLast1CompletedYearFilterSQL,
    TrinoInTheLast1DayFilterSQL,
    TrinoInTheLast1HourFilterSQL,
    TrinoInTheLast1MinuteFilterSQL,
    TrinoInTheLast1MonthFilterSQL,
    TrinoInTheLast1WeekFilterSQL,
    TrinoInTheLast1YearFilterSQL,
    adapterType,
    disabledFilterMock,
    filterInTheCurrentDayTimezoneMocks,
    stringFilterDimension,
    stringFilterRuleMocks,
} from './filtersCompiler.mock';

const formatTimestamp = (date: Date): string =>
    moment(date).format('YYYY-MM-DD HH:mm:ss');

describe('Filter SQL', () => {
    beforeAll(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
    });
    afterAll(() => {
        jest.useFakeTimers();
    });
    test.each(Object.values(FilterOperator))(
        'should return number filter sql for operator %s',
        (operator) => {
            if (!ExpectedNumberFilterSQL[operator]) {
                expect(() => {
                    renderNumberFilterSql(NumberDimensionMock, {
                        ...NumberFilterBase,
                        operator,
                    });
                }).toThrow();
                return;
            }

            if (NumberOperatorsWithMultipleValues.includes(operator)) {
                expect(
                    renderNumberFilterSql(NumberDimensionMock, {
                        ...NumberFilterBaseWithMultiValues,
                        operator,
                    }),
                ).toStrictEqual(ExpectedNumberFilterSQL[operator]);

                return;
            }

            expect(
                renderNumberFilterSql(NumberDimensionMock, {
                    ...NumberFilterBase,
                    operator,
                }),
            ).toStrictEqual(ExpectedNumberFilterSQL[operator]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the current %s filter sql',
        (unitOfTime) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    {
                        ...InTheCurrentFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType.default,
                    'UTC',
                    formatTimestamp,
                ),
            ).toStrictEqual(ExpectedInTheCurrentFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the current %s filter sql for trino adapter',
        (unitOfTime) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    {
                        ...InTheCurrentFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType.trino,
                    'UTC',
                    formatTimestamp,
                ),
            ).toStrictEqual(TrinoExpectedInTheCurrentFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next %s filter sql',
        (unitOfTime) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType.default,
                    'UTC',
                    formatTimestamp,
                ),
            ).toStrictEqual(ExpectedInTheNextFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next %s filter sql for trino adapter',
        (unitOfTime) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType.trino,
                    'UTC',
                    formatTimestamp,
                ),
            ).toStrictEqual(TrinoExpectedInTheNextFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next complete %s filter sql',
        (unitOfTime) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime, completed: true },
                    },
                    adapterType.default,
                    'UTC',
                    formatTimestamp,
                ),
            ).toStrictEqual(ExpectedInTheNextCompleteFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next complete %s filter sql for trino adapter',
        (unitOfTime) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime, completed: true },
                    },
                    adapterType.trino,
                    'UTC',
                    formatTimestamp,
                ),
            ).toStrictEqual(
                TrinoExpectedInTheNextCompleteFilterSQL[unitOfTime],
            );
        },
    );
    test.each([WeekDay.MONDAY, WeekDay.SUNDAY])(
        'should return in the next complete week filter sql with %s as the start of the week',
        (weekDay) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheNextFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    filter,
                    adapterType.default,
                    'UTC',
                    formatTimestamp,
                    weekDay,
                ),
            ).toStrictEqual(
                ExpectedInTheNextCompleteWeekFilterSQLWithCustomStartOfWeek[
                    weekDay as WeekDay.MONDAY | WeekDay.SUNDAY
                ],
            );
        },
    );
    test.each([WeekDay.MONDAY, WeekDay.SUNDAY])(
        'should return in the next complete week filter sql with %s as the start of the week for trino adapter',
        (weekDay) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheNextFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    filter,
                    adapterType.trino,
                    'UTC',
                    formatTimestamp,
                    weekDay,
                ),
            ).toStrictEqual(
                TrinoExpectedInTheNextCompleteWeekFilterSQLWithCustomStartOfWeek[
                    weekDay as WeekDay.MONDAY | WeekDay.SUNDAY
                ],
            );
        },
    );
    test.each([WeekDay.MONDAY, WeekDay.SUNDAY])(
        'should return in the last complete week filter sql with %s as the start of the week',
        (weekDay) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InThePastFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    filter,
                    adapterType.default,
                    'UTC',
                    formatTimestamp,
                    weekDay,
                ),
            ).toStrictEqual(
                ExpectedInThePastCompleteWeekFilterSQLWithCustomStartOfWeek[
                    weekDay as WeekDay.MONDAY | WeekDay.SUNDAY
                ],
            );
        },
    );
    test.each([WeekDay.MONDAY, WeekDay.SUNDAY])(
        'should return in the last complete week filter sql with %s as the start of the week for trino adapter',
        (weekDay) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InThePastFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    filter,
                    adapterType.trino,
                    'UTC',
                    formatTimestamp,
                    weekDay,
                ),
            ).toStrictEqual(
                TrinoExpectedInThePastCompleteWeekFilterSQLWithCustomStartOfWeek[
                    weekDay as WeekDay.MONDAY | WeekDay.SUNDAY
                ],
            );
        },
    );
    test.each([WeekDay.MONDAY, WeekDay.SUNDAY])(
        'should return in the current complete week filter sql with %s as the start of the week',
        (weekDay) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheCurrentFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    filter,
                    adapterType.default,
                    'UTC',
                    formatTimestamp,
                    weekDay,
                ),
            ).toStrictEqual(
                ExpectedInTheCurrentWeekFilterSQLWithCustomStartOfWeek[
                    weekDay as WeekDay.MONDAY | WeekDay.SUNDAY
                ],
            );
        },
    );
    test.each([WeekDay.MONDAY, WeekDay.SUNDAY])(
        'should return in the current complete week filter sql with %s as the start of the week for trino adapter',
        (weekDay) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheCurrentFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    filter,
                    adapterType.trino,
                    'UTC',
                    formatTimestamp,
                    weekDay,
                ),
            ).toStrictEqual(
                TrinoExpectedInTheCurrentWeekFilterSQLWithCustomStartOfWeek[
                    weekDay as WeekDay.MONDAY | WeekDay.SUNDAY
                ],
            );
        },
    );
    test('should return in the last date filter sql', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1DayFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1DayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1WeekFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1WeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MonthFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1MonthFilterSQL);

        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1YearFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1YearFilterSQL);
    });
    test('should return in the last date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1DayFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1DayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1WeekFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1WeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MonthFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1MonthFilterSQL);

        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1YearFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1YearFilterSQL);
    });

    test('should return in the last completed date filter sql ', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedDayFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1CompletedDayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedWeekFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1CompletedWeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMonthFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1CompletedMonthFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedYearFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InTheLast1CompletedYearFilterSQL);
    });
    test('should return in the last completed date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedDayFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedDayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedWeekFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedWeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMonthFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedMonthFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedYearFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedYearFilterSQL);
    });

    test('should return in the last date filter sql for timestamps', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1HourFilter,
                adapterType.default,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1HourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedHourFilter,
                adapterType.default,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1CompletedHourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MinuteFilter,
                adapterType.default,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1MinuteFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMinuteFilter,
                adapterType.default,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1CompletedMinuteFilterSQL);
    });
    test('should return in the last date filter sql for timestamps for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1HourFilter,
                adapterType.trino,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInTheLast1HourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedHourFilter,
                adapterType.trino,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedHourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MinuteFilter,
                adapterType.trino,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInTheLast1MinuteFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMinuteFilter,
                adapterType.trino,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedMinuteFilterSQL);
    });

    test('should return in between date filter sql', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InBetweenPastTwoYearsFilter,
                adapterType.default,
                'UTC',
            ),
        ).toStrictEqual(InBetweenPastTwoYearsFilterSQL);
    });
    test('should return in between date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InBetweenPastTwoYearsFilter,
                adapterType.trino,
                'UTC',
            ),
        ).toStrictEqual(TrinoInBetweenPastTwoYearsFilterSQL);
    });

    test('should return in between date filter sql for timestamps', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InBetweenPastTwoYearsFilter,
                adapterType.default,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(InBetweenPastTwoYearsTimestampFilterSQL);
    });
    test('should return in between date filter sql for timestamps for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InBetweenPastTwoYearsFilter,
                adapterType.trino,
                'UTC',
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInBetweenPastTwoYearsTimestampFilterSQL);
    });

    test.each(filterInTheCurrentDayTimezoneMocks)(
        'should return in the current day filter sql for timezone %s',
        (timezone, expected) => {
            jest.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql(
                    DimensionSqlMock,
                    InTheCurrentFilterBase,
                    adapterType.default,
                    timezone,
                    formatTimestamp,
                ),
            ).toStrictEqual(expected);
        },
    );

    test('should return single value in includes filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.includeFilterWithSingleVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.includeFilterWithSingleValSQL);
    });

    test('should return multiple values joined by OR in includes filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.includeFilterWithMultiVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.includeFilterWithMultiValSQL);
    });

    test('should return true in includes filter sql for empty filter', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.includeFilterWithNoVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.includeFilterWithNoValSQL);
    });

    test('should return single value in notIncludes filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notIncludeFilterWithSingleVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notIncludeFilterWithSingleValSQL);
    });

    test('should return multiple values joined by AND in notIncludes filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notIncludeFilterWithMultiVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notIncludeFilterWithMultiValSQL);
    });

    test('should return true in notIncludes filter sql for empty filter', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notIncludeFilterWithNoVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notIncludeFilterWithNoValSQL);
    });

    test('should return true when includes filter has empty string value', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.includeFilterWithEmptyString,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.includeFilterWithEmptyStringSQL);
    });

    test('should filter out empty strings and process valid values in mixed array', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.includeFilterWithMixedEmptyStrings,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.includeFilterWithMixedEmptyStringsSQL);
    });

    test('should return empty string filter sql when equals filter has empty string value', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.equalsFilterWithEmptyString,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.equalsFilterWithEmptyStringSQL);
    });

    test('should return true when starts with filter has empty string value', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.startsWithFilterWithEmptyString,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.startsWithFilterWithEmptyStringSQL);
    });

    test('should return true when ends with filter has empty string value', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.endsWithFilterWithEmptyString,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.endsWithFilterWithEmptyStringSQL);
    });

    test('should return true when not equals filter has empty string value', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notEqualsFilterWithEmptyString,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notEqualsFilterWithEmptyStringSQL);
    });

    test('should return true when not include filter has empty string value', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notIncludeFilterWithEmptyString,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notIncludeFilterWithEmptyStringSQL);
    });

    test('should return single value in startsWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.startsWithFilterWithSingleVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.startsWithFilterWithSingleValSQL);
    });

    test('should return multiple values joined by OR in startsWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.startsWithFilterWithMultiVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.startsWithFilterWithMultiValSQL);
    });

    test('should return true in startsWith filter sql for empty filter', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.startsWithFilterWithNoVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.startsWithFilterWithNoValSQL);
    });

    test('should return single value in endsWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.endsWithFilterWithSingleVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.endsWithFilterWithSingleValSQL);
    });

    test('should return multiple values joined by OR in endsWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.endsWithFilterWithMultiVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.endsWithFilterWithMultiValSQL);
    });

    test('should return true in endsWith filter sql for empty filter', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.endsWithFilterWithNoVal,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.endsWithFilterWithNoValSQL);
    });

    test('should return 1=1 if filter is disabled', () => {
        expect(
            renderFilterRuleSqlFromField(
                disabledFilterMock.filterRule,
                disabledFilterMock.field,
                disabledFilterMock.fieldQuoteChar,
                disabledFilterMock.stringQuoteChar,
                disabledFilterMock.escapeString,
                disabledFilterMock.startOfWeek,
                disabledFilterMock.adapterType,
                disabledFilterMock.timezone,
            ),
        ).toBe('1=1');
    });
});

describe('escape string values', () => {
    test('should not escape on the string filter method', () => {
        // Escape happens now on the parent method, not on the string filter
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.equalsFilterWithSingleUnescapedValue,
                "'",
            ),
        ).toBe(`("customers".first_name) IN ('Bob's')`);
    });

    test('should return escaped query for unescaped single filter value', () => {
        expect(
            renderFilterRuleSqlFromField(
                stringFilterRuleMocks.equalsFilterWithSingleUnescapedValue,
                disabledFilterMock.field,
                disabledFilterMock.fieldQuoteChar,
                disabledFilterMock.stringQuoteChar,
                (v) => v.replaceAll("'", "''"),
                disabledFilterMock.startOfWeek,
                disabledFilterMock.adapterType,
                disabledFilterMock.timezone,
            ),
        ).toBe(`("payments".payment_method) IN ('Bob''s')`);
    });

    test('should return escaped query for unescaped multi filter values', () => {
        expect(
            renderFilterRuleSqlFromField(
                stringFilterRuleMocks.equalsFilterWithMultiUnescapedValue,
                disabledFilterMock.field,
                disabledFilterMock.fieldQuoteChar,
                disabledFilterMock.stringQuoteChar,
                (v) => v.replaceAll("'", "''"),
                disabledFilterMock.startOfWeek,
                disabledFilterMock.adapterType,
                disabledFilterMock.timezone,
            ),
        ).toBe(`("payments".payment_method) IN ('Bob''s','Tom''s')`);
    });
});

describe('Boolean Filter SQL', () => {
    const dimensionSql = '("table"."is_active")';
    const baseFilter = {
        id: 'test-id',
        target: { fieldId: 'is_active' },
    };

    describe('equals operator', () => {
        it('should handle boolean true correctly', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [true],
            };
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '(("table"."is_active")) = true',
            );
        });

        it('should handle boolean false correctly', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [false],
            };
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '(("table"."is_active")) = false',
            );
        });

        it('should handle string "true" correctly', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['true'],
            };
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '(("table"."is_active")) = true',
            );
        });

        it('should handle string "false" correctly (THIS WILL FAIL BEFORE FIX)', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['false'],
            };
            // This test will fail initially because current implementation returns "true"
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '(("table"."is_active")) = false',
            );
        });

        it('should handle case insensitive string booleans', () => {
            const filterFalse = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['FALSE'],
            };
            const filterTrue = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['TRUE'],
            };

            expect(renderBooleanFilterSql(dimensionSql, filterFalse)).toBe(
                '(("table"."is_active")) = false',
            );
            expect(renderBooleanFilterSql(dimensionSql, filterTrue)).toBe(
                '(("table"."is_active")) = true',
            );
        });

        it('should handle whitespace around boolean strings', () => {
            const filterFalse = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [' false '],
            };
            const filterTrue = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [' true '],
            };

            expect(renderBooleanFilterSql(dimensionSql, filterFalse)).toBe(
                '(("table"."is_active")) = false',
            );
            expect(renderBooleanFilterSql(dimensionSql, filterTrue)).toBe(
                '(("table"."is_active")) = true',
            );
        });
    });

    describe('notEquals operator', () => {
        it('should handle boolean false correctly', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.NOT_EQUALS,
                values: [false],
            };
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '((("table"."is_active")) != false OR (("table"."is_active")) IS NULL)',
            );
        });

        it('should handle string "false" correctly (THIS WILL FAIL BEFORE FIX)', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.NOT_EQUALS,
                values: ['false'],
            };
            // This test will fail initially because current implementation uses "true"
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '((("table"."is_active")) != false OR (("table"."is_active")) IS NULL)',
            );
        });
    });

    describe('isNull and notNull operators', () => {
        it('should handle isNull operator', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.NULL,
                values: [true],
            };
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '(("table"."is_active")) IS NULL',
            );
        });

        it('should handle notNull operator', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.NOT_NULL,
                values: [true],
            };
            expect(renderBooleanFilterSql(dimensionSql, filter)).toBe(
                '(("table"."is_active")) IS NOT NULL',
            );
        });
    });
});

describe('Number Filter SQL Injection Prevention', () => {
    const dimensionSql = '("table"."customer_id")';
    const baseFilter = {
        id: 'test-id',
        target: { fieldId: 'customer_id' },
    };

    describe('SQL injection attempts should throw errors', () => {
        it('should reject SQL injection in EQUALS filter', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['1) OR 1=1; --'],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "1) OR 1=1; --". Expected a valid number.',
            );
        });

        it('should reject SQL injection with UNION SELECT', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['1) UNION SELECT * FROM users; --'],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "1) UNION SELECT * FROM users; --". Expected a valid number.',
            );
        });

        it('should reject SQL injection in NOT_EQUALS filter', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.NOT_EQUALS,
                values: ['1); DELETE FROM customers; --'],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "1); DELETE FROM customers; --". Expected a valid number.',
            );
        });

        it('should reject subquery injection attempts', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['SELECT customer_id FROM customers'],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "SELECT customer_id FROM customers". Expected a valid number.',
            );
        });

        it('should reject multiple SQL injection values', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['1', '2) OR 1=1; --', '3'],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "2) OR 1=1; --". Expected a valid number.',
            );
        });

        it('should reject SQL injection in comparison operators', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.GREATER_THAN,
                values: ['1 OR 1=1'],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "1 OR 1=1". Expected a valid number.',
            );
        });

        it('should reject SQL injection in BETWEEN operator', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.IN_BETWEEN,
                values: ['1', '100); DROP TABLE customers; --'],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "100); DROP TABLE customers; --". Expected a valid number.',
            );
        });
    });

    describe('Valid number inputs should be accepted', () => {
        it('should accept valid integer values', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [1, 2, 3],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                '(("table"."customer_id")) IN (1,2,3)',
            );
        });

        it('should accept valid decimal values', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [1.5, 2.7, 3.14159],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                '(("table"."customer_id")) IN (1.5,2.7,3.14159)',
            );
        });

        it('should accept negative numbers', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [-1, -2.5, -100],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                '(("table"."customer_id")) IN (-1,-2.5,-100)',
            );
        });

        it('should accept numeric strings that can be converted', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['123', '456.78', '-90'],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                '(("table"."customer_id")) IN (123,456.78,-90)',
            );
        });

        it('should handle comparison operators with valid numbers', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.GREATER_THAN,
                values: ['100'],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                '(("table"."customer_id")) > (100)',
            );
        });

        it('should handle BETWEEN operator with valid numbers', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.IN_BETWEEN,
                values: ['10', '100'],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                '(("table"."customer_id")) >= (10) AND (("table"."customer_id")) <= (100)',
            );
        });
    });

    describe('Edge cases and special values', () => {
        it('should reject NaN values', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [NaN],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "NaN". Expected a valid number.',
            );
        });

        it('should reject Infinity values', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [Infinity],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "Infinity". Expected a valid number.',
            );
        });

        it('should reject string values that are not numbers', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['abc', 'hello world', ''],
            };
            expect(() => renderNumberFilterSql(dimensionSql, filter)).toThrow(
                'Invalid number value in filter: "abc". Expected a valid number.',
            );
        });

        it('should reject objects and arrays', () => {
            const filterWithObject = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [{}],
            };
            expect(() =>
                renderNumberFilterSql(dimensionSql, filterWithObject),
            ).toThrow(
                'Invalid number value in filter: "[object Object]". Expected a valid number.',
            );

            const filterWithArray = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: [[1, 2, 3]],
            };
            expect(() =>
                renderNumberFilterSql(dimensionSql, filterWithArray),
            ).toThrow(
                'Invalid number value in filter: "1,2,3". Expected a valid number.',
            );
        });

        it('should handle exponential notation', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.EQUALS,
                values: ['1e3', '2.5e-4'],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                '(("table"."customer_id")) IN (1000,0.00025)',
            );
        });

        it('should return true for comparison operators with empty values', () => {
            const comparisonOperators = [
                FilterOperator.GREATER_THAN,
                FilterOperator.GREATER_THAN_OR_EQUAL,
                FilterOperator.LESS_THAN,
                FilterOperator.LESS_THAN_OR_EQUAL,
            ];

            comparisonOperators.forEach((operator) => {
                const filter = {
                    ...baseFilter,
                    operator,
                    values: [],
                };
                expect(renderNumberFilterSql(dimensionSql, filter)).toBe(
                    'true',
                );
            });
        });

        it('should return true for IN_BETWEEN operator with empty values', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.IN_BETWEEN,
                values: [],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe('true');
        });

        it('should return true for IN_BETWEEN operator with only one value', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.IN_BETWEEN,
                values: [5],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe('true');
        });

        it('should return true for NOT_IN_BETWEEN operator with empty values', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.NOT_IN_BETWEEN,
                values: [],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe('true');
        });

        it('should return true for NOT_IN_BETWEEN operator with only one value', () => {
            const filter = {
                ...baseFilter,
                operator: FilterOperator.NOT_IN_BETWEEN,
                values: [5],
            };
            expect(renderNumberFilterSql(dimensionSql, filter)).toBe('true');
        });
    });
});
