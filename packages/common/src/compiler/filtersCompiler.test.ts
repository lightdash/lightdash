import moment from 'moment/moment';
import { FilterOperator, UnitOfTime } from '../types/filter';
import { WeekDay } from '../utils/timeFrames';
import {
    renderDateFilterSql,
    renderFilterRuleSql,
    renderNumberFilterSql,
    renderStringFilterSql,
} from './filtersCompiler';
import {
    adapterType,
    DimensionSqlMock,
    disabledFilterMock,
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
    stringFilterDimension,
    stringFilterRuleMocks,
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
            if (ExpectedNumberFilterSQL[operator]) {
                expect(
                    renderNumberFilterSql(NumberDimensionMock, {
                        ...NumberFilterBase,
                        operator,
                    }),
                ).toStrictEqual(ExpectedNumberFilterSQL[operator]);
            } else {
                expect(() => {
                    renderNumberFilterSql(NumberDimensionMock, {
                        ...NumberFilterBase,
                        operator,
                    });
                }).toThrow();
            }
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
            ),
        ).toStrictEqual(InTheLast1DayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1WeekFilter,
                adapterType.default,
            ),
        ).toStrictEqual(InTheLast1WeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MonthFilter,
                adapterType.default,
            ),
        ).toStrictEqual(InTheLast1MonthFilterSQL);

        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1YearFilter,
                adapterType.default,
            ),
        ).toStrictEqual(InTheLast1YearFilterSQL);
    });
    test('should return in the last date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1DayFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1DayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1WeekFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1WeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MonthFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1MonthFilterSQL);

        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1YearFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1YearFilterSQL);
    });

    test('should return in the last completed date filter sql ', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedDayFilter,
                adapterType.default,
            ),
        ).toStrictEqual(InTheLast1CompletedDayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedWeekFilter,
                adapterType.default,
            ),
        ).toStrictEqual(InTheLast1CompletedWeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMonthFilter,
                adapterType.default,
            ),
        ).toStrictEqual(InTheLast1CompletedMonthFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedYearFilter,
                adapterType.default,
            ),
        ).toStrictEqual(InTheLast1CompletedYearFilterSQL);
    });
    test('should return in the last completed date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedDayFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedDayFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedWeekFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedWeekFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMonthFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedMonthFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedYearFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedYearFilterSQL);
    });

    test('should return in the last date filter sql for timestamps', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1HourFilter,
                adapterType.default,
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1HourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedHourFilter,
                adapterType.default,
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1CompletedHourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MinuteFilter,
                adapterType.default,
                formatTimestamp,
            ),
        ).toStrictEqual(InTheLast1MinuteFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMinuteFilter,
                adapterType.default,
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
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInTheLast1HourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedHourFilter,
                adapterType.trino,
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInTheLast1CompletedHourFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1MinuteFilter,
                adapterType.trino,
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInTheLast1MinuteFilterSQL);
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InTheLast1CompletedMinuteFilter,
                adapterType.trino,
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
            ),
        ).toStrictEqual(InBetweenPastTwoYearsFilterSQL);
    });
    test('should return in between date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InBetweenPastTwoYearsFilter,
                adapterType.trino,
            ),
        ).toStrictEqual(TrinoInBetweenPastTwoYearsFilterSQL);
    });

    test('should return in between date filter sql for timestamps', () => {
        expect(
            renderDateFilterSql(
                DimensionSqlMock,
                InBetweenPastTwoYearsFilter,
                adapterType.default,
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
                formatTimestamp,
            ),
        ).toStrictEqual(TrinoInBetweenPastTwoYearsTimestampFilterSQL);
    });

    test('should return single value in includes filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.includeFilterWithSingleVal,
                "'",
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
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notIncludeFilterWithNoValSQL);
    });

    test('should return single value in startsWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.startsWithFilterWithSingleVal,
                "'",
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
                "'",
            ),
        ).toBe(stringFilterRuleMocks.startsWithFilterWithNoValSQL);
    });

    test('should return single value in doesNotStartWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notStartsWithFilterWithSingleVal,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notStartsWithFilterWithSingleValSQL);
    });

    test('should return multiple values joined by AND in doesNotStartWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notStartsWithFilterWithMultiVal,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notStartsWithFilterWithMultiValSQL);
    });

    test('should return true in doesNotStartWith filter sql for empty filter', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notStartsWithFilterWithNoVal,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notStartsWithFilterWithNoValSQL);
    });

    test('should return single value in endsWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.endsWithFilterWithSingleVal,
                "'",
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
                "'",
            ),
        ).toBe(stringFilterRuleMocks.endsWithFilterWithNoValSQL);
    });

    test('should return single value in doesNotEndWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notEndsWithFilterWithSingleVal,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notEndsWithFilterWithSingleValSQL);
    });

    test('should return multiple values joined by AND in doesNotEndWith filter sql', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notEndsWithFilterWithMultiVal,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notEndsWithFilterWithMultiValSQL);
    });

    test('should return true in doesNotEndWith filter sql for empty filter', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.notEndsWithFilterWithNoVal,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.notEndsWithFilterWithNoValSQL);
    });

    test('should return escaped query for unescaped single filter value', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.equalsFilterWithSingleUnescapedValue,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.equalsFilterWithSingleUnescapedValueSQL);
    });

    test('should return escaped query for unescaped multi filter values', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.equalsFilterWithMultiUnescapedValue,
                "'",
                "'",
            ),
        ).toBe(stringFilterRuleMocks.equalsFilterWithMultiUnescapedValueSQL);
    });

    test('should return 1=1 if filter is disabled', () => {
        expect(
            renderFilterRuleSql(
                disabledFilterMock.filterRule,
                disabledFilterMock.field,
                disabledFilterMock.fieldQuoteChar,
                disabledFilterMock.stringQuoteChar,
                disabledFilterMock.escapeStringQuoteChar,
                disabledFilterMock.startOfWeek,
                disabledFilterMock.adapterType,
            ),
        ).toBe('1=1');
    });
});
