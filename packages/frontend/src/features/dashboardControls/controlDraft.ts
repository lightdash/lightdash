import {
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameterControl,
    type ParameterValue,
} from '@lightdash/common';
import isEqual from 'lodash/isEqual';
import { type ControlType } from './controlType';

// A control while it is open. Nothing it changes reaches the dashboard's
// unsaved edit state until the draft is applied.
export type FilterControlDraft = {
    kind: 'filter';
    isNew: boolean;
    controlType: ControlType;
    rule: DashboardFilterRule;
};

export type ParameterControlDraft = {
    kind: 'parameter';
    isNew: boolean;
    controlType: ControlType;
    control: DashboardParameterControl;
    value: ParameterValue | null;
    // Parameters a tile uses that it has not reported, by tile uuid
    extraTileKeys: Record<string, string[]>;
};

export type ControlDraft = FilterControlDraft | ParameterControlDraft;

export const getDraftId = (draft: ControlDraft): string =>
    draft.kind === 'filter' ? draft.rule.id : draft.control.id;

// A control can be applied once it has something to apply through: a filter
// its field, a parameter control a parameter
export const isControlMapped = (draft: ControlDraft): boolean =>
    draft.kind === 'filter'
        ? draft.rule.target.fieldId !== ''
        : draft.control.parameterKeys.length > 0;

// Settings never carry what the tiles tab and the pill's lock decide: those
// stay as the draft has them
export const withAppliedSettings = (
    current: DashboardFilterRule,
    settings: DashboardFilterRule,
): DashboardFilterRule => ({
    ...settings,
    target: current.target,
    tileTargets: current.tileTargets,
    additionalTargets: current.additionalTargets,
    lockedTabUuids: current.lockedTabUuids,
});

export type FilterBucket = 'dimensions' | 'metrics';

// Writes a filter control: in place when it stays a dimension or a metric
// filter, otherwise at the end of the list it belongs to
export const commitFilterControl = (
    filters: DashboardFilters,
    rule: DashboardFilterRule,
    bucket: FilterBucket,
): DashboardFilters => {
    const otherBucket: FilterBucket =
        bucket === 'dimensions' ? 'metrics' : 'dimensions';
    const isInBucket = filters[bucket].some((item) => item.id === rule.id);
    return {
        ...filters,
        [bucket]: isInBucket
            ? filters[bucket].map((item) => (item.id === rule.id ? rule : item))
            : [...filters[bucket], rule],
        [otherBucket]: filters[otherBucket].filter(
            (item) => item.id !== rule.id,
        ),
    };
};

export const commitParameterControl = (
    controls: DashboardParameterControl[],
    control: DashboardParameterControl,
): DashboardParameterControl[] =>
    controls.some((item) => item.id === control.id)
        ? controls.map((item) => (item.id === control.id ? control : item))
        : [...controls, control];

export type ParameterValueWrite = {
    key: string;
    value: ParameterValue | null;
};

// The control's value goes under every one of its parameters; a parameter
// that left the control stops carrying it
export const getParameterValueWrites = (
    previous: DashboardParameterControl | undefined,
    control: DashboardParameterControl,
    value: ParameterValue | null,
): ParameterValueWrite[] => [
    ...(previous?.parameterKeys ?? [])
        .filter((key) => !control.parameterKeys.includes(key))
        .map((key) => ({ key, value: null })),
    ...control.parameterKeys.map((key) => ({ key, value })),
];

// The open control: its draft, and the draft it started from
export type OpenControl = { draft: ControlDraft; base: ControlDraft };

export const startControl = (draft: ControlDraft): OpenControl => ({
    draft,
    base: draft,
});

// A change to the draft; what it started from stays
export const changeControl = (
    open: OpenControl,
    draft: ControlDraft,
): OpenControl => ({ ...open, draft });

// Whether "Cancel" would lose anything
export const hasControlChanges = ({ draft, base }: OpenControl): boolean =>
    !isEqual(draft, base);

const OUTSIDE_KEYS = ['lockedTabUuids', 'required', 'requiredGroupId'] as const;

// The pill and the rules popover write these straight to the rule while the
// control is open: the draft only wins where it changed them itself
export const withOutsideChanges = (
    draftRule: DashboardFilterRule,
    baseRule: DashboardFilterRule,
    currentRule: DashboardFilterRule | undefined,
): DashboardFilterRule => {
    if (!currentRule) return draftRule;
    return OUTSIDE_KEYS.reduce<DashboardFilterRule>(
        (rule, key) =>
            isEqual(draftRule[key], baseRule[key])
                ? { ...rule, [key]: currentRule[key] }
                : rule,
        draftRule,
    );
};

// "Apply" on a filter control: the whole draft joins the dashboard's filters
export const applyFilterControl = (
    filters: DashboardFilters,
    draft: FilterControlDraft,
    base: FilterControlDraft,
    bucket: FilterBucket,
): DashboardFilters =>
    commitFilterControl(
        filters,
        withOutsideChanges(
            draft.rule,
            base.rule,
            [...filters.dimensions, ...filters.metrics].find(
                (item) => item.id === draft.rule.id,
            ),
        ),
        bucket,
    );

// "Apply" on a parameter control: the controls to keep and the values to write
export const applyParameterControl = (
    controls: DashboardParameterControl[],
    draft: ParameterControlDraft,
    label: string,
): { controls: DashboardParameterControl[]; writes: ParameterValueWrite[] } => {
    const control = { ...draft.control, label };
    return {
        controls: commitParameterControl(controls, control),
        writes: getParameterValueWrites(
            controls.find((item) => item.id === control.id),
            control,
            draft.value,
        ),
    };
};
