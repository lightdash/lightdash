import {
    DimensionType,
    FilterOperator,
    FilterType,
    getFilterOperatorOptions,
    getFilterRuleWithDefaultValue,
    getItemType,
    getUnitsOfTimeGreaterOrEqual,
    isDimension,
    TimeFrames,
    timeframeToUnitOfTime,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { v4 as uuid4 } from 'uuid';
import { type FilterControlDraft } from './controlDraft';
import {
    getDraftSettingsField,
    getFilterTypeForControl,
    type ControlType,
} from './controlType';

// A filter control with no field yet
export const createFilterDraft = (
    controlType: ControlType,
): FilterControlDraft => {
    const filterType = getFilterTypeForControl(controlType);
    return {
        kind: 'filter',
        isNew: true,
        controlType,
        rule: getFilterRuleWithDefaultValue<DashboardFilterRule>(
            filterType,
            getDraftSettingsField(controlType),
            {
                id: uuid4(),
                label: undefined,
                operator: FilterOperator.EQUALS,
                target: { fieldId: '', tableName: '' },
                tileTargets: {},
                disabled: true,
            },
            null,
        ),
    };
};

const RELATIVE_DATE_OPERATORS: FilterOperator[] = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_NEXT,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.NOT_IN_THE_CURRENT,
    FilterOperator.IN_PERIOD_TO_DATE,
];

const VALUELESS_OPERATORS: FilterOperator[] = [
    FilterOperator.NULL,
    FilterOperator.NOT_NULL,
];

const isDayGrainDate = (field: DashboardFilterableField): boolean =>
    getItemType(field) === DimensionType.DATE &&
    (!isDimension(field) ||
        !field.timeInterval ||
        field.timeInterval === TimeFrames.DAY);

// Settings made before a field existed, checked against the control's first
// field. A default value typed as a plain date is kept only when it is still
// valid for that field; otherwise it is cleared rather than saved.
export const reconcileDraftWithField = (
    rule: DashboardFilterRule,
    controlType: ControlType,
    field: DashboardFilterableField,
): DashboardFilterRule => {
    const filterType = getFilterTypeForControl(controlType);
    if (filterType !== FilterType.DATE) return rule;

    const isOperatorOffered = getFilterOperatorOptions(filterType, field).some(
        ({ value }) => value === rule.operator,
    );
    const withoutDefault = (): DashboardFilterRule =>
        getFilterRuleWithDefaultValue<DashboardFilterRule>(
            filterType,
            field,
            {
                ...rule,
                operator: isOperatorOffered
                    ? rule.operator
                    : FilterOperator.EQUALS,
                values: undefined,
                settings: undefined,
                disabled: true,
            },
            null,
        );

    if (!isOperatorOffered) return withoutDefault();
    // A time control's value was typed as a date and time: it fits its field
    if (controlType === 'time') return rule;
    // No default value to carry over
    if (rule.disabled) return rule;
    if (VALUELESS_OPERATORS.includes(rule.operator)) return rule;
    if (isDayGrainDate(field)) return rule;

    if (RELATIVE_DATE_OPERATORS.includes(rule.operator)) {
        const unit = rule.settings?.unitOfTime;
        const minUnit =
            isDimension(field) && field.timeInterval
                ? timeframeToUnitOfTime(field.timeInterval)
                : undefined;
        const isUnitAllowed =
            !minUnit ||
            !unit ||
            getUnitsOfTimeGreaterOrEqual(minUnit).includes(unit);
        return isUnitAllowed ? rule : withoutDefault();
    }

    // A date typed by hand is not a timestamp, nor the start of a week,
    // month, quarter or year
    return withoutDefault();
};
