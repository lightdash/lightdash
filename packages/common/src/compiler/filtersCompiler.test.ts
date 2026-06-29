import momentTz from 'moment-timezone';
import moment from 'moment/moment';
import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType } from '../types/field';
import { FilterOperator, UnitOfTime, type FilterRule } from '../types/filter';
import { WeekDay } from '../utils/timeFrames';
import {
    createBoundaryDateFormatter,
    renderBooleanFilterSql,
    renderDateFilterSql,
    renderFilterRuleSql,
    renderFilterRuleSqlFromField,
    renderNumberFilterSql,
    renderStringFilterSql,
    renderTimestampFilterSql,
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
    filterInTheCurrentDayDateFormatterMocks,
    filterInTheCurrentDayTimezoneMocks,
    filterInTheNextCompletedDayDateFormatterMocks,
    filterInTheNextCompletedDayDstMocks,
    filterInTheNextCompletedDayTimezoneMocks,
    filterInTheNextNonCompletedDayDateFormatterMocks,
    filterInTheNextNonCompletedDayDstMocks,
    filterInTheNextNonCompletedDayTimezoneMocks,
    filterInThePastCompletedDayDateFormatterMocks,
    filterInThePastCompletedDayDstMocks,
    filterInThePastCompletedDayTimezoneMocks,
    filterInThePastNonCompletedDayDateFormatterMocks,
    filterInThePastNonCompletedDayDstMocks,
    filterInThePastNonCompletedDayTimezoneMocks,
    filterNegativeOffsetEdgeCaseCurrentDayMocks,
    filterNegativeOffsetEdgeCasePastCompletedDayMocks,
    filterPositiveOffsetEdgeCaseCurrentDayMocks,
    filterPositiveOffsetEdgeCasePastCompletedDayMocks,
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
    MonthToDateFilterBase,
    NumberDimensionMock,
    NumberFilterBase,
    NumberFilterBaseWithMultiValues,
    NumberOperatorsWithMultipleValues,
    QuarterToDateFilterBase,
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
    WeekToDateFilterBase,
    YearToDateFilterBase,
} from './filtersCompiler.mock';

const formatTimestamp = (date: Date): string =>
    moment(date).format('YYYY-MM-DD HH:mm:ssZ');

