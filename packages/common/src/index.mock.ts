import {
    DimensionType,
    FieldType,
    FilterOperator,
    TimeFrames,
    type Dimension,
    type FilterRule,
} from '.';

export const dateDayDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    timeInterval: TimeFrames.DAY,
    name: 'date',
    label: 'date day',
    table: 'table',
    tableLabel: 'tableLabel',
    sql: 'sql',
    hidden: false,
};
export const dateMonthDimension: Dimension = {
    ...dateDayDimension,
    timeInterval: TimeFrames.MONTH,
    label: 'date month',
};

export const dateYearDimension: Dimension = {
    ...dateDayDimension,
    timeInterval: TimeFrames.YEAR,
    label: 'date year',
};

export const dateDayDimensionWithGroup: Dimension = {
    ...dateDayDimension,
    groups: ['date group'],
};

export const emptyValueFilter: FilterRule = {
    id: '1234',
    target: { fieldId: 'table.date' },
    operator: FilterOperator.EQUALS,
    settings: undefined,
    values: [],
};

export const stringDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'name',
    label: 'label',
    table: 'table',
    tableLabel: 'tableLabel',
    sql: 'sql',
    hidden: false,
};
