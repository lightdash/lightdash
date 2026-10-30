import {
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
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
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { DropdownClass } from './DropdownClass';
import { formatTileCount } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { FilterValueSettings } from './FilterValueSettings';
import { useRailContractClasses } from './railContractClasses';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFiltersStartOfWeek } from './useFiltersStartOfWeek';
import { ViewerControls } from './ViewerControls';

/** The value, or an editor's settings, in the same popover. */
export type EditorView = 'value' | 'settings';

// The value input after the operator select, else the first enabled input or
// control; without scrolling, as the popover is still being placed
const focusValueOnMount = (node: HTMLElement | null) => {
    const inputs = [
        ...(node?.querySelectorAll<HTMLInputElement>(
            'input:not([type="hidden"])',
        ) ?? []),
    ];
    const input =
        [inputs[1], ...inputs].find(
            (candidate) => candidate !== undefined && !candidate.disabled,
        ) ?? node?.querySelector<HTMLElement>('button:not(:disabled)');
    // For the popover's focus trap, which focuses it once it is placed
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

const focusOnMount = (node: HTMLElement | null) =>
    node?.focus({ preventScroll: true });

type Props = {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
    view: EditorView;
    onViewChange: (view: EditorView) => void;
    /** Tiles the filter is on, over every tab. */
    appliedTileCount: number;
    /** Settings: the filter's name. */
    nameInput: ReactNode;
    /** Settings: the filter's section on the bar. */
    sectionSelect: ReactNode;
};

export const FilterSettings: FC<Props> = ({
    rule,
    field,
    onChange,
    view,
    onViewChange,
    appliedTileCount,
    nameInput,
    sectionSelect,
}) => {
    const projectUuid = useProjectUuid();
    const startOfWeek = useFiltersStartOfWeek(projectUuid);
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
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    const filterBarPopovers = useFilterBarPopovers();
    const handleEditRules = useMemo(() => {
        if (!filterBarPopovers) return null;
        return () => {
            close();
            filterBarPopovers.openRulesPopover();
        };
    }, [filterBarPopovers, close]);
    const openSettings = useCallback(
        () => onViewChange('settings'),
        [onViewChange],
    );

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={startOfWeek}
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTabUuid}
            parameterValues={parameterValues}
        >
            {view === 'settings' ? (
                <Stack gap="sm" className={classes.content}>
                    <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                            size="sm"
                            aria-label="Back"
                            ref={focusOnMount}
                            onClick={() => onViewChange('value')}
                        >
                            <MantineIcon icon={IconArrowLeft} />
                        </ActionIcon>
                        <Text fz="sm" fw={600}>
                            Settings
                        </Text>
                    </Group>
                    {nameInput}
                    {sectionSelect}
                    <ViewerControls
                        rule={rule}
                        filterType={filterType}
                        field={field}
                        onChange={onChange}
                        onChangeOthers={updateOtherFilters}
                        onEditRules={handleEditRules}
                    />
                </Stack>
            ) : (
                <>
                    <DropdownClass
                        className={contractClasses?.filterDropdown ?? null}
                    >
                        <Box
                            data-controls-value
                            className={classes.content}
                            ref={focusValueOnMount}
                        >
                            <FilterValueSettings
                                isEditMode={!isViewer}
                                isCreatingNew={isViewer && isNew}
                                filterType={filterType}
                                field={field}
                                filterRule={rule}
                                onChange={onChange}
                            />
                        </Box>
                    </DropdownClass>
                    {/* Where it applies and its settings are the dashboard's */}
                    {!isViewer && (
                        <>
                            <Group
                                justify="space-between"
                                wrap="nowrap"
                                className={classes.row}
                            >
                                <Text fz="xs">
                                    Applies to{' '}
                                    {formatTileCount(
                                        getUiString,
                                        appliedTileCount,
                                    )}
                                </Text>
                                <Button variant="subtle" size="xs" disabled>
                                    Choose tiles
                                </Button>
                            </Group>
                            <UnstyledButton
                                className={classes.row}
                                onClick={openSettings}
                            >
                                <Text fz="xs">Settings</Text>
                                <MantineIcon
                                    icon={IconChevronRight}
                                    size={14}
                                    color="dimmed"
                                />
                            </UnstyledButton>
                        </>
                    )}
                </>
            )}
        </FiltersProvider>
    );
};