describe('Filter SQL', () => {
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
    });
    afterAll(() => {
        vi.useRealTimers();
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
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheCurrentFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType: adapterType.default,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(ExpectedInTheCurrentFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the current %s filter sql for trino adapter',
        (unitOfTime) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheCurrentFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType: adapterType.trino,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(TrinoExpectedInTheCurrentFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next %s filter sql',
        (unitOfTime) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType: adapterType.default,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(ExpectedInTheNextFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next %s filter sql for trino adapter',
        (unitOfTime) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime },
                    },
                    adapterType: adapterType.trino,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(TrinoExpectedInTheNextFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next complete %s filter sql',
        (unitOfTime) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime, completed: true },
                    },
                    adapterType: adapterType.default,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(ExpectedInTheNextCompleteFilterSQL[unitOfTime]);
        },
    );
    test.each(Object.values(UnitOfTime))(
        'should return in the next complete %s filter sql for trino adapter',
        (unitOfTime) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: { unitOfTime, completed: true },
                    },
                    adapterType: adapterType.trino,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(
                TrinoExpectedInTheNextCompleteFilterSQL[unitOfTime],
            );
        },
    );
    test.each([WeekDay.MONDAY, WeekDay.SUNDAY])(
        'should return in the next complete week filter sql with %s as the start of the week',
        (weekDay) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheNextFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter,
                    adapterType: adapterType.default,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                    startOfWeek: weekDay,
                }),
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
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheNextFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter,
                    adapterType: adapterType.trino,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                    startOfWeek: weekDay,
                }),
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
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InThePastFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter,
                    adapterType: adapterType.default,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                    startOfWeek: weekDay,
                }),
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
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InThePastFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter,
                    adapterType: adapterType.trino,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                    startOfWeek: weekDay,
                }),
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
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheCurrentFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter,
                    adapterType: adapterType.default,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                    startOfWeek: weekDay,
                }),
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
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            const filter = {
                ...InTheCurrentFilterBase,
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter,
                    adapterType: adapterType.trino,
                    timezone: 'UTC',
                    boundaryDateFormatter: formatTimestamp,
                    startOfWeek: weekDay,
                }),
            ).toStrictEqual(
                TrinoExpectedInTheCurrentWeekFilterSQLWithCustomStartOfWeek[
                    weekDay as WeekDay.MONDAY | WeekDay.SUNDAY
                ],
            );
        },
    );
    test('should return in the last date filter sql', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1DayFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1DayFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1WeekFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1WeekFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1MonthFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1MonthFilterSQL);

        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1YearFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1YearFilterSQL);
    });
    test('should return in the last date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1DayFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1DayFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1WeekFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1WeekFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1MonthFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1MonthFilterSQL);

        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1YearFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1YearFilterSQL);
    });

    test('should return in the last completed date filter sql ', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedDayFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1CompletedDayFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedWeekFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1CompletedWeekFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedMonthFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1CompletedMonthFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedYearFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InTheLast1CompletedYearFilterSQL);
    });
    test('should return in the last completed date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedDayFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1CompletedDayFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedWeekFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1CompletedWeekFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedMonthFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1CompletedMonthFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedYearFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInTheLast1CompletedYearFilterSQL);
    });

    test('should return in the last date filter sql for timestamps', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1HourFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(InTheLast1HourFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedHourFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(InTheLast1CompletedHourFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1MinuteFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(InTheLast1MinuteFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedMinuteFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(InTheLast1CompletedMinuteFilterSQL);
    });
    test('should return in the last date filter sql for timestamps for trino adapter', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1HourFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(TrinoInTheLast1HourFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedHourFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(TrinoInTheLast1CompletedHourFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1MinuteFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(TrinoInTheLast1MinuteFilterSQL);
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InTheLast1CompletedMinuteFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(TrinoInTheLast1CompletedMinuteFilterSQL);
    });

    test('should return in between date filter sql', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InBetweenPastTwoYearsFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
            }),
        ).toStrictEqual(InBetweenPastTwoYearsFilterSQL);
    });
    test('should return in between date filter sql for trino adapter', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InBetweenPastTwoYearsFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
            }),
        ).toStrictEqual(TrinoInBetweenPastTwoYearsFilterSQL);
    });

    test('should return in between date filter sql for timestamps', () => {
        expect(
            renderTimestampFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InBetweenPastTwoYearsFilter,
                adapterType: adapterType.default,
                timezone: 'UTC',
                timestampFormatter: formatTimestamp,
            }),
        ).toStrictEqual(InBetweenPastTwoYearsTimestampFilterSQL);
    });
    test('should return in between date filter sql for timestamps for trino adapter', () => {
        expect(
            renderTimestampFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: InBetweenPastTwoYearsFilter,
                adapterType: adapterType.trino,
                timezone: 'UTC',
                timestampFormatter: formatTimestamp,
            }),
        ).toStrictEqual(TrinoInBetweenPastTwoYearsTimestampFilterSQL);
    });

    // To-date filter tests (system time: 04 Apr 2020 06:12:30 GMT)
    // April 4 2020: dayOfYear=95, dayOfMonth=4, dayInQuarter=3 (Apr1->Apr4), Saturday (dayInWeek=5 with Monday start)
    test('should return year to date filter sql', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: YearToDateFilterBase,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DOY FROM ${DimensionSqlMock}) <= 95)`);
    });

    test('should return year to date filter sql for bigquery', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: YearToDateFilterBase,
                adapterType: SupportedDbtAdapter.BIGQUERY,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DAYOFYEAR FROM ${DimensionSqlMock}) <= 95)`);
    });

    test('should return year to date filter sql for clickhouse', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: YearToDateFilterBase,
                adapterType: SupportedDbtAdapter.CLICKHOUSE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(toDayOfYear(${DimensionSqlMock}) <= 95)`);
    });

    test('should return year to date filter sql for trino', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: YearToDateFilterBase,
                adapterType: SupportedDbtAdapter.TRINO,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DOY FROM ${DimensionSqlMock}) <= 95)`);
    });

    test('should return year to date filter sql for snowflake', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: YearToDateFilterBase,
                adapterType: SupportedDbtAdapter.SNOWFLAKE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DOY FROM ${DimensionSqlMock}) <= 95)`);
    });

    test('should return year to date filter sql for databricks', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: YearToDateFilterBase,
                adapterType: SupportedDbtAdapter.DATABRICKS,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DOY FROM ${DimensionSqlMock}) <= 95)`);
    });

    test('should return year to date filter sql for redshift', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: YearToDateFilterBase,
                adapterType: SupportedDbtAdapter.REDSHIFT,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DOY FROM ${DimensionSqlMock}) <= 95)`);
    });

    test('should return month to date filter sql', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: MonthToDateFilterBase,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DAY FROM ${DimensionSqlMock}) <= 4)`);
    });

    test('should return month to date filter sql for bigquery', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: MonthToDateFilterBase,
                adapterType: SupportedDbtAdapter.BIGQUERY,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DAY FROM ${DimensionSqlMock}) <= 4)`);
    });

    test('should return month to date filter sql for clickhouse', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: MonthToDateFilterBase,
                adapterType: SupportedDbtAdapter.CLICKHOUSE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(toDayOfMonth(${DimensionSqlMock}) <= 4)`);
    });

    test('should return month to date filter sql for trino', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: MonthToDateFilterBase,
                adapterType: SupportedDbtAdapter.TRINO,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DAY FROM ${DimensionSqlMock}) <= 4)`);
    });

    test('should return month to date filter sql for snowflake', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: MonthToDateFilterBase,
                adapterType: SupportedDbtAdapter.SNOWFLAKE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(`(EXTRACT(DAY FROM ${DimensionSqlMock}) <= 4)`);
    });

    test('should return quarter to date filter sql', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: QuarterToDateFilterBase,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock} - DATE_TRUNC('QUARTER', ${DimensionSqlMock})) <= 3)`,
        );
    });

    test('should return quarter to date filter sql for trino', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: QuarterToDateFilterBase,
                adapterType: adapterType.trino,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(DATE_DIFF('day', DATE_TRUNC('quarter', ${DimensionSqlMock}), ${DimensionSqlMock}) <= 3)`,
        );
    });

    test('should return quarter to date filter sql for bigquery', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: QuarterToDateFilterBase,
                adapterType: SupportedDbtAdapter.BIGQUERY,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(DATE_DIFF(${DimensionSqlMock}, DATE_TRUNC(${DimensionSqlMock}, QUARTER), DAY) <= 3)`,
        );
    });

    test('should return quarter to date filter sql for clickhouse', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: QuarterToDateFilterBase,
                adapterType: SupportedDbtAdapter.CLICKHOUSE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(dateDiff('day', toStartOfQuarter(${DimensionSqlMock}), ${DimensionSqlMock}) <= 3)`,
        );
    });

    test('should return quarter to date filter sql for athena', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: QuarterToDateFilterBase,
                adapterType: SupportedDbtAdapter.ATHENA,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(DATE_DIFF('day', DATE_TRUNC('quarter', ${DimensionSqlMock}), ${DimensionSqlMock}) <= 3)`,
        );
    });

    test('should return quarter to date filter sql for snowflake', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: QuarterToDateFilterBase,
                adapterType: SupportedDbtAdapter.SNOWFLAKE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock} - DATE_TRUNC('QUARTER', ${DimensionSqlMock})) <= 3)`,
        );
    });

    test('should return week to date filter sql (monday start)', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock} - DATE_TRUNC('WEEK', ${DimensionSqlMock})) <= 5)`,
        );
    });

    test('should return week to date filter sql for bigquery (sunday start default)', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: SupportedDbtAdapter.BIGQUERY,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(DATE_DIFF(${DimensionSqlMock}, DATE_TRUNC(${DimensionSqlMock}, WEEK(SUNDAY)), DAY) <= 6)`,
        );
    });

    test('should return week to date filter sql for clickhouse (sunday start default)', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: SupportedDbtAdapter.CLICKHOUSE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(dateDiff('day', toStartOfWeek(${DimensionSqlMock}, 0), ${DimensionSqlMock}) <= 6)`,
        );
    });

    test('should return week to date filter sql for trino', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: SupportedDbtAdapter.TRINO,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(DATE_DIFF('day', DATE_TRUNC('week', ${DimensionSqlMock}), ${DimensionSqlMock}) <= 5)`,
        );
    });

    test('should return week to date filter sql for snowflake', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: SupportedDbtAdapter.SNOWFLAKE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
            }),
        ).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock} - DATE_TRUNC('WEEK', ${DimensionSqlMock})) <= 5)`,
        );
    });

    // Week to date with custom startOfWeek
    // April 4, 2020 is Saturday. Monday start: dayInWeek=5 (Mon=0..Sat=5). Sunday start: dayInWeek=6 (Sun=0..Sat=6).
    test('should return week to date filter sql for postgres with sunday start', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: adapterType.default,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
                startOfWeek: WeekDay.SUNDAY,
            }),
        ).toStrictEqual(
            `(EXTRACT(DAY FROM ${DimensionSqlMock} - DATE_TRUNC('WEEK', ${DimensionSqlMock})) <= 6)`,
        );
    });

    test('should return week to date filter sql for bigquery with monday start', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: SupportedDbtAdapter.BIGQUERY,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
                startOfWeek: WeekDay.MONDAY,
            }),
        ).toStrictEqual(
            `(DATE_DIFF(${DimensionSqlMock}, DATE_TRUNC(${DimensionSqlMock}, WEEK(MONDAY)), DAY) <= 5)`,
        );
    });

    test('should return week to date filter sql for clickhouse with monday start', () => {
        expect(
            renderDateFilterSql({
                dimensionSql: DimensionSqlMock,
                filter: WeekToDateFilterBase,
                adapterType: SupportedDbtAdapter.CLICKHOUSE,
                timezone: 'UTC',
                boundaryDateFormatter: formatTimestamp,
                startOfWeek: WeekDay.MONDAY,
            }),
        ).toStrictEqual(
            `(dateDiff('day', toStartOfWeek(${DimensionSqlMock}, 1), ${DimensionSqlMock}) <= 5)`,
        );
    });

    test.each(filterInTheCurrentDayTimezoneMocks)(
        'should return in the current day filter sql for timezone %s',
        (timezone, expected) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: InTheCurrentFilterBase,
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInThePastCompletedDayTimezoneMocks)(
        'should return in the past completed day filter sql for timezone %s',
        (timezone, expected) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InThePastFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: true,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInTheNextCompletedDayTimezoneMocks)(
        'should return in the next completed day filter sql for timezone %s',
        (timezone, expected) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: true,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInThePastCompletedDayDstMocks)(
        'should handle DST spring forward for in the past completed day filter (timezone %s)',
        (timezone, expected) => {
            vi.setSystemTime(new Date('09 Mar 2020 05:00:00 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InThePastFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: true,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInTheNextCompletedDayDstMocks)(
        'should handle DST spring forward for in the next completed day filter (timezone %s)',
        (timezone, expected) => {
            vi.setSystemTime(new Date('07 Mar 2020 05:00:00 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: true,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInThePastNonCompletedDayTimezoneMocks)(
        'should return in the past non-completed day filter sql for timezone %s',
        (timezone, expected) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InThePastFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: false,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInTheNextNonCompletedDayTimezoneMocks)(
        'should return in the next non-completed day filter sql for timezone %s',
        (timezone, expected) => {
            vi.setSystemTime(new Date('04 Apr 2020 06:12:30 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: false,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInThePastNonCompletedDayDstMocks)(
        'should handle DST spring forward for in the past non-completed day filter (timezone %s)',
        (timezone, expected) => {
            vi.setSystemTime(new Date('09 Mar 2020 05:00:00 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InThePastFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: false,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
            ).toStrictEqual(expected);
        },
    );

    test.each(filterInTheNextNonCompletedDayDstMocks)(
        'should handle DST spring forward for in the next non-completed day filter (timezone %s)',
        (timezone, expected) => {
            vi.setSystemTime(new Date('08 Mar 2020 06:00:00 GMT').getTime());
            expect(
                renderDateFilterSql({
                    dimensionSql: DimensionSqlMock,
                    filter: {
                        ...InTheNextFilterBase,
                        settings: {
                            unitOfTime: UnitOfTime.days,
                            completed: false,
                        },
                    },
                    adapterType: adapterType.default,
                    timezone,
                    boundaryDateFormatter: formatTimestamp,
                }),
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

    test('should add OR IS NULL when equals filter includes null with values', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.equalsFilterWithMultiValAndNull,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.equalsFilterWithMultiValAndNullSQL);
    });

    test('should return IS NULL when equals filter includes null with no values', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.equalsFilterWithOnlyNull,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.equalsFilterWithOnlyNullSQL);
    });

    test('should return true when equals filter has no values and does not include null', () => {
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                stringFilterRuleMocks.equalsFilterWithNoValAndNoNull,
                "'",
            ),
        ).toBe(stringFilterRuleMocks.equalsFilterWithNoValAndNoNullSQL);
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

    describe('case sensitivity hierarchy', () => {
        const caseFilter: FilterRule = {
            id: '1',
            target: { fieldId: 'testField' },
            operator: FilterOperator.EQUALS,
            values: ['TestValue'],
        };

        const mockDimension = disabledFilterMock.field;

        test('should be case sensitive by default', () => {
            const sql = renderStringFilterSql(
                'field_name',
                caseFilter,
                "'",
                true, // case sensitive (default)
            );
            expect(sql).toBe(`(field_name) IN ('TestValue')`);
        });

        test('should be case insensitive when caseSensitive is false', () => {
            const sql = renderStringFilterSql(
                'field_name',
                caseFilter,
                "'",
                false, // case insensitive
            );
            expect(sql).toBe(`(UPPER(field_name)) IN ('TESTVALUE')`);
        });

        test('field-level caseSensitive overrides explore-level', () => {
            const fieldWithCaseSensitive = {
                ...mockDimension,
                caseSensitive: false, // field-level setting
            };
            const sql = renderFilterRuleSqlFromField(
                caseFilter,
                fieldWithCaseSensitive,
                '"',
                "'",
                (str: string) => str,
                WeekDay.MONDAY,
                SupportedDbtAdapter.POSTGRES,
                'UTC',
                true, // explore-level setting (should be overridden)
            );
            expect(sql).toContain('UPPER');
        });

        test('explore-level caseSensitive is used when field has no override', () => {
            const fieldWithoutCaseSensitive = {
                ...mockDimension,
                // No caseSensitive property
            };
            const sql = renderFilterRuleSqlFromField(
                caseFilter,
                fieldWithoutCaseSensitive,
                '"',
                "'",
                (str: string) => str,
                WeekDay.MONDAY,
                SupportedDbtAdapter.POSTGRES,
                'UTC',
                false, // explore-level setting
            );
            expect(sql).toContain('UPPER');
        });

        test('filter-rule-level caseSensitive overrides case-sensitive field and explore', () => {
            const fieldCaseSensitive = {
                ...mockDimension,
                caseSensitive: true,
            };
            const filterRuleOverride: FilterRule = {
                ...caseFilter,
                caseSensitive: false,
            };
            const sql = renderFilterRuleSqlFromField(
                filterRuleOverride,
                fieldCaseSensitive,
                '"',
                "'",
                (str: string) => str,
                WeekDay.MONDAY,
                SupportedDbtAdapter.POSTGRES,
                'UTC',
                true, // explore-level is also case-sensitive
            );
            expect(sql).toContain('UPPER');
        });

        test('filter-rule-level caseSensitive=true overrides case-insensitive field', () => {
            const fieldCaseInsensitive = {
                ...mockDimension,
                caseSensitive: false,
            };
            const filterRuleOverride: FilterRule = {
                ...caseFilter,
                caseSensitive: true,
            };
            const sql = renderFilterRuleSqlFromField(
                filterRuleOverride,
                fieldCaseInsensitive,
                '"',
                "'",
                (str: string) => str,
                WeekDay.MONDAY,
                SupportedDbtAdapter.POSTGRES,
                'UTC',
                false,
            );
            expect(sql).not.toContain('UPPER');
        });
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

    test('should allow nested array filter values without blocking SQL rendering', () => {
        const nestedValue = ["coupon') OR TRUE --"];
        const filterRule: FilterRule = {
            id: 'filter-rule',
            target: { fieldId: 'payments_payment_method' },
            operator: FilterOperator.EQUALS,
            values: [nestedValue],
            caseSensitive: true,
        };

        const sql = renderFilterRuleSql(
            filterRule,
            DimensionType.STRING,
            stringFilterDimension,
            "'",
            (value) => value.replaceAll("'", "''"),
            WeekDay.MONDAY,
            SupportedDbtAdapter.POSTGRES,
            'UTC',
            true,
        );

        expect(sql).toContain("coupon') OR TRUE --");
    });

    test('should allow date object filter values before rendering date SQL', () => {
        expect(
            renderFilterRuleSql(
                {
                    id: 'filter-rule',
                    target: { fieldId: 'customers_created_date' },
                    operator: FilterOperator.EQUALS,
                    values: [new Date('2026-04-10T00:00:00.000Z')],
                },
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (value) => value.replaceAll("'", "''"),
                WeekDay.MONDAY,
                SupportedDbtAdapter.POSTGRES,
            ),
        ).toBe(`(${DimensionSqlMock}) = ('2026-04-10')`);
    });
});

describe('case sensitivity', () => {
    test('should apply UPPER() when caseSensitive is false for EQUALS', () => {
        const filter = {
            ...stringFilterRuleMocks.equalsFilterWithSingleUnescapedValue,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(`(UPPER(${stringFilterDimension})) IN ('BOB')`);
    });

    test('should not apply UPPER() when caseSensitive is true for EQUALS', () => {
        const filter = {
            ...stringFilterRuleMocks.equalsFilterWithSingleUnescapedValue,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                true, // caseSensitive = true (default)
            ),
        ).toBe(`(${stringFilterDimension}) IN ('Bob')`);
    });

    test('should apply UPPER() when caseSensitive is false for NOT_EQUALS', () => {
        const filter = {
            id: 'test',
            target: { fieldId: 'test' },
            operator: FilterOperator.NOT_EQUALS,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(
            `((UPPER(${stringFilterDimension})) NOT IN ('BOB') OR (${stringFilterDimension}) IS NULL)`,
        );
    });

    test('should apply UPPER() when caseSensitive is false for STARTS_WITH', () => {
        const filter = {
            ...stringFilterRuleMocks.startsWithFilterWithSingleVal,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(`UPPER(${stringFilterDimension}) LIKE 'BOB%'`);
    });

    test('should apply UPPER() when caseSensitive is false for ENDS_WITH', () => {
        const filter = {
            ...stringFilterRuleMocks.endsWithFilterWithSingleVal,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(`UPPER(${stringFilterDimension}) LIKE '%BOB'`);
    });
    test('should apply UPPER() when caseSensitive is false for INCLUDE', () => {
        const filter = {
            ...stringFilterRuleMocks.includeFilterWithSingleVal,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(`UPPER(${stringFilterDimension}) LIKE UPPER('%Bob%')`);
    });
    test('should not apply UPPER() when caseSensitive is true for INCLUDE', () => {
        const filter = {
            ...stringFilterRuleMocks.includeFilterWithSingleVal,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                true, // caseSensitive = true (default)
            ),
        ).toBe(`(${stringFilterDimension}) LIKE '%Bob%'`);
    });
    test('should apply UPPER() when caseSensitive is false for INCLUDE with multiple values', () => {
        const filter = {
            ...stringFilterRuleMocks.includeFilterWithMultiVal,
            values: ['Tom', 'Jerry'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(`(UPPER(${stringFilterDimension}) LIKE UPPER('%Tom%')
  OR
  UPPER(${stringFilterDimension}) LIKE UPPER('%Jerry%'))`);
    });
    test('should apply UPPER() when caseSensitive is false for NOT_INCLUDE', () => {
        const filter = {
            ...stringFilterRuleMocks.notIncludeFilterWithSingleVal,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(
            `(UPPER(${stringFilterDimension}) NOT LIKE UPPER('%Bob%') OR (${stringFilterDimension}) IS NULL)`,
        );
    });
    test('should not apply UPPER() when caseSensitive is true for NOT_INCLUDE', () => {
        const filter = {
            ...stringFilterRuleMocks.notIncludeFilterWithSingleVal,
            values: ['Bob'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                true, // caseSensitive = true (default)
            ),
        ).toBe(
            `((${stringFilterDimension}) NOT LIKE '%Bob%' OR (${stringFilterDimension}) IS NULL)`,
        );
    });
    test('should apply UPPER() when caseSensitive is false for NOT_INCLUDE with multiple values', () => {
        const filter = {
            ...stringFilterRuleMocks.notIncludeFilterWithMultiVal,
            values: ['Tom', 'Jerry'],
        };
        expect(
            renderStringFilterSql(
                stringFilterDimension,
                filter,
                "'",
                false, // caseSensitive = false
            ),
        ).toBe(`(UPPER(${stringFilterDimension}) NOT LIKE UPPER('%Tom%')
  AND
  UPPER(${stringFilterDimension}) NOT LIKE UPPER('%Jerry%') OR (${stringFilterDimension}) IS NULL)`);
    });

    test.each<[FilterOperator, string]>([
        [FilterOperator.EQUALS, `(UPPER(${stringFilterDimension})) IN ('1')`],
        [
            FilterOperator.NOT_EQUALS,
            `((UPPER(${stringFilterDimension})) NOT IN ('1') OR (${stringFilterDimension}) IS NULL)`,
        ],
        [
            FilterOperator.STARTS_WITH,
            `UPPER(${stringFilterDimension}) LIKE '1%'`,
        ],
        [FilterOperator.ENDS_WITH, `UPPER(${stringFilterDimension}) LIKE '%1'`],
    ])(
        'should coerce numeric values to strings when caseSensitive is false for %s',
        (operator, expectedSql) => {
            const filter: FilterRule = {
                id: 'test',
                target: { fieldId: 'test' },
                operator,
                values: [1],
            };
            expect(
                renderStringFilterSql(
                    stringFilterDimension,
                    filter,
                    "'",
                    false, // caseSensitive = false
                ),
            ).toBe(expectedSql);
        },
    );

    test('should respect field-level caseSensitive over explore-level', () => {
        const field = {
            ...disabledFilterMock.field,
            caseSensitive: false, // field level setting
        };
        const filter = {
            id: 'test',
            target: { fieldId: 'test' },
            operator: FilterOperator.EQUALS,
            values: ['Bob'],
        };
        expect(
            renderFilterRuleSqlFromField(
                filter,
                field,
                disabledFilterMock.fieldQuoteChar,
                disabledFilterMock.stringQuoteChar,
                (v) => v,
                disabledFilterMock.startOfWeek,
                disabledFilterMock.adapterType,
                disabledFilterMock.timezone,
                true, // explore level setting (should be overridden)
            ),
        ).toBe(`(UPPER("payments".payment_method)) IN ('BOB')`);
    });

    test('should use explore-level caseSensitive when field-level is undefined', () => {
        const field = {
            ...disabledFilterMock.field,
            // no caseSensitive defined at field level
        };
        const filter = {
            id: 'test',
            target: { fieldId: 'test' },
            operator: FilterOperator.EQUALS,
            values: ['Bob'],
        };
        expect(
            renderFilterRuleSqlFromField(
                filter,
                field,
                disabledFilterMock.fieldQuoteChar,
                disabledFilterMock.stringQuoteChar,
                (v) => v,
                disabledFilterMock.startOfWeek,
                disabledFilterMock.adapterType,
                disabledFilterMock.timezone,
                false, // explore level setting
            ),
        ).toBe(`(UPPER("payments".payment_method)) IN ('BOB')`);
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

    describe('timezone-aware date formatter boundaries with positive-offset timezones', () => {
        test.each(filterInThePastCompletedDayDateFormatterMocks)(
            'inThePast completed day (tz-aware formatter) for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 06:12:30 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InThePastFilterBase,
                            settings: {
                                unitOfTime: UnitOfTime.days,
                                completed: true,
                            },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );

        test.each(filterInTheCurrentDayDateFormatterMocks)(
            'inTheCurrent day (tz-aware formatter) for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 06:12:30 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InTheCurrentFilterBase,
                            settings: { unitOfTime: UnitOfTime.days },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );

        test.each(filterInThePastNonCompletedDayDateFormatterMocks)(
            'inThePast non-completed day (tz-aware formatter) for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 06:12:30 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InThePastFilterBase,
                            settings: {
                                unitOfTime: UnitOfTime.days,
                                completed: false,
                            },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );

        test.each(filterInTheNextCompletedDayDateFormatterMocks)(
            'inTheNext completed day (tz-aware formatter) for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 06:12:30 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InTheNextFilterBase,
                            settings: {
                                unitOfTime: UnitOfTime.days,
                                completed: true,
                            },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );

        test.each(filterInTheNextNonCompletedDayDateFormatterMocks)(
            'inTheNext non-completed day (tz-aware formatter) for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 06:12:30 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InTheNextFilterBase,
                            settings: {
                                unitOfTime: UnitOfTime.days,
                                completed: false,
                            },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );
    });

    describe('negative-offset edge case near midnight UTC', () => {
        test.each(filterNegativeOffsetEdgeCaseCurrentDayMocks)(
            'inTheCurrent day near midnight UTC for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 02:00:00 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InTheCurrentFilterBase,
                            settings: { unitOfTime: UnitOfTime.days },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );

        test.each(filterNegativeOffsetEdgeCasePastCompletedDayMocks)(
            'inThePast completed day near midnight UTC for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 02:00:00 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InThePastFilterBase,
                            settings: {
                                unitOfTime: UnitOfTime.days,
                                completed: true,
                            },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );
    });

    describe('positive-offset edge case near end of UTC day', () => {
        test.each(filterPositiveOffsetEdgeCaseCurrentDayMocks)(
            'inTheCurrent day late UTC for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 22:00:00 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InTheCurrentFilterBase,
                            settings: { unitOfTime: UnitOfTime.days },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );

        test.each(filterPositiveOffsetEdgeCasePastCompletedDayMocks)(
            'inThePast completed day late UTC for timezone %s',
            (timezone, expected) => {
                vi.setSystemTime(
                    new Date('04 Apr 2020 22:00:00 GMT').getTime(),
                );
                expect(
                    renderDateFilterSql({
                        dimensionSql: DimensionSqlMock,
                        filter: {
                            ...InThePastFilterBase,
                            settings: {
                                unitOfTime: UnitOfTime.days,
                                completed: true,
                            },
                        },
                        adapterType: adapterType.default,
                        timezone,
                        boundaryDateFormatter:
                            createBoundaryDateFormatter(timezone),
                    }),
                ).toStrictEqual(expected);
            },
        );
    });
});

describe('DATE dimension filters are server-timezone-independent', () => {
    // Regression: the default boundaryFormatter (formatDate) used moment(date)
    // which formats in the server's local timezone. On a server with a positive
    // UTC offset, endOf('day') in UTC (23:59 UTC) gets shifted to the next
    // calendar day, producing a 2-day filter range instead of 1.
    const systemTime = new Date('10 Apr 2026 14:00:00 GMT');

    beforeEach(() => {
        vi.setSystemTime(systemTime.getTime());
    });

    afterEach(() => {
        // Reset moment default timezone so other tests are unaffected
        momentTz.tz.setDefault();
    });

    test.each([
        ['UTC', 'UTC'],
        ['Europe/Moscow', 'UTC'],
        ['Asia/Tokyo', 'UTC'],
        ['America/New_York', 'UTC'],
        ['Pacific/Auckland', 'UTC'],
    ])(
        'inTheCurrent day for DATE dimension produces single-day range regardless of server TZ=%s',
        (serverTz, projectTz) => {
            // Simulate a server running in a non-UTC timezone
            momentTz.tz.setDefault(serverTz);

            const sql = renderFilterRuleSql(
                {
                    id: 'id',
                    target: { fieldId: 'fieldId' },
                    operator: FilterOperator.IN_THE_CURRENT,
                    values: [1],
                    settings: { unitOfTime: UnitOfTime.days },
                },
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.POSTGRES,
                projectTz,
            );

            // Both boundaries must be the same UTC date — no 2-day range
            expect(sql).toBe(
                `((${DimensionSqlMock}) >= ('2026-04-10') AND (${DimensionSqlMock}) <= ('2026-04-10'))`,
            );
        },
    );

    test.each([
        ['Europe/Moscow', 'UTC'],
        ['Asia/Tokyo', 'UTC'],
        ['America/New_York', 'UTC'],
    ])(
        'inThePast 1 completed day for DATE dimension is server-TZ-independent (server TZ=%s)',
        (serverTz, projectTz) => {
            momentTz.tz.setDefault(serverTz);

            const sql = renderFilterRuleSql(
                {
                    id: 'id',
                    target: { fieldId: 'fieldId' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [1],
                    settings: {
                        unitOfTime: UnitOfTime.days,
                        completed: true,
                    },
                },
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.POSTGRES,
                projectTz,
            );

            // Yesterday in UTC: April 9
            expect(sql).toBe(
                `((${DimensionSqlMock}) >= ('2026-04-09') AND (${DimensionSqlMock}) < ('2026-04-10'))`,
            );
        },
    );
});

describe('useTimezoneAwareDateTrunc parameter — filter literal wrapping', () => {
    const equalsFilter: FilterRule<FilterOperator, unknown> = {
        id: 'id',
        target: { fieldId: 'fieldId' },
        operator: FilterOperator.EQUALS,
        values: ['2024-01-15'],
    };

    // GLITCH-452: day-or-coarser dims now compile to a real DATE, so the filter
    // LHS is a DATE and the literal stays bare — the old timestamptz wrap is gone.
    test('DATE-over-TIMESTAMP filter emits a bare literal (GLITCH-452)', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.DATE,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.POSTGRES,
            'Asia/Tokyo',
            true,
            undefined,
            true,
            DimensionType.TIMESTAMP,
        );
        expect(sql).not.toContain('AT TIME ZONE');
        expect(sql).not.toContain('::timestamp');
    });

    test('DATE filter leaves literal bare when parameter is omitted', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.DATE,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.POSTGRES,
            'Asia/Tokyo',
        );
        expect(sql).not.toContain('AT TIME ZONE');
    });

    test('DATE filter over a DATE base emits a bare literal even when parameter is true', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.DATE,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.POSTGRES,
            'Asia/Tokyo',
            true,
            undefined,
            true,
            DimensionType.DATE,
        );
        expect(sql).not.toContain('AT TIME ZONE');
        expect(sql).not.toContain('::timestamp');
    });

    test('BigQuery DATE-over-TIMESTAMP filter emits a bare literal (GLITCH-452)', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.DATE,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.BIGQUERY,
            'Asia/Tokyo',
            true,
            undefined,
            true,
            DimensionType.TIMESTAMP,
        );
        expect(sql).not.toContain('TIMESTAMP(');
        expect(sql).toContain("'2024-01-15'");
    });

    test('BigQuery DATE filter over a DATE base emits a bare literal (no TIMESTAMP wrap)', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.DATE,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.BIGQUERY,
            'Asia/Tokyo',
            true,
            undefined,
            true,
            DimensionType.DATE,
        );
        expect(sql).not.toContain('TIMESTAMP(');
        expect(sql).toContain("'2024-01-15'");
    });

    test('ClickHouse DATE-over-TIMESTAMP filter emits a bare literal (GLITCH-452)', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.DATE,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.CLICKHOUSE,
            'Asia/Tokyo',
            true,
            undefined,
            true,
            DimensionType.TIMESTAMP,
        );
        expect(sql).not.toContain('toDateTime(');
        expect(sql).toContain("'2024-01-15'");
    });

    test('ClickHouse DATE filter over a DATE base emits a bare literal (no toDateTime wrap)', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.DATE,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.CLICKHOUSE,
            'Asia/Tokyo',
            true,
            undefined,
            true,
            DimensionType.DATE,
        );
        expect(sql).not.toContain('toDateTime(');
    });

    test('TIMESTAMP filter does not wrap literal even when parameter is true', () => {
        const sql = renderFilterRuleSql(
            equalsFilter,
            DimensionType.TIMESTAMP,
            DimensionSqlMock,
            "'",
            (s: string) => s,
            null,
            SupportedDbtAdapter.POSTGRES,
            'Asia/Tokyo',
            true,
            undefined,
            true,
            DimensionType.TIMESTAMP,
        );
        expect(sql).not.toContain("AT TIME ZONE 'Asia/Tokyo'");
    });

    describe('relative filters', () => {
        beforeEach(() => {
            vi.setSystemTime(new Date('2026-04-22 00:00:00 GMT').getTime());
        });

        const renderWithParam = (
            filter: FilterRule<FilterOperator, unknown>,
            useTimezoneAwareDateTrunc: boolean,
            baseTimeIntervalDimensionType: DimensionType = DimensionType.TIMESTAMP,
        ) =>
            renderFilterRuleSql(
                filter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.POSTGRES,
                'Asia/Tokyo',
                true,
                undefined,
                useTimezoneAwareDateTrunc,
                baseTimeIntervalDimensionType,
            );

        // GLITCH-452: boundaries are still computed in the project TZ, but the
        // LHS is now a DATE so they render bare (no timestamptz wrap).
        test('inThePast completed day emits bare project-TZ boundaries (GLITCH-452)', () => {
            const filter: FilterRule<FilterOperator, unknown> = {
                id: 'id',
                target: { fieldId: 'fieldId' },
                operator: FilterOperator.IN_THE_PAST,
                values: [1],
                settings: { unitOfTime: UnitOfTime.days, completed: true },
            };
            const sql = renderWithParam(filter, true);
            expect(sql).not.toContain('AT TIME ZONE');
            expect(sql).not.toContain('::timestamp');
            expect(sql).toContain("'2026-04-21'");
        });

        test('inTheCurrent day emits bare project-TZ boundaries (GLITCH-452)', () => {
            const filter: FilterRule<FilterOperator, unknown> = {
                id: 'id',
                target: { fieldId: 'fieldId' },
                operator: FilterOperator.IN_THE_CURRENT,
                values: [1],
                settings: { unitOfTime: UnitOfTime.days },
            };
            const sql = renderWithParam(filter, true);
            expect(sql).not.toContain('AT TIME ZONE');
            expect(sql).not.toContain('::timestamp');
            expect(sql).toContain("'2026-04-22'");
        });

        test('inTheNext day emits bare project-TZ boundaries (GLITCH-452)', () => {
            const filter: FilterRule<FilterOperator, unknown> = {
                id: 'id',
                target: { fieldId: 'fieldId' },
                operator: FilterOperator.IN_THE_NEXT,
                values: [1],
                settings: { unitOfTime: UnitOfTime.days, completed: false },
            };
            const sql = renderWithParam(filter, true);
            expect(sql).not.toContain('AT TIME ZONE');
        });

        test('inThePast completed day leaves boundaries bare when parameter is omitted', () => {
            const filter: FilterRule<FilterOperator, unknown> = {
                id: 'id',
                target: { fieldId: 'fieldId' },
                operator: FilterOperator.IN_THE_PAST,
                values: [1],
                settings: { unitOfTime: UnitOfTime.days, completed: true },
            };
            const sql = renderWithParam(filter, false);
            expect(sql).not.toContain('AT TIME ZONE');
        });

        test('inThePast completed weeks on a DATE-backed dimension does not wrap BigQuery literals in TIMESTAMP', () => {
            const filter: FilterRule<FilterOperator, unknown> = {
                id: 'id',
                target: { fieldId: 'fieldId' },
                operator: FilterOperator.IN_THE_PAST,
                values: [14],
                settings: { unitOfTime: UnitOfTime.weeks, completed: true },
            };
            const sql = renderFilterRuleSql(
                filter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.BIGQUERY,
                'Asia/Tokyo',
                true,
                undefined,
                true,
                DimensionType.DATE,
            );
            expect(sql).not.toContain('TIMESTAMP(');
        });
    });

    describe('target tz === source tz short-circuit (mirrors dim-side resolveTimezoneWrap)', () => {
        test('BigQuery: UTC project tz + UTC source drops the TIMESTAMP wrap on the literal', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.BIGQUERY,
                'UTC',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
                'UTC',
            );
            expect(sql).not.toContain('TIMESTAMP(');
            expect(sql).toContain("'2024-01-15'");
        });

        test('BigQuery: UTC project tz + undefined source (defaults to UTC) drops the wrap', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.BIGQUERY,
                'UTC',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
            );
            expect(sql).not.toContain('TIMESTAMP(');
        });

        test('BigQuery: matching non-UTC source/target drops the wrap', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.BIGQUERY,
                'America/New_York',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
                'America/New_York',
            );
            expect(sql).not.toContain('TIMESTAMP(');
        });

        // GLITCH-452: LHS is a real DATE regardless of source/target, so the
        // literal is bare — there is no wrap left to preserve.
        test('BigQuery: non-matching source/target still emits a bare literal (GLITCH-452)', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.BIGQUERY,
                'America/New_York',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
                'UTC',
            );
            expect(sql).not.toContain('TIMESTAMP(');
            expect(sql).toContain("'2024-01-15'");
        });

        test('Postgres: matching source/target drops the AT TIME ZONE wrap on the literal', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.POSTGRES,
                'UTC',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
                'UTC',
            );
            expect(sql).not.toContain('AT TIME ZONE');
            expect(sql).not.toContain('::timestamp');
        });

        test('ClickHouse: matching source/target drops the toDateTime wrap on the literal', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.CLICKHOUSE,
                'UTC',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
                'UTC',
            );
            expect(sql).not.toContain('toDateTime(');
        });

        test('Postgres: non-matching source/target still emits a bare literal (GLITCH-452)', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.POSTGRES,
                'America/New_York',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
                'UTC',
            );
            expect(sql).not.toContain('AT TIME ZONE');
            expect(sql).not.toContain('::timestamp');
        });

        test('ClickHouse: non-matching source/target still emits a bare literal (GLITCH-452)', () => {
            const sql = renderFilterRuleSql(
                equalsFilter,
                DimensionType.DATE,
                DimensionSqlMock,
                "'",
                (s: string) => s,
                null,
                SupportedDbtAdapter.CLICKHOUSE,
                'America/New_York',
                true,
                undefined,
                true,
                DimensionType.TIMESTAMP,
                'UTC',
            );
            expect(sql).not.toContain('toDateTime(');
            expect(sql).toContain("'2024-01-15'");
        });
    });
});
