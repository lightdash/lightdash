import { FilterOperator, UnitOfTime } from '../types/filter';

export const DimensionSqlMock = 'customers.created';

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

export const InTheLast1HourFilterSQL = `((customers.created) >= ('2020-04-03 23:12:00') AND (customers.created) <= ('2020-04-04 00:12:00'))`;

export const InTheLast1CompletedHourFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.hours,
        completed: true,
    },
};

export const InTheLast1CompletedHourFilterSQL = `((customers.created) >= ('2020-04-03 23:00:00') AND (customers.created) < ('2020-04-04 00:00:00'))`;

export const InTheLast1MinuteFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.minutes,
        completed: false,
    },
};

export const InTheLast1MinuteFilterSQL = `((customers.created) >= ('2020-04-04 00:11:00') AND (customers.created) <= ('2020-04-04 00:12:00'))`;

export const InTheLast1CompletedMinuteFilter = {
    ...InTheLast1DayFilter,
    settings: {
        unitOfTime: UnitOfTime.minutes,
        completed: true,
    },
};

export const InTheLast1CompletedMinuteFilterSQL = `((customers.created) >= ('2020-04-04 00:11:00') AND (customers.created) < ('2020-04-04 00:12:00'))`;

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
