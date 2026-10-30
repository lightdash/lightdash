import {
    DimensionType,
    FilterOperator,
    getFilterRuleWithDefaultValue,
    getFilterTypeFromItemType,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Icon123,
    IconAbc,
    IconCalendar,
    IconToggleLeft,
    type Icon,
} from '@tabler/icons-react';

/** The types a control can start from, before it has a field. */
export type ControlType =
    | DimensionType.STRING
    | DimensionType.NUMBER
    | DimensionType.DATE
    | DimensionType.BOOLEAN;

type ControlTypeOption = {
    type: ControlType;
    label: string;
    /** The name a new control of this type goes by until it is named. */
    newName: string;
    icon: Icon;
};

// The icons FieldIcon draws for each type
export const CONTROL_TYPES: ControlTypeOption[] = [
    {
        type: DimensionType.STRING,
        label: 'Text',
        newName: 'New text control',
        icon: IconAbc,
    },
    {
        type: DimensionType.NUMBER,
        label: 'Number',
        newName: 'New number control',
        icon: Icon123,
    },
    {
        type: DimensionType.DATE,
        label: 'Date',
        newName: 'New date control',
        icon: IconCalendar,
    },
    {
        type: DimensionType.BOOLEAN,
        label: 'Yes/no',
        newName: 'New yes/no control',
        icon: IconToggleLeft,
    },
];

export const getControlTypeOption = (type: ControlType): ControlTypeOption =>
    CONTROL_TYPES.find((option) => option.type === type) ?? CONTROL_TYPES[0];

// A control with no field yet: its type rides on the target's fallbackType,
// with the shipped new-filter defaults (EQUALS, no value, off)
export const createTypeControlRule = (type: ControlType): DashboardFilterRule =>
    getFilterRuleWithDefaultValue(
        getFilterTypeFromItemType(type),
        undefined,
        {
            id: `new-${type}-control`,
            label: undefined,
            target: { fieldId: '', tableName: '', fallbackType: type },
            operator: FilterOperator.EQUALS,
            values: [],
            disabled: true,
            tileTargets: {},
        },
        null,
    );
