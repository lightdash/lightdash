import {
    Dimension,
    DimensionType,
    FieldType,
    FilterOperator,
    FilterRule,
    TimeFrames,
} from '.';

export const dateDayDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.DATE,
    timeInterval: TimeFrames.DAY,
    name: 'date',
    label: 'date',
    table: 'table',
    tableLabel: 'tableLabel',
    sql: 'sql',
    hidden: false,
};
export const dateMonthDimension: Dimension = {
    ...dateDayDimension,
    timeInterval: TimeFrames.MONTH,
};

export const dateYearDimension: Dimension = {
    ...dateDayDimension,
    timeInterval: TimeFrames.YEAR,
};
export const emptyValueFilter: FilterRule = {
    id: '1234',
    target: { fieldId: 'table.date' },
    operator: FilterOperator.EQUALS,
    settings: undefined,
    values: [],
};
