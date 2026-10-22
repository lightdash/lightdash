import {
    isFilterLockedOnTab,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Box, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import { useMemo, type FC, type ReactNode } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../components/common/MantineIcon';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectDashboardFilters,
    selectDashboardTabs,
    selectDashboardTiles,
    selectParameterValues,
    selectSqlChartTilesMetadata,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../dashboard/store';
import {
    getFilterRuleFilterType,
    getUniqueSqlColumns,
} from '../dashboardFilters/FilterConfiguration/utils';
import { useDashboardFilterField } from '../dashboardFilters/FilterRequirements/useDashboardFilterField';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { getDashboardFilterRuleLabel } from '../dashboardFilters/FilterRequirements/utils';
import classes from './ControlSidebar.module.css';
import { FilterValueSettings } from './FilterValueSettings';
import {
    getLockSummary,
    getRequiredSummary,
    type LockState,
} from './railSummaries';
import { getAlternativeIds, isRuleRequired } from './requirements';
import {
    useControlsSidebarSelector,
    type ControlsSidebarSection,
} from './useControlsSidebar';
import { ViewerControls } from './ViewerControls';

// What "Rules" holds, in words: the lock and the requirement
const useRulesSummary = (rule: DashboardFilterRule) => {
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const getField = useDashboardFilterField();
    const lockState: LockState =
        dashboardTabs.length > 0
            ? {
                  hasTabs: true,
                  lockedTabNames: dashboardTabs
                      .filter((tab) =>
                          isFilterLockedOnTab(rule, tab.uuid, true),
                      )
                      .map((tab) => tab.name),
                  tabCount: dashboardTabs.length,
              }
            : { hasTabs: false, isLocked: !!rule.lockedTabUuids?.length };
    // The rule being edited may be ahead of, or missing from, the saved filters
    const alternativeLabels = useMemo(() => {
        const savedRules = [
            ...dashboardFilters.dimensions,
            ...dashboardFilters.metrics,
        ];
        const allRules = savedRules.some((saved) => saved.id === rule.id)
            ? savedRules.map((saved) => (saved.id === rule.id ? rule : saved))
            : [...savedRules, rule];
        const alternativeIds = getAlternativeIds(allRules, rule.id);
        return allRules
            .filter((other) => alternativeIds.includes(other.id))
            .map((other) => getDashboardFilterRuleLabel(other, getField));
    }, [dashboardFilters, rule, getField]);
    return {
        lock: getLockSummary(lockState),
        required: getRequiredSummary(isRuleRequired(rule), alternativeLabels),
    };
};

type DisclosureProps = {
    section: ControlsSidebarSection;
    label: string;
    summary: ReactNode;
    isOpen: boolean;
    onToggle: (section: ControlsSidebarSection) => void;
    children: ReactNode;
};

const Disclosure: FC<DisclosureProps> = ({
    section,
    label,
    summary,
    isOpen,
    onToggle,
    children,
}) => (
    <>
        <UnstyledButton
            className={classes.disclosure}
            aria-expanded={isOpen}
            onClick={() => onToggle(section)}
        >
            <Text fz="sm" fw={500}>
                {label}
            </Text>
            <Text
                fz="xs"
                c="dimmed"
                truncate
                className={classes.disclosureSummary}
            >
                {summary}
            </Text>
            <MantineIcon
                icon={IconChevronRight}
                size={14}
                color="dimmed"
                className={classes.chevron}
            />
        </UnstyledButton>
        {isOpen && <Box className={classes.panel}>{children}</Box>}
    </>
);

type Props = {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
    /** The fields and tiles of the filter, shown under "Tiles". */
    tiles: ReactNode;
    tilesSummary: string;
};

export const FilterSettings: FC<Props> = ({
    rule,
    field,
    onChange,
    tiles,
    tilesSummary,
}) => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const allFilters = useDashboardAllFilters();
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const parameterValues = useDashboardSelector(selectParameterValues);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    // As the shipped popover reads it: the field's type, else the column's
    const sqlChartTilesMetadata = useDashboardSelector(
        selectSqlChartTilesMetadata,
    );
    const filterType = useMemo(
        () =>
            getFilterRuleFilterType(
                field ?? undefined,
                getUniqueSqlColumns(sqlChartTilesMetadata),
                rule,
            ),
        [field, sqlChartTilesMetadata, rule],
    );
    // "Filter rules" opens from its button on the bar, which is only there
    // once the editor has closed
    const close = useControlsSidebarSelector((c) => c.close);
    const updateOtherFilters = useControlsSidebarSelector(
        (c) => c.updateOtherFilters,
    );
    const activeSection = useControlsSidebarSelector((c) => c.activeSection);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const isSavedValue = useControlsSidebarSelector((c) => c.isSavedValue);
    const setActiveSection = useControlsSidebarSelector(
        (c) => c.setActiveSection,
    );
    const filterBarPopovers = useFilterBarPopovers();
    const handleEditRules = useMemo(() => {
        if (!filterBarPopovers) return null;
        return () => {
            close();
            filterBarPopovers.openRulesPopover();
        };
    }, [filterBarPopovers, close]);
    const toggleSection = (section: ControlsSidebarSection) =>
        setActiveSection(activeSection === section ? null : section);

    const { lock, required } = useRulesSummary(rule);
    const rulesSummary =
        lock === null && required === null ? (
            'None'
        ) : (
            <>
                {lock}
                {lock !== null && required !== null && ' · '}
                {required !== null && (
                    <Text span inherit className={classes.required}>
                        {required}
                    </Text>
                )}
            </>
        );

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTabUuid}
            parameterValues={parameterValues}
        >
            <FilterValueSettings
                isEditMode={!isViewer}
                filterType={filterType}
                field={field}
                filterRule={rule}
                onChange={onChange}
            />
            {/* A viewer changes a saved filter's value, nothing else */}
            {isViewer && !isSavedValue && (
                <Text fz="xs" c="dimmed">
                    Added by you · only in this view and its link
                </Text>
            )}
            {!isSavedValue && (
                <Box className={classes.disclosures}>
                    <Disclosure
                        section="tiles"
                        label="Tiles"
                        summary={tilesSummary}
                        isOpen={activeSection === 'tiles'}
                        onToggle={toggleSection}
                    >
                        {tiles}
                    </Disclosure>
                    {/* Locks and requirements are the dashboard's, never a viewer's */}
                    {!isViewer && (
                        <Disclosure
                            section="rules"
                            label="Rules"
                            summary={rulesSummary}
                            isOpen={activeSection === 'rules'}
                            onToggle={toggleSection}
                        >
                            <ViewerControls
                                rule={rule}
                                filterType={filterType}
                                field={field}
                                onChange={onChange}
                                onChangeOthers={updateOtherFilters}
                                onEditRules={handleEditRules}
                            />
                        </Disclosure>
                    )}
                </Box>
            )}
        </FiltersProvider>
    );
};
