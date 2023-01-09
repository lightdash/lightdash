import { FilterOperator, UnitOfTime } from '../types/filter';

export const DimensionSqlMock = 'customers.created';
export const NumberDimensionMock = 'customers.age';

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
    [FilterOperator.NOT_EQUALS]: '(customers.age) NOT IN (1)',
    [FilterOperator.STARTS_WITH]: null,
    [FilterOperator.INCLUDE]: null,
    [FilterOperator.NOT_INCLUDE]: null,
    [FilterOperator.LESS_THAN]: '(customers.age) < (1)',
    [FilterOperator.LESS_THAN_OR_EQUAL]: '(customers.age) <= (1)',
    [FilterOperator.GREATER_THAN]: '(customers.age) > (1)',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: '(customers.age) >= (1)',
    [FilterOperator.IN_THE_PAST]: null,
    [FilterOperator.IN_THE_CURRENT]: null,
    [FilterOperator.IN_THE_NEXT]: null,
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

export const InTheLast1CompletedDayFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.days,
        completed: true,
    },
};

export const InTheLast1CompletedDayFilterSQL = `((customers.created) >= ('2020-04-03') AND (customers.created) < ('2020-04-04'))`;

export const InTheLast1WeekFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.weeks,
        completed: false,
    },
};

export const InTheLast1WeekFilterSQL = `((customers.created) >= ('2020-03-28') AND (customers.created) <= ('2020-04-04'))`;

export const InTheLast1CompletedWeekFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.weeks,
        completed: true,
    },
};

export const InTheLast1CompletedWeekFilterSQL = `((customers.created) >= ('2020-03-22') AND (customers.created) < ('2020-03-29'))`;

export const InTheLast1MonthFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.months,
        completed: false,
    },
};

export const InTheLast1MonthFilterSQL = `((customers.created) >= ('2020-03-04') AND (customers.created) <= ('2020-04-04'))`;

export const InTheLast1CompletedMonthFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.months,
        completed: true,
    },
};

export const InTheLast1CompletedMonthFilterSQL = `((customers.created) >= ('2020-03-01') AND (customers.created) < ('2020-04-01'))`;

export const InTheLast1YearFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.years,
        completed: false,
    },
};

export const InTheLast1YearFilterSQL = `((customers.created) >= ('2019-04-04') AND (customers.created) <= ('2020-04-04'))`;

export const InTheLast1CompletedYearFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.years,
        completed: true,
    },
};

export const InTheLast1CompletedYearFilterSQL = `((customers.created) >= ('2019-01-01') AND (customers.created) < ('2020-01-01'))`;

export const InTheLast1HourFilter = {
    ...InTheLast1WeekFilter,
    settings: {
        unitOfTime: UnitOfTime.hours,
        completed: false,
    },
};

export const InTheLast1HourFilterSQL = `((customers.created) >= ('2020-04-04 05:12:30') AND (customers.created) <= ('2020-04-04 06:12:30'))`;

export const InTheLast1CompletedHourFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.hours,
        completed: true,
    },
};

export const InTheLast1CompletedHourFilterSQL = `((customers.created) >= ('2020-04-04 05:00:00') AND (customers.created) < ('2020-04-04 06:00:00'))`;

export const InTheLast1MinuteFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.minutes,
        completed: false,
    },
};

export const InTheLast1MinuteFilterSQL = `((customers.created) >= ('2020-04-04 06:11:30') AND (customers.created) <= ('2020-04-04 06:12:30'))`;

export const InTheLast1CompletedMinuteFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.minutes,
        completed: true,
    },
};

export const InTheLast1CompletedMinuteFilterSQL = `((customers.created) >= ('2020-04-04 06:11:00') AND (customers.created) < ('2020-04-04 06:12:00'))`;
export const InBetweenPastTwoYears = {
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
export const InBetweenPastTwoYearsTimestampFilterSQL = `((customers.created) >= ('2021-04-04 00:00:00') AND (customers.created) <= ('2023-04-04 00:00:00'))`;

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
    includeFilterWithMultiValSQL: `LOWER(${stringFilterDimension}) LIKE LOWER('%Tom%')\n  OR\n  LOWER(${stringFilterDimension}) LIKE LOWER('%Jerry%')`,
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
};
