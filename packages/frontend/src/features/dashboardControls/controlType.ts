import {
    assertUnreachable,
    DimensionType,
    FieldType,
    FilterType,
    getFilterTypeFromItemType,
    getItemType,
    MetricType,
    TableCalculationType,
    type DashboardFilterableField,
    type FilterableDimension,
} from '@lightdash/common';
import { type ParameterType } from './parameterMapping';

// What a control filters by. Finer than a filter's type: a date control and
// a time control are both date filters, but a control only ever applies
// through fields of its own exact type, and each has its own value input.
export type ControlType = 'date' | 'time' | 'text' | 'number' | 'boolean';

// In the order "Add control" offers them
export const CONTROL_TYPES: ControlType[] = [
    'date',
    'time',
    'text',
    'number',
    'boolean',
];

export const CONTROL_TYPE_LABELS: Record<ControlType, string> = {
    date: 'Date',
    time: 'Time',
    text: 'Text',
    number: 'Number',
    boolean: 'Boolean',
};

// The type as sentences name it: "New time control"
export const getControlTypeWord = (type: ControlType): string =>
    CONTROL_TYPE_LABELS[type].toLowerCase();

const FILTER_TYPES: Record<ControlType, FilterType> = {
    date: FilterType.DATE,
    time: FilterType.DATE,
    text: FilterType.STRING,
    number: FilterType.NUMBER,
    boolean: FilterType.BOOLEAN,
};

// The filter a control of this type writes
export const getFilterTypeForControl = (type: ControlType): FilterType =>
    FILTER_TYPES[type];

type ItemType = DimensionType | MetricType | TableCalculationType;

const isTimestampType = (type: ItemType): boolean =>
    type === DimensionType.TIMESTAMP ||
    type === MetricType.TIMESTAMP ||
    type === TableCalculationType.TIMESTAMP;

// The control type a field, metric, table calculation or SQL column of this
// type belongs to
export const getControlTypeFromItemType = (type: ItemType): ControlType => {
    const filterType = getFilterTypeFromItemType(type);
    switch (filterType) {
        case FilterType.DATE:
            return isTimestampType(type) ? 'time' : 'date';
        case FilterType.STRING:
            return 'text';
        case FilterType.NUMBER:
            return 'number';
        case FilterType.BOOLEAN:
            return 'boolean';
        default:
            return assertUnreachable(filterType, 'Unknown filter type');
    }
};

// A custom SQL dimension counts by its dimension type
export const getControlTypeFromItem = (
    item: DashboardFilterableField,
): ControlType => getControlTypeFromItemType(getItemType(item));

// The one question every list of a control's fields asks
export const isItemOfControlType = (
    item: DashboardFilterableField,
    type: ControlType,
): boolean => getControlTypeFromItem(item) === type;

// What one chart tile offers a control: its fields of the control's type.
// The first step's list, "Add field", the tile's picker and the counts all
// come from this.
export const getFieldsOfControlType = (
    fields: DashboardFilterableField[],
    type: ControlType,
): DashboardFilterableField[] =>
    fields.filter((field) => isItemOfControlType(field, type));

// The same for a SQL chart tile's columns
export const getColumnsOfControlType = <T extends { type: DimensionType }>(
    columns: T[],
    type: ControlType,
): T[] =>
    columns.filter(
        (column) => getControlTypeFromItemType(column.type) === type,
    );

const PARAMETER_TYPES: Record<ControlType, ParameterType | null> = {
    date: 'date',
    // A date parameter holds a plain date
    time: null,
    text: 'string',
    number: 'number',
    boolean: null,
};

// The parameter type a control of this type sets; time and boolean have none
export const getParameterTypeForControl = (
    type: ControlType,
): ParameterType | null => PARAMETER_TYPES[type];

const PARAMETER_CONTROL_TYPES: Record<ParameterType, ControlType> = {
    string: 'text',
    number: 'number',
    date: 'date',
};

export const getControlTypeForParameter = (type: ParameterType): ControlType =>
    PARAMETER_CONTROL_TYPES[type];

const standIn = (
    type: DimensionType.DATE | DimensionType.TIMESTAMP,
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name: '',
    label: '',
    table: '',
    tableLabel: '',
    sql: '',
    hidden: false,
});

const DATE_STAND_IN = standIn(DimensionType.DATE);
const TIME_STAND_IN = standIn(DimensionType.TIMESTAMP);

// Stands in for a control's field until it has one, so a date control shows
// the date inputs and a time control the date-and-time inputs from the start
export const getDraftSettingsField = (
    type: ControlType,
): DashboardFilterableField | undefined => {
    switch (type) {
        case 'date':
            return DATE_STAND_IN;
        case 'time':
            return TIME_STAND_IN;
        case 'text':
        case 'number':
        case 'boolean':
            return undefined;
        default:
            return assertUnreachable(type, 'Unknown control type');
    }
};
