import { ConditionalOperator } from '../types/conditionalRule';
import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType, FieldType } from '../types/field';
import { FilterOperator, UnitOfTime } from '../types/filter';
import { WeekDay } from '../utils/timeFrames';
import { type renderFilterRuleSql } from './filtersCompiler';

export const DimensionSqlMock = 'customers.created';
export const NumberDimensionMock = 'customers.age';

export const adapterType = {
    default: SupportedDbtAdapter.POSTGRES,
    trino: SupportedDbtAdapter.TRINO,
};

export const NumberFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.EQUALS,
    values: [1],
};
export const ExpectedNumberFilterSQL: Record<FilterOperator, string | null> = {
    [FilterOperator.NULL]: '(customers.age) IS NULL',
    [FilterOperator.NOT_NULL]: '(customers.age) IS NOT NULL',
    [FilterOperator.EQUALS]: '(customers.age) IN (1)',
    [FilterOperator.NOT_EQUALS]:
        '((customers.age) NOT IN (1) OR (customers.age) IS NULL)',
    [FilterOperator.STARTS_WITH]: null,
    [FilterOperator.ENDS_WITH]: null,
    [FilterOperator.INCLUDE]: null,
    [FilterOperator.NOT_INCLUDE]: null,
    [FilterOperator.LESS_THAN]: '(customers.age) < (1)',
    [FilterOperator.LESS_THAN_OR_EQUAL]: '(customers.age) <= (1)',
    [FilterOperator.GREATER_THAN]: '(customers.age) > (1)',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: '(customers.age) >= (1)',
    [FilterOperator.IN_THE_PAST]: null,
    [FilterOperator.NOT_IN_THE_PAST]: null,
    [FilterOperator.IN_THE_CURRENT]: null,
    [FilterOperator.NOT_IN_THE_CURRENT]: null,
    [FilterOperator.IN_THE_NEXT]: null,
    [FilterOperator.IN_BETWEEN]: null,
};

export const InTheCurrentFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.IN_THE_CURRENT,
    values: [1],
    settings: {
        unitOfTime: UnitOfTime.days,
        completed: false,
    },
};

export const ExpectedInTheCurrentFilterSQL: Record<UnitOfTime, string> = {
    [UnitOfTime.milliseconds]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-04 06:12:30'))`, // note that all milliseconds filters are working incorrectly #4074
    [UnitOfTime.seconds]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-04 06:12:30'))`,
    [UnitOfTime.minutes]: `((customers.created) >= ('2020-04-04 06:12:00') AND (customers.created) <= ('2020-04-04 06:12:59'))`,
    [UnitOfTime.hours]: `((customers.created) >= ('2020-04-04 06:00:00') AND (customers.created) <= ('2020-04-04 06:59:59'))`,
    [UnitOfTime.days]: `((customers.created) >= ('2020-04-04 00:00:00') AND (customers.created) <= ('2020-04-04 23:59:59'))`,
    [UnitOfTime.weeks]: `((customers.created) >= ('2020-03-29 00:00:00') AND (customers.created) <= ('2020-04-04 23:59:59'))`,
    [UnitOfTime.months]: `((customers.created) >= ('2020-04-01 00:00:00') AND (customers.created) <= ('2020-04-30 23:59:59'))`,
    [UnitOfTime.quarters]: `((customers.created) >= ('2020-04-01 00:00:00') AND (customers.created) <= ('2020-06-30 23:59:59'))`,
    [UnitOfTime.years]: `((customers.created) >= ('2020-01-01 00:00:00') AND (customers.created) <= ('2020-12-31 23:59:59'))`,
};

