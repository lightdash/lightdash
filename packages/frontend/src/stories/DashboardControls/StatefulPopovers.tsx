import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { Paper } from '@mantine/core';
import { useState, type FC } from 'react';
import {
    selectDashboardFilters,
    useDashboardSelector,
} from '../../features/dashboard/store';
import {
    FilterPopover,
    type EditorView as PopoverView,
} from '../../features/dashboardControls/FilterPopover';
import { ParameterControlPopover } from '../../features/dashboardControls/ParameterControlPopover';
import { getParameterLabel } from '../../features/dashboardControls/parameterControlsBar';
import { getFilterRuleFilterType } from '../../features/dashboardFilters/FilterConfiguration/utils';
import {
    parameterValues,
    PROJECT_TIMEZONE,
    PROJECT_UUID,
    TOTAL_TILE_COUNT,
} from './fixtures';
import { type ParameterControl } from './parameterOptions';

export type StatefulFilterPopoverProps = {
    initialRule: DashboardFilterRule;
    /** Null for a SQL column filter. */
    field: DashboardFilterableField | null;
    isViewer: boolean;
    isOwnFilter: boolean;
    isCreatingNew: boolean;
    canManageExplore: boolean;
    appliedTileCount: number;
    isAsking: boolean;
    initialView: PopoverView;
    onApply: (rule: DashboardFilterRule) => void;
    onCancel: () => void;
    onChooseTiles: () => void;
    onEditRules: () => void;
    onChangeOthers: (rules: DashboardFilterRule[]) => void;
    /** Each edit as the draft takes it, so a play can wait for one. */
    onDraftChange: (rule: DashboardFilterRule) => void;
};

// Holds the draft as the provider does: Cancel puts the rule back as it
// opened (a remount, as reopening would), Apply hands it on
// The draft as the provider keeps it: the dashboard's filters, this one and
// the others the required group changed replacing their saved selves
const withDraft = (
    saved: DashboardFilters,
    edited: DashboardFilterRule[],
): DashboardFilters => {
    const byId = new Map(edited.map((rule) => [rule.id, rule]));
    const replace = (rules: DashboardFilterRule[]) =>
        rules.map((rule) => byId.get(rule.id) ?? rule);
    return {
        ...saved,
        dimensions: replace(saved.dimensions),
        metrics: replace(saved.metrics),
    };
};

export const StatefulFilterPopover: FC<StatefulFilterPopoverProps> = ({
    initialRule,
    field,
    isAsking: initialIsAsking,
    onApply,
    onCancel,
    onChangeOthers,
    onEditRules,
    onDraftChange,
    isViewer,
    isOwnFilter,
    ...props
}) => {
    const savedFilters = useDashboardSelector(selectDashboardFilters);
    const [rule, setRule] = useState(initialRule);
    const [others, setOthers] = useState<DashboardFilterRule[]>([]);
    const [isAsking, setIsAsking] = useState(initialIsAsking);
    const [opening, setOpening] = useState(0);
    const reset = () => {
        setRule(initialRule);
        setOthers([]);
        setOpening((count) => count + 1);
    };
    const filters = withDraft(savedFilters, [...others, rule]);
    return (
        <Paper shadow="md" radius="md" w="fit-content">
            <FilterPopover
                key={opening}
                {...props}
                isViewer={isViewer}
                canChooseTiles={!isViewer || isOwnFilter}
                // A viewer's saved filter resets to the rule it opened with
                savedRule={isViewer && !isOwnFilter ? initialRule : null}
                rule={rule}
                field={field}
                // A SQL column's type rides on the target's fallbackType
                filterType={getFilterRuleFilterType(
                    field ?? undefined,
                    [],
                    rule,
                )}
                totalTileCount={TOTAL_TILE_COUNT}
                filters={filters}
                isAsking={isAsking}
                onChange={(next) => {
                    setRule(next);
                    onDraftChange(next);
                }}
                onChangeOthers={(changed) => {
                    setOthers((current) => [
                        ...current.filter(
                            ({ id }) =>
                                !changed.some((other) => other.id === id),
                        ),
                        ...changed,
                    ]);
                    onChangeOthers(changed);
                }}
                onCancel={() => {
                    reset();
                    onCancel();
                }}
                onApply={() => onApply(rule)}
                onEditRules={onEditRules}
                onResolvePending={(shouldApply: boolean) => {
                    if (shouldApply) onApply(rule);
                    else reset();
                    setIsAsking(false);
                }}
            />
        </Paper>
    );
};

type StatefulParameterPopoverProps = {
    initialControl: ParameterControl;
    isViewer: boolean;
    isMissingRequired: boolean;
    initialView: PopoverView;
    shadowedReservedNames: string[];
    onApply: (control: ParameterControl) => void;
    onCancel: () => void;
    onChooseTiles: () => void;
};

export const StatefulParameterPopover: FC<StatefulParameterPopoverProps> = ({
    initialControl,
    onApply,
    onCancel,
    onChooseTiles,
    ...props
}) => {
    const [control, setControl] = useState(initialControl);
    const [opening, setOpening] = useState(0);
    const [first] = control.parameters;
    const valueType = {
        type: first?.definition.type ?? 'string',
        multiple: first?.definition.multiple ?? false,
    };
    return (
        <Paper shadow="md" radius="md" w="fit-content">
            <ParameterControlPopover
                key={opening}
                {...props}
                // The shipped popover reads the saved shape
                control={{
                    id: control.id,
                    label:
                        control.label ??
                        (first ? getParameterLabel(first) : 'Parameter'),
                    value: control.value,
                    valueType,
                    parameters: Object.fromEntries(
                        control.parameters.map(({ key }) => [
                            key,
                            'all' as const,
                        ]),
                    ),
                    ...(control.hidden && { hidden: true }),
                    ...(control.sectionId !== null && {
                        sectionId: control.sectionId,
                    }),
                }}
                nameSuffix={null}
                parameters={control.parameters}
                input={{
                    key: first?.key ?? control.id,
                    definition: {
                        ...(first?.definition ?? { label: 'Parameter' }),
                        ...valueType,
                    },
                }}
                // Distinct tiles: a tile that uses two of its parameters counts once
                tileCount={new Set(control.tileUuids).size}
                projectUuid={PROJECT_UUID}
                projectTimezone={PROJECT_TIMEZONE}
                parameterValues={parameterValues}
                totalTileCount={TOTAL_TILE_COUNT}
                // The bar's switch prompt is the provider's; the flows play it
                isAsking={false}
                onResolvePending={() => {}}
                onChange={(next) =>
                    setControl((current) => ({
                        ...current,
                        label: next.label,
                        value: next.value,
                        sectionId: next.sectionId ?? null,
                        hidden: next.hidden,
                    }))
                }
                // Stands in for mapping: a control with no tiles takes every
                // tile its parameters reach
                onChooseTiles={() => {
                    onChooseTiles();
                    setControl((current) =>
                        current.tileUuids.length > 0
                            ? current
                            : {
                                  ...current,
                                  tileUuids: [
                                      ...new Set(
                                          current.parameters.flatMap(
                                              ({ tileUuids }) => tileUuids,
                                          ),
                                      ),
                                  ],
                              },
                    );
                }}
                onCancel={() => {
                    setControl(initialControl);
                    setOpening((count) => count + 1);
                    onCancel();
                }}
                onApply={() => onApply(control)}
            />
        </Paper>
    );
};
