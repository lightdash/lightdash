import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { useState, type FC } from 'react';
import {
    selectActiveTabUuid,
    selectControlSections,
    selectDashboardFilters,
    useDashboardSelector,
} from '../../features/dashboard/store';
import { getMoveNeighbours } from '../../features/dashboardControls/sections';
import { type MoveDirection } from '../../features/dashboardControls/useControlsSidebar';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../../features/dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { getFilterRuleFilterType } from '../../features/dashboardFilters/FilterConfiguration/utils';
import { FilterPopover, type FooterLayout } from './FilterPopover';
import {
    parameterValues,
    PROJECT_TIMEZONE,
    PROJECT_UUID,
    TOTAL_TILE_COUNT,
} from './fixtures';
import { ParameterControlPopover } from './ParameterControlPopover';
import { type ParameterControl } from './parameterOptions';
import { type PopoverView } from './views';

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
    footerLayout: FooterLayout;
    onApply: (rule: DashboardFilterRule) => void;
    onCancel: () => void;
    onChooseTiles: () => void;
    onEditRules: () => void;
    onChangeOthers: (rules: DashboardFilterRule[]) => void;
    onMove: (direction: MoveDirection) => void;
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
    onDraftChange,
    ...props
}) => {
    const savedFilters = useDashboardSelector(selectDashboardFilters);
    const sections = useDashboardSelector(selectControlSections);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const { getTabsUsingFilter } = useFilterTabPlacement();
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
        <FilterPopover
            key={opening}
            {...props}
            rule={rule}
            field={field}
            // A SQL column's type rides on the target's fallbackType
            filterType={getFilterRuleFilterType(field ?? undefined, [], rule)}
            totalTileCount={TOTAL_TILE_COUNT}
            filters={filters}
            // As the shipped Settings: shown pills on the tab in view only
            moveNeighbours={getMoveNeighbours(
                filters,
                rule.id,
                sections,
                (other) =>
                    !isFilterHiddenOnTab(
                        getTabsUsingFilter(other),
                        activeTabUuid,
                    ),
            )}
            isAsking={isAsking}
            onChange={(next) => {
                setRule(next);
                onDraftChange(next);
            }}
            onChangeOthers={(changed) => {
                setOthers((current) => [
                    ...current.filter(
                        ({ id }) => !changed.some((other) => other.id === id),
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
            onResolvePending={(shouldApply: boolean) => {
                if (shouldApply) onApply(rule);
                else reset();
                setIsAsking(false);
            }}
        />
    );
};

type StatefulParameterPopoverProps = {
    initialControl: ParameterControl;
    isViewer: boolean;
    isMissingRequired: boolean;
    initialView: PopoverView;
    shadowedReservedNames: string[];
    canMoveLeft: boolean;
    canMoveRight: boolean;
    onApply: (control: ParameterControl) => void;
    onCancel: () => void;
    onChooseTiles: () => void;
    onMove: (direction: MoveDirection) => void;
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
    return (
        <ParameterControlPopover
            key={opening}
            {...props}
            control={control}
            projectUuid={PROJECT_UUID}
            projectTimezone={PROJECT_TIMEZONE}
            parameterValues={parameterValues}
            totalTileCount={TOTAL_TILE_COUNT}
            onChange={setControl}
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
    );
};