export const TrinoExpectedInTheCurrentFilterSQL: Record<UnitOfTime, string> = {
    [UnitOfTime.milliseconds]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:12:30' AS timestamp))`, // note that all milliseconds filters are working incorrectly #4074
    [UnitOfTime.seconds]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:12:30' AS timestamp))`,
    [UnitOfTime.minutes]: `((customers.created) >= CAST('2020-04-04 06:12:00' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:12:59' AS timestamp))`,
    [UnitOfTime.hours]: `((customers.created) >= CAST('2020-04-04 06:00:00' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:59:59' AS timestamp))`,
    [UnitOfTime.days]: `((customers.created) >= CAST('2020-04-04 00:00:00' AS timestamp) AND (customers.created) <= CAST('2020-04-04 23:59:59' AS timestamp))`,
    [UnitOfTime.weeks]: `((customers.created) >= CAST('2020-03-29 00:00:00' AS timestamp) AND (customers.created) <= CAST('2020-04-04 23:59:59' AS timestamp))`,
    [UnitOfTime.months]: `((customers.created) >= CAST('2020-04-01 00:00:00' AS timestamp) AND (customers.created) <= CAST('2020-04-30 23:59:59' AS timestamp))`,
    [UnitOfTime.quarters]: `((customers.created) >= CAST('2020-04-01 00:00:00' AS timestamp) AND (customers.created) <= CAST('2020-06-30 23:59:59' AS timestamp))`,
    [UnitOfTime.years]: `((customers.created) >= CAST('2020-01-01 00:00:00' AS timestamp) AND (customers.created) <= CAST('2020-12-31 23:59:59' AS timestamp))`,
};

export const InTheNextFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.IN_THE_NEXT,
    values: [1],
    settings: {
        unitOfTime: UnitOfTime.days,
        completed: false,
    },
};

