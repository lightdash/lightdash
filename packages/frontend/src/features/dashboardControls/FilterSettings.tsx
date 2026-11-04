import {
    FilterType,
    interpolateUiString,
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
    Title,
    Tooltip,
} from '@mantine/core';
import { IconArrowLeft, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useMemo, type FC, type ReactNode } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import MantineIcon from '../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../components/common/PolymorphicGroupButton';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectActiveTabUuid,
    selectControlSections,
    selectDashboardFilters,
    selectDashboardTiles,
    selectParameterValues,
    selectSqlChartTilesMetadata,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../dashboard/store';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import {
    getFilterRuleFilterType,
    getUniqueSqlColumns,
} from '../dashboardFilters/FilterConfiguration/utils';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { DropdownClass } from './DropdownClass';
import { formatTileCount } from './fieldLabels';
import classes from './FilterEditor.module.css';
import { FilterValueSettings } from './FilterValueSettings';
import { focusOnMount } from './mappingFocus';
import { useRailContractClasses } from './railContractClasses';
import { getMoveNeighbours } from './sections';
import {
    useControlsSidebarSelector,
    type MoveDirection,
} from './useControlsSidebar';
import { useFiltersStartOfWeek } from './useFiltersStartOfWeek';
import { ViewerControls } from './ViewerControls';

/** The value, or an editor's settings, in the same popover. */
export type EditorView = 'value' | 'settings';

// The value input after the operator select, else the first enabled input or
// control; without scrolling, as the popover is still being placed
const focusValue = (node: HTMLElement | null, isListShutOnFocus: boolean) => {
    const inputs = [
        ...(node?.querySelectorAll<HTMLInputElement>(
            'input:not([type="hidden"])',
        ) ?? []),
    ];
    // Any other typed input that owns a list opens it on focus, over the
    // footer: the operator takes focus instead
    const input =
        [inputs[1], ...inputs].find(
            (candidate) =>
                candidate !== undefined &&
                !candidate.disabled &&
                (isListShutOnFocus ||
                    candidate.readOnly ||
                    candidate.closest('[aria-haspopup]') === null),
        ) ?? node?.querySelector<HTMLElement>('button:not(:disabled)');
    // For the popover's focus trap, which focuses it once it is placed
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};
const focusValueOnMount = (node: HTMLElement | null) => focusValue(node, false);
// A string value's list stays shut on focus (`isListClosedOnPick`)
const focusStringValueOnMount = (node: HTMLElement | null) =>
    focusValue(node, true);

// The pill's place on the bar, as Alt with an arrow on it. An end stays
// focusable, so a press that reaches it keeps the focus
const MoveButtons: FC<{ filterId: string }> = ({ filterId }) => {
    const filters = useDashboardSelector(selectDashboardFilters);
    const sections = useDashboardSelector(selectControlSections);
    const activeTabUuid = useDashboardSelector(selectActiveTabUuid);
    const { getTabsUsingFilter } = useFilterTabPlacement();
    const moveFilter = useControlsSidebarSelector((c) => c.moveFilter);
    const { before, after } = getMoveNeighbours(
        filters,
        filterId,
        sections,
        (rule) => !isFilterHiddenOnTab(getTabsUsingFilter(rule), activeTabUuid),
    );
    const moveButton = (
        label: string,
        direction: MoveDirection,
        isEnd: boolean,
    ) => (
        <Button
            size="xs"
            variant="default"
            data-disabled={isEnd || undefined}
            aria-disabled={isEnd || undefined}
            onClick={() => {
                if (!isEnd) moveFilter(filterId, direction);
            }}
        >
            {label}
        </Button>
    );
    return (
        <Group gap="xs" grow>
            {moveButton('Move left', 'left', before === null)}
            {moveButton('Move right', 'right', after === null)}
        </Group>
    );
};

type Props = {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
    view: EditorView;
    onViewChange: (view: EditorView) => void;
    /** Tiles the filter is on, over every tab. */
    appliedTileCount: number;
    /** The value view's title: the filter's name. */
    title: ReactNode;
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
    title,
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
    const canChooseTiles = useControlsSidebarSelector((c) => c.canChooseTiles);
    const startMapping = useControlsSidebarSelector((c) => c.startMapping);
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
                        <Tooltip fz="xs" label="Back">
                            <ActionIcon
                                size="sm"
                                aria-label="Back"
                                ref={focusOnMount}
                                onClick={() => onViewChange('value')}
                            >
                                <MantineIcon icon={IconArrowLeft} />
                            </ActionIcon>
                        </Tooltip>
                        <Title order={6} lh="sm">
                            Settings
                        </Title>
                    </Group>
                    {sectionSelect}
                    <MoveButtons filterId={rule.id} />
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
                    <Box className={classes.title}>{title}</Box>
                    <DropdownClass
                        className={contractClasses?.filterDropdown ?? null}
                    >
                        <Box
                            data-controls-value
                            className={classes.content}
                            ref={
                                filterType === FilterType.STRING
                                    ? focusStringValueOnMount
                                    : focusValueOnMount
                            }
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
                    {/* As the shipped Tiles tab: not on a viewer's saved filter */}
                    {canChooseTiles && (
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            className={classes.row}
                        >
                            <Text fz="xs">
                                {interpolateUiString(
                                    getUiString('filters.rail.appliesTo'),
                                    {
                                        tiles: formatTileCount(
                                            getUiString,
                                            appliedTileCount,
                                        ),
                                    },
                                )}
                            </Text>
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={startMapping}
                            >
                                {getUiString('filters.rail.chooseTiles')}
                            </Button>
                        </Group>
                    )}
                    {/* Its settings are the dashboard's */}
                    {!isViewer && (
                        <PolymorphicGroupButton
                            component="button"
                            type="button"
                            justify="space-between"
                            wrap="nowrap"
                            className={`${classes.row} mantine-focus-auto`}
                            onClick={openSettings}
                        >
                            <Text fz="xs">Settings</Text>
                            <MantineIcon
                                icon={IconChevronRight}
                                size={14}
                                color="dimmed"
                            />
                        </PolymorphicGroupButton>
                    )}
                </>
            )}
        </FiltersProvider>
    );
};