export const ExpectedInTheNextFilterSQL: Record<UnitOfTime, string> = {
    [UnitOfTime.milliseconds]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-04 06:12:30'))`, // note that all milliseconds filters are working incorrectly #4074
    [UnitOfTime.seconds]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-04 06:12:31'))`,
    [UnitOfTime.minutes]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-04 06:13:30'))`,
    [UnitOfTime.hours]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-04 07:12:30'))`,
    [UnitOfTime.days]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-05 06:12:30'))`,
    [UnitOfTime.weeks]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-04-11 06:12:30'))`,
    [UnitOfTime.months]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-05-04 06:12:30'))`,
    [UnitOfTime.quarters]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2020-07-04 06:12:30'))`,
    [UnitOfTime.years]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) <= ('2021-04-04 06:12:30'))`,
};

export const TrinoExpectedInTheNextFilterSQL: Record<UnitOfTime, string> = {
    [UnitOfTime.milliseconds]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:12:30' AS timestamp))`, // note that all milliseconds filters are working incorrectly #4074
    [UnitOfTime.seconds]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:12:31' AS timestamp))`,
    [UnitOfTime.minutes]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:13:30' AS timestamp))`,
    [UnitOfTime.hours]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 07:12:30' AS timestamp))`,
    [UnitOfTime.days]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-05 06:12:30' AS timestamp))`,
    [UnitOfTime.weeks]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-11 06:12:30' AS timestamp))`,
    [UnitOfTime.months]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-05-04 06:12:30' AS timestamp))`,
    [UnitOfTime.quarters]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2020-07-04 06:12:30' AS timestamp))`,
    [UnitOfTime.years]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) <= CAST('2021-04-04 06:12:30' AS timestamp))`,
};

export const ExpectedInTheNextCompleteFilterSQL: Record<UnitOfTime, string> = {
    [UnitOfTime.milliseconds]: `((customers.created) >= ('2020-04-04 06:12:30') AND (customers.created) < ('2020-04-04 06:12:30'))`, // note that all milliseconds filters are working incorrectly #4074
    [UnitOfTime.seconds]: `((customers.created) >= ('2020-04-04 06:12:31') AND (customers.created) < ('2020-04-04 06:12:32'))`,
    [UnitOfTime.minutes]: `((customers.created) >= ('2020-04-04 06:13:00') AND (customers.created) < ('2020-04-04 06:14:00'))`,
    [UnitOfTime.hours]: `((customers.created) >= ('2020-04-04 07:00:00') AND (customers.created) < ('2020-04-04 08:00:00'))`,
    [UnitOfTime.days]: `((customers.created) >= ('2020-04-05 00:00:00') AND (customers.created) < ('2020-04-06 00:00:00'))`,
    [UnitOfTime.weeks]: `((customers.created) >= ('2020-04-05 00:00:00') AND (customers.created) < ('2020-04-12 00:00:00'))`,
    [UnitOfTime.months]: `((customers.created) >= ('2020-05-01 00:00:00') AND (customers.created) < ('2020-06-01 00:00:00'))`,
    [UnitOfTime.quarters]: `((customers.created) >= ('2020-07-01 00:00:00') AND (customers.created) < ('2020-10-01 00:00:00'))`,
    [UnitOfTime.years]: `((customers.created) >= ('2021-01-01 00:00:00') AND (customers.created) < ('2022-01-01 00:00:00'))`,
};

export const TrinoExpectedInTheNextCompleteFilterSQL: Record<
    UnitOfTime,
    string
> = {
    [UnitOfTime.milliseconds]: `((customers.created) >= CAST('2020-04-04 06:12:30' AS timestamp) AND (customers.created) < CAST('2020-04-04 06:12:30' AS timestamp))`, // note that all milliseconds filters are working incorrectly #4074
    [UnitOfTime.seconds]: `((customers.created) >= CAST('2020-04-04 06:12:31' AS timestamp) AND (customers.created) < CAST('2020-04-04 06:12:32' AS timestamp))`,
    [UnitOfTime.minutes]: `((customers.created) >= CAST('2020-04-04 06:13:00' AS timestamp) AND (customers.created) < CAST('2020-04-04 06:14:00' AS timestamp))`,
    [UnitOfTime.hours]: `((customers.created) >= CAST('2020-04-04 07:00:00' AS timestamp) AND (customers.created) < CAST('2020-04-04 08:00:00' AS timestamp))`,
    [UnitOfTime.days]: `((customers.created) >= CAST('2020-04-05 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-04-06 00:00:00' AS timestamp))`,
    [UnitOfTime.weeks]: `((customers.created) >= CAST('2020-04-05 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-04-12 00:00:00' AS timestamp))`,
    [UnitOfTime.months]: `((customers.created) >= CAST('2020-05-01 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-06-01 00:00:00' AS timestamp))`,
    [UnitOfTime.quarters]: `((customers.created) >= CAST('2020-07-01 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-10-01 00:00:00' AS timestamp))`,
    [UnitOfTime.years]: `((customers.created) >= CAST('2021-01-01 00:00:00' AS timestamp) AND (customers.created) < CAST('2022-01-01 00:00:00' AS timestamp))`,
};

export const InThePastFilterBase = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.IN_THE_PAST,
    values: [1],
    settings: {
        unitOfTime: UnitOfTime.days,
        completed: false,
    },
};

export const ExpectedInThePastCompleteWeekFilterSQLWithCustomStartOfWeek: Record<
    WeekDay.MONDAY | WeekDay.SUNDAY,
    string
> = {
    [WeekDay.MONDAY]: `((customers.created) >= ('2020-03-23 00:00:00') AND (customers.created) < ('2020-03-30 00:00:00'))`,
    [WeekDay.SUNDAY]: `((customers.created) >= ('2020-03-22 00:00:00') AND (customers.created) < ('2020-03-29 00:00:00'))`,
};

export const TrinoExpectedInThePastCompleteWeekFilterSQLWithCustomStartOfWeek: Record<
    WeekDay.MONDAY | WeekDay.SUNDAY,
    string
> = {
    [WeekDay.MONDAY]: `((customers.created) >= CAST('2020-03-23 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-03-30 00:00:00' AS timestamp))`,
    [WeekDay.SUNDAY]: `((customers.created) >= CAST('2020-03-22 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-03-29 00:00:00' AS timestamp))`,
};

export const ExpectedInTheCurrentWeekFilterSQLWithCustomStartOfWeek: Record<
    WeekDay.MONDAY | WeekDay.SUNDAY,
    string
> = {
    [WeekDay.MONDAY]: `((customers.created) >= ('2020-03-30 00:00:00') AND (customers.created) <= ('2020-04-05 23:59:59'))`,
    [WeekDay.SUNDAY]: `((customers.created) >= ('2020-03-29 00:00:00') AND (customers.created) <= ('2020-04-04 23:59:59'))`,
};
export const TrinoExpectedInTheCurrentWeekFilterSQLWithCustomStartOfWeek: Record<
    WeekDay.MONDAY | WeekDay.SUNDAY,
    string
> = {
    [WeekDay.MONDAY]: `((customers.created) >= CAST('2020-03-30 00:00:00' AS timestamp) AND (customers.created) <= CAST('2020-04-05 23:59:59' AS timestamp))`,
    [WeekDay.SUNDAY]: `((customers.created) >= CAST('2020-03-29 00:00:00' AS timestamp) AND (customers.created) <= CAST('2020-04-04 23:59:59' AS timestamp))`,
};
export const ExpectedInTheNextCompleteWeekFilterSQLWithCustomStartOfWeek: Record<
    WeekDay.MONDAY | WeekDay.SUNDAY,
    string
> = {
    [WeekDay.MONDAY]: `((customers.created) >= ('2020-04-06 00:00:00') AND (customers.created) < ('2020-04-13 00:00:00'))`,
    [WeekDay.SUNDAY]: `((customers.created) >= ('2020-04-05 00:00:00') AND (customers.created) < ('2020-04-12 00:00:00'))`,
};

export const TrinoExpectedInTheNextCompleteWeekFilterSQLWithCustomStartOfWeek: Record<
    WeekDay.MONDAY | WeekDay.SUNDAY,
    string
> = {
    [WeekDay.MONDAY]: `((customers.created) >= CAST('2020-04-06 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-04-13 00:00:00' AS timestamp))`,
    [WeekDay.SUNDAY]: `((customers.created) >= CAST('2020-04-05 00:00:00' AS timestamp) AND (customers.created) < CAST('2020-04-12 00:00:00' AS timestamp))`,
};

export const InTheLast1DayFilter = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.IN_THE_PAST,
    values: [1],
    settings: {
        unitOfTime: UnitOfTime.days,
        completed: false,
    },
};

export const InTheLast1DayFilterSQL = `((customers.created) >= ('2020-04-03') AND (customers.created) <= ('2020-04-04'))`;

export const TrinoInTheLast1DayFilterSQL = `((customers.created) >= CAST('2020-04-03' AS timestamp) AND (customers.created) <= CAST('2020-04-04' AS timestamp))`;

export const InTheLast1CompletedDayFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.days,
        completed: true,
    },
};

export const InTheLast1CompletedDayFilterSQL = `((customers.created) >= ('2020-04-03') AND (customers.created) < ('2020-04-04'))`;

export const TrinoInTheLast1CompletedDayFilterSQL = `((customers.created) >= CAST('2020-04-03' AS timestamp) AND (customers.created) < CAST('2020-04-04' AS timestamp))`;

export const InTheLast1WeekFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.weeks,
        completed: false,
    },
};

export const InTheLast1WeekFilterSQL = `((customers.created) >= ('2020-03-28') AND (customers.created) <= ('2020-04-04'))`;
export const TrinoInTheLast1WeekFilterSQL = `((customers.created) >= CAST('2020-03-28' AS timestamp) AND (customers.created) <= CAST('2020-04-04' AS timestamp))`;

export const InTheLast1CompletedWeekFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.weeks,
        completed: true,
    },
};

export const InTheLast1CompletedWeekFilterSQL = `((customers.created) >= ('2020-03-22') AND (customers.created) < ('2020-03-29'))`;

export const TrinoInTheLast1CompletedWeekFilterSQL = `((customers.created) >= CAST('2020-03-22' AS timestamp) AND (customers.created) < CAST('2020-03-29' AS timestamp))`;

export const InTheLast1MonthFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.months,
        completed: false,
    },
};

export const InTheLast1MonthFilterSQL = `((customers.created) >= ('2020-03-04') AND (customers.created) <= ('2020-04-04'))`;
export const TrinoInTheLast1MonthFilterSQL = `((customers.created) >= CAST('2020-03-04' AS timestamp) AND (customers.created) <= CAST('2020-04-04' AS timestamp))`;

export const InTheLast1CompletedMonthFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.months,
        completed: true,
    },
};

export const InTheLast1CompletedMonthFilterSQL = `((customers.created) >= ('2020-03-01') AND (customers.created) < ('2020-04-01'))`;

export const TrinoInTheLast1CompletedMonthFilterSQL = `((customers.created) >= CAST('2020-03-01' AS timestamp) AND (customers.created) < CAST('2020-04-01' AS timestamp))`;

export const InTheLast1YearFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.years,
        completed: false,
    },
};

export const InTheLast1YearFilterSQL = `((customers.created) >= ('2019-04-04') AND (customers.created) <= ('2020-04-04'))`;
export const TrinoInTheLast1YearFilterSQL = `((customers.created) >= CAST('2019-04-04' AS timestamp) AND (customers.created) <= CAST('2020-04-04' AS timestamp))`;

export const InTheLast1CompletedYearFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.years,
        completed: true,
    },
};

export const InTheLast1CompletedYearFilterSQL = `((customers.created) >= ('2019-01-01') AND (customers.created) < ('2020-01-01'))`;
export const TrinoInTheLast1CompletedYearFilterSQL = `((customers.created) >= CAST('2019-01-01' AS timestamp) AND (customers.created) < CAST('2020-01-01' AS timestamp))`;

export const InTheLast1HourFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.hours,
        completed: false,
    },
};

export const InTheLast1HourFilterSQL = `((customers.created) >= ('2020-04-04 05:12:30') AND (customers.created) <= ('2020-04-04 06:12:30'))`;

export const TrinoInTheLast1HourFilterSQL = `((customers.created) >= CAST('2020-04-04 05:12:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:12:30' AS timestamp))`;

export const InTheLast1CompletedHourFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.hours,
        completed: true,
    },
};

export const InTheLast1CompletedHourFilterSQL = `((customers.created) >= ('2020-04-04 05:00:00') AND (customers.created) < ('2020-04-04 06:00:00'))`;

export const TrinoInTheLast1CompletedHourFilterSQL = `((customers.created) >= CAST('2020-04-04 05:00:00' AS timestamp) AND (customers.created) < CAST('2020-04-04 06:00:00' AS timestamp))`;

export const InTheLast1MinuteFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.minutes,
        completed: false,
    },
};

export const InTheLast1MinuteFilterSQL = `((customers.created) >= ('2020-04-04 06:11:30') AND (customers.created) <= ('2020-04-04 06:12:30'))`;

export const TrinoInTheLast1MinuteFilterSQL = `((customers.created) >= CAST('2020-04-04 06:11:30' AS timestamp) AND (customers.created) <= CAST('2020-04-04 06:12:30' AS timestamp))`;

export const InTheLast1CompletedMinuteFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.minutes,
        completed: true,
    },
};

export const InTheLast1CompletedMinuteFilterSQL = `((customers.created) >= ('2020-04-04 06:11:00') AND (customers.created) < ('2020-04-04 06:12:00'))`;

export const TrinoInTheLast1CompletedMinuteFilterSQL = `((customers.created) >= CAST('2020-04-04 06:11:00' AS timestamp) AND (customers.created) < CAST('2020-04-04 06:12:00' AS timestamp))`;

export const InBetweenPastTwoYearsFilter = {
    id: 'id',
    target: {
        fieldId: 'fieldId',
    },
    operator: FilterOperator.IN_BETWEEN,
    values: [
        new Date('04 Apr 2021 00:00:00 GMT'),
        new Date('04 Apr 2023 00:00:00 GMT'),
    ],
};

export const InBetweenPastTwoYearsFilterSQL = `((customers.created) >= ('2021-04-04') AND (customers.created) <= ('2023-04-04'))`;
export const TrinoInBetweenPastTwoYearsFilterSQL = `((customers.created) >= CAST('2021-04-04' AS timestamp) AND (customers.created) <= CAST('2023-04-04' AS timestamp))`;
export const InBetweenPastTwoYearsTimestampFilterSQL = `((customers.created) >= ('2021-04-04 00:00:00') AND (customers.created) <= ('2023-04-04 00:00:00'))`;
export const TrinoInBetweenPastTwoYearsTimestampFilterSQL = `((customers.created) >= CAST('2021-04-04 00:00:00' AS timestamp) AND (customers.created) <= CAST('2023-04-04 00:00:00' AS timestamp))`;

const stringSingleValueFilter = {
    id: '701b6520-1b19-4051-a553-7615aee0b03d',
    target: { fieldId: 'customers_first_name' },
    values: ['Bob'],
};

const stringMultiValueFilter = {
    id: '701b6520-1b19-4051-a553-7615aee0b03d',
    target: { fieldId: 'customers_first_name' },
    values: ['Tom', 'Jerry'],
};

const noValueFilter = {
    id: '701b6520-1b19-4051-a553-7615aee0b03d',
    target: { fieldId: 'customers_first_name' },
    values: [],
};

const stringSingleUnescapedValueFilter = {
    id: '701b6520-1b19-4051-a553-7615aee0b03d',
    target: { fieldId: 'customers_first_name' },
    values: ["Bob's"],
};

const stringMultiUnescapedValueFilter = {
    id: '701b6520-1b19-4051-a553-7615aee0b03d',
    target: { fieldId: 'customers_first_name' },
    values: ["Bob's", "Tom's"],
};

export const stringFilterDimension = '"customers".first_name';

export const stringFilterRuleMocks = {
    includeFilterWithSingleVal: {
        ...stringSingleValueFilter,
        operator: FilterOperator.INCLUDE,
    },
    includeFilterWithSingleValSQL: `LOWER(${stringFilterDimension}) LIKE LOWER('%Bob%')`,
    includeFilterWithMultiVal: {
        ...stringMultiValueFilter,
        operator: FilterOperator.INCLUDE,
    },
    includeFilterWithMultiValSQL: `(LOWER(${stringFilterDimension}) LIKE LOWER('%Tom%')\n  OR\n  LOWER(${stringFilterDimension}) LIKE LOWER('%Jerry%'))`,
    includeFilterWithNoVal: {
        ...noValueFilter,
        operator: FilterOperator.INCLUDE,
    },
    includeFilterWithNoValSQL: 'true',
    notIncludeFilterWithSingleVal: {
        ...stringSingleValueFilter,
        operator: FilterOperator.NOT_INCLUDE,
    },
    notIncludeFilterWithSingleValSQL: `LOWER(${stringFilterDimension}) NOT LIKE LOWER('%Bob%')`,
    notIncludeFilterWithMultiVal: {
        ...stringMultiValueFilter,
        operator: FilterOperator.NOT_INCLUDE,
    },
    notIncludeFilterWithMultiValSQL: `LOWER(${stringFilterDimension}) NOT LIKE LOWER('%Tom%')\n  AND\n  LOWER(${stringFilterDimension}) NOT LIKE LOWER('%Jerry%')`,
    notIncludeFilterWithNoVal: {
        ...noValueFilter,
        operator: FilterOperator.NOT_INCLUDE,
    },
    notIncludeFilterWithNoValSQL: 'true',
    startsWithFilterWithSingleVal: {
        ...stringSingleValueFilter,
        operator: FilterOperator.STARTS_WITH,
    },
    startsWithFilterWithSingleValSQL: `(${stringFilterDimension}) LIKE 'Bob%'`,
    startsWithFilterWithMultiVal: {
        ...stringMultiValueFilter,
        operator: FilterOperator.STARTS_WITH,
    },
    startsWithFilterWithMultiValSQL: `(${stringFilterDimension}) LIKE 'Tom%'\n  OR\n  (${stringFilterDimension}) LIKE 'Jerry%'`,
    startsWithFilterWithNoVal: {
        ...noValueFilter,
        operator: FilterOperator.STARTS_WITH,
    },
    startsWithFilterWithNoValSQL: 'true',

    endsWithFilterWithSingleVal: {
        ...stringSingleValueFilter,
        operator: FilterOperator.ENDS_WITH,
    },
    endsWithFilterWithSingleValSQL: `(${stringFilterDimension}) LIKE '%Bob'`,
    endsWithFilterWithMultiVal: {
        ...stringMultiValueFilter,
        operator: FilterOperator.ENDS_WITH,
    },
    endsWithFilterWithMultiValSQL: `(${stringFilterDimension}) LIKE '%Tom'\n  OR\n  (${stringFilterDimension}) LIKE '%Jerry'`,
    endsWithFilterWithNoVal: {
        ...noValueFilter,
        operator: FilterOperator.ENDS_WITH,
    },
    endsWithFilterWithNoValSQL: 'true',

    equalsFilterWithSingleUnescapedValueSQL: `(${stringFilterDimension}) IN ('Bob''s')`,
    equalsFilterWithSingleUnescapedValue: {
        ...stringSingleUnescapedValueFilter,
        operator: FilterOperator.EQUALS,
    },

    equalsFilterWithMultiUnescapedValueSQL: `(${stringFilterDimension}) IN ('Bob''s','Tom''s')`,
    equalsFilterWithMultiUnescapedValue: {
        ...stringMultiUnescapedValueFilter,
        operator: FilterOperator.EQUALS,
    },
};

type RenderFilterRuleSqlParams = Parameters<typeof renderFilterRuleSql>;

export const disabledFilterMock: {
    filterRule: RenderFilterRuleSqlParams[0];
    field: RenderFilterRuleSqlParams[1];
    fieldQuoteChar: RenderFilterRuleSqlParams[2];
    stringQuoteChar: RenderFilterRuleSqlParams[3];
    escapeStringQuoteChar: RenderFilterRuleSqlParams[4];
    startOfWeek: RenderFilterRuleSqlParams[5];
    adapterType: RenderFilterRuleSqlParams[6];
    timezone: RenderFilterRuleSqlParams[7];
} = {
    filterRule: {
        id: '3cf51ddc-fa2b-4442-afaa-9eee4f348d7a',
        target: { fieldId: 'payments_payment_method' },
        values: [],
        operator: ConditionalOperator.NOT_EQUALS,
        disabled: true,
    },
    field: {
        sql: '${TABLE}.payment_method',
        name: 'payment_method',
        type: DimensionType.STRING,
        index: 2,
        label: 'Payment method',
        table: 'payments',
        hidden: false,
        fieldType: FieldType.DIMENSION,
        tableLabel: 'Payments',
        compiledSql: '"payments".payment_method',
        description: 'Method of payment used, for example credit card',
        tablesReferences: ['payments'],
    },
    fieldQuoteChar: '"',
    stringQuoteChar: "'",
    escapeStringQuoteChar: "'",
    startOfWeek: null,
    adapterType: SupportedDbtAdapter.POSTGRES,
    timezone: 'UTC',
};

export const filterInTheCurrentDayTimezoneMocks = [
    [
        'UTC',
        "((customers.created) >= ('2020-04-04 00:00:00') AND (customers.created) <= ('2020-04-04 23:59:59'))",
    ],
    [
        'America/New_York',
        "((customers.created) >= ('2020-04-04 04:00:00') AND (customers.created) <= ('2020-04-05 03:59:59'))",
    ],
    [
        'Asia/Bangkok',
        "((customers.created) >= ('2020-04-03 17:00:00') AND (customers.created) <= ('2020-04-04 16:59:59'))",
    ],
    [
        'Pacific/Fiji',
        "((customers.created) >= ('2020-04-03 12:00:00') AND (customers.created) <= ('2020-04-04 11:59:59'))",
    ],
];
