import {
    getItemId,
    interpolateUiString,
    isDashboardChartTileType,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    isDashboardSqlChartTile,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type ChartKind,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type Field,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Collapse,
    Group,
    Select,
    Stack,
    Switch,
    Text,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import {
    IconAppWindow,
    IconChevronDown,
    IconChevronRight,
    IconRotate2,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import MantineIcon from '../../../components/common/MantineIcon';
import { getChartIcon } from '../../../components/common/ResourceIcon/utils';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { FilterActions, type BulkFilterAction } from './constants';
import classes from './FilterConfiguration.module.css';
import {
    getFilterTileRelation,
    getTabToggleAction,
    getValidSqlColumnReferences,
} from './utils';

type TileWithTargetFields = {
    targetType: 'field';
    key: string;
    label: string;
    isFiltered: boolean;
    isOverride: boolean;
    disabled: boolean;
    invalidField?: string;
    tileUuid: string;
    tileChartKind?: ChartKind | undefined;
    sortedFilters: Field[] | undefined;
    selectedField: Field | undefined;
    tabUuid?: string | null;
    hasExactMatch: boolean;
};

type TileWithTargetColumns = {
    targetType: 'sqlColumn';
    key: string;
    label: string;
    isFiltered: boolean;
    isOverride: boolean;
    disabled: boolean;
    invalidField?: string;
    tileUuid: string;
    tileChartKind?: ChartKind | undefined;
    sortedFilters: string[];
    selectedField: string | undefined;
    tabUuid?: string | null;
    hasExactMatch: boolean;
};

type DataAppTileTarget = {
    targetType: 'dataApp';
    key: string;
    label: string;
    isFiltered: boolean;
    isOverride: boolean;
    disabled: false;
    invalidField: undefined;
    tileUuid: string;
    tileChartKind: undefined;
    sortedFilters: undefined;
    selectedField: undefined;
    tabUuid: string | null;
    hasExactMatch: true;
};

type TileTarget =
    | TileWithTargetFields
    | TileWithTargetColumns
    | DataAppTileTarget;

type Props = {
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    availableTileFilters: Record<string, Field[] | undefined>;
    field?: Field;
    filterRule: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    onChange: (
        action: FilterActions,
        tileUuid: string,
        target?: DashboardFieldTarget,
    ) => void;
    onBulkChange: (action: BulkFilterAction, tileUuids: string[]) => void;
};

const TileFilterConfiguration: FC<Props> = ({
    tiles,
    tabs,
    field,
    filterRule,
    availableTileFilters,
    popoverProps,
    onChange,
    onBulkChange,
}) => {
    const getUiString = useUiStrings();
    const [collapsedTabs, setCollapsedTabs] = useState<Record<string, boolean>>(
        {},
    );
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const sortTilesByFieldMatch = useCallback(
        (
            fieldMatcher: (a: Field) => (b: Field) => boolean,
            a: Field[] | undefined,
            b: Field[] | undefined,
        ) => {
            if (!a || !b || !field) return 0;

            const matchA = a.some(fieldMatcher(field));
            const matchB = b.some(fieldMatcher(field));
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const sortFieldsByMatch = useCallback(
        (
            fieldMatcher: (a: Field) => (b: Field) => boolean,
            a: Field,
            b: Field,
        ) => {
            if (!field) return 0;
            const matchA = fieldMatcher(field)(a);
            const matchB = fieldMatcher(field)(b);
            return matchA === matchB ? 0 : matchA ? -1 : 1;
        },
        [field],
    );

    const sortedTileWithFilters = useMemo(() => {
        return Object.entries(availableTileFilters)
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldByTypeAndName, a, b),
            )
            .sort(([, a], [, b]) =>
                sortTilesByFieldMatch(matchFieldExact, a, b),
            );
    }, [sortTilesByFieldMatch, availableTileFilters]);

    const tileTargetList = useMemo(() => {
        const tileWithTargetFields =
            sortedTileWithFilters.map<TileWithTargetFields>(
                ([tileUuid, filters], index) => {
                    const tile = tiles.find((t) => t.uuid === tileUuid);
                    const tabUuidFromTile = tile?.tabUuid;

                    // Use shared utility to determine filter-tile relationship
                    const { relation, tileConfig } = getFilterTileRelation(
                        filterRule,
                        tileUuid,
                    );

                    let selectedField;
                    let invalidField: string | undefined;
                    if (relation !== 'disabled') {
                        selectedField =
                            relation === 'mapped' &&
                            tileConfig &&
                            isDashboardFieldTarget(tileConfig)
                                ? filters?.find(
                                      (f) =>
                                          tileConfig?.fieldId === getItemId(f),
                                  )
                                : field
                                  ? filters?.find((f) =>
                                        matchFieldExact(f)(field),
                                    )
                                  : undefined;

                        // If tileConfig?.fieldId is set, but the field is not found in the filters, we mark it as invalid filter (missing dimension in model)
                        invalidField =
                            relation === 'mapped' &&
                            tileConfig &&
                            isDashboardFieldTarget(tileConfig) &&
                            tileConfig?.fieldId !== undefined &&
                            selectedField === undefined
                                ? tileConfig?.fieldId
                                : undefined;
                    }

                    const isFilterAvailable = field
                        ? (filters?.some(matchFieldByType(field)) ?? false)
                        : false;

                    const sortedFilters = field
                        ? filters
                              ?.filter(matchFieldByType(field))
                              .sort((a, b) =>
                                  sortFieldsByMatch(
                                      matchFieldByTypeAndName,
                                      a,
                                      b,
                                  ),
                              )
                              .sort((a, b) =>
                                  sortFieldsByMatch(matchFieldExact, a, b),
                              )
                        : filters;

                    const tileWithoutTitle =
                        !tile?.properties.title ||
                        tile.properties.title.length === 0;
                    const isChartTileType =
                        tile && isDashboardChartTileType(tile);

                    let tileLabel = '';
                    if (tile) {
                        if (tileWithoutTitle && isChartTileType) {
                            tileLabel = tile.properties.chartName || '';
                        } else if (tile.properties.title) {
                            tileLabel = tile.properties.title;
                        }
                    }

                    const hasExactMatch = field
                        ? (sortedFilters?.some((f) =>
                              matchFieldExact(f)(field),
                          ) ?? false)
                        : false;

                    return {
                        targetType: 'field',
                        key: tileUuid + index,
                        label: tileLabel,
                        isFiltered: !!selectedField || !!invalidField,
                        isOverride: relation !== 'auto',
                        disabled: !isFilterAvailable,
                        invalidField,
                        tileUuid,
                        ...(tile &&
                            isDashboardChartTileType(tile) && {
                                tileChartKind:
                                    tile.properties.lastVersionChartKind ??
                                    undefined,
                            }),
                        sortedFilters,
                        selectedField,
                        tabUuid: tabUuidFromTile,
                        hasExactMatch,
                    };
                },
            );
        const tileWithTargetColumns = Object.entries(
            sqlChartTilesMetadata,
        ).reduce<TileWithTargetColumns[]>(
            (acc, [tileUuid, metadata], index) => {
                const columns = getValidSqlColumnReferences(metadata.columns);
                const tile = tiles.find((t) => t.uuid === tileUuid);
                if (!tile) {
                    return acc;
                }

                // Use shared utility to determine filter-tile relationship
                const { relation, tileConfig } = getFilterTileRelation(
                    filterRule,
                    tileUuid,
                );

                let selectedField;
                let invalidField: string | undefined;
                if (relation !== 'disabled') {
                    selectedField =
                        relation === 'mapped' &&
                        tileConfig &&
                        isDashboardFieldTarget(tileConfig)
                            ? columns?.find((f) => tileConfig?.fieldId === f)
                            : undefined;

                    // If tileConfig?.fieldId is set, but the field is not found in the filters, we mark it as invalid filter (missing dimension in model)
                    invalidField =
                        relation === 'mapped' &&
                        tileConfig &&
                        isDashboardFieldTarget(tileConfig) &&
                        tileConfig?.fieldId !== undefined &&
                        selectedField === undefined
                            ? tileConfig?.fieldId
                            : undefined;
                }

                const tileWithoutTitle =
                    !tile.properties.title ||
                    tile.properties.title.length === 0;
                const isSqlTileType = tile && isDashboardSqlChartTile(tile);
                let tileLabel = '';
                if (tileWithoutTitle && isSqlTileType) {
                    tileLabel = tile.properties.chartName || '';
                } else if (tile.properties.title) {
                    tileLabel = tile.properties.title;
                }
                acc.push({
                    targetType: 'sqlColumn',
                    key: tileUuid + index,
                    label: tileLabel,
                    isFiltered: !!selectedField || !!invalidField,
                    isOverride: relation !== 'auto',
                    disabled: false,
                    invalidField,
                    tileUuid,
                    sortedFilters: columns,
                    selectedField,
                    tabUuid: tile.tabUuid,
                    hasExactMatch: false, // SQL tiles don't have exact field match concept
                });
                return acc;
            },
            [],
        );

        const dataAppTileTargets = tiles
            .filter(isDashboardDataAppTileType)
            .map<DataAppTileTarget>((tile) => {
                const { relation } = getFilterTileRelation(
                    filterRule,
                    tile.uuid,
                );
                return {
                    targetType: 'dataApp',
                    key: tile.uuid,
                    label: tile.properties.title,
                    isFiltered: relation !== 'disabled',
                    isOverride: relation !== 'auto',
                    disabled: false,
                    invalidField: undefined,
                    tileUuid: tile.uuid,
                    tileChartKind: undefined,
                    sortedFilters: undefined,
                    selectedField: undefined,
                    tabUuid: tile.tabUuid ?? null,
                    hasExactMatch: true,
                };
            });

        return [
            ...tileWithTargetFields,
            ...tileWithTargetColumns,
            ...dataAppTileTargets,
        ];
    }, [
        sortedTileWithFilters,
        sqlChartTilesMetadata,
        tiles,
        filterRule,
        field,
        sortFieldsByMatch,
    ]);

    const tabTiles = (tabUuid: string) =>
        tileTargetList.filter((v) => v.tabUuid === tabUuid);

    const handleToggleTile = (value: TileTarget, isFiltered: boolean) => {
        if (!isFiltered) {
            onChange(FilterActions.REMOVE, value.tileUuid);
        } else if (value.hasExactMatch) {
            onChange(FilterActions.RESET, value.tileUuid);
        } else {
            onChange(FilterActions.ADD, value.tileUuid);
        }
    };

    const handlePickField = (
        value: TileTarget,
        newField: Field | undefined,
    ) => {
        if (!newField) return;
        if (field && matchFieldExact(field)(newField)) {
            // Picking the matching field is the default, not an override
            onChange(FilterActions.RESET, value.tileUuid);
            return;
        }
        onChange(FilterActions.ADD, value.tileUuid, {
            fieldId: getItemId(newField),
            tableName: newField.table,
        });
    };

    const renderPicker = (value: TileTarget) => {
        if (value.targetType === 'dataApp') return <Box />;
        if (value.disabled && !value.isFiltered) {
            return (
                <Text fz="xs" c="dimmed">
                    {getUiString('filters.config.noFieldsMatchingType')}
                </Text>
            );
        }
        const inputClassName =
            value.isOverride && value.isFiltered
                ? classes.overrideInput
                : undefined;
        const comboboxProps = {
            withinPortal: false,
            classNames: { dropdown: classes.inlineDropdown },
        };
        if (value.targetType === 'field') {
            return (
                <FieldSelect
                    size="xs"
                    item={value.selectedField}
                    items={value.sortedFilters ?? []}
                    placeholder={getUiString('filters.config.chooseField')}
                    error={!!value.invalidField}
                    classNames={{ input: inputClassName }}
                    comboboxProps={comboboxProps}
                    onDropdownOpen={popoverProps?.onOpen}
                    onDropdownClose={popoverProps?.onClose}
                    onChange={(newField) => handlePickField(value, newField)}
                />
            );
        }
        return (
            <Select
                size="xs"
                searchable
                withScrollArea={false}
                allowDeselect={false}
                placeholder={getUiString('filters.config.chooseColumn')}
                error={!!value.invalidField}
                classNames={{ input: inputClassName }}
                comboboxProps={comboboxProps}
                onDropdownOpen={popoverProps?.onOpen}
                onDropdownClose={popoverProps?.onClose}
                value={value.selectedField ?? null}
                data={value.sortedFilters}
                onChange={(newColumn) => {
                    if (!newColumn) return;
                    onChange(FilterActions.ADD, value.tileUuid, {
                        fieldId: newColumn,
                        tableName: 'mock_table',
                        isSqlColumn: true,
                    });
                }}
            />
        );
    };

    const renderRows = (tileList: TileTarget[]) => {
        if (tileList.length === 0) {
            return (
                <Text size="xs" c="dimmed">
                    {getUiString('filters.config.noTilesInTab')}
                </Text>
            );
        }
        return tileList.map((value) => (
            <Box
                key={value.key}
                className={classes.tileRow}
                data-testid="tile-filter-item"
            >
                <Switch
                    size="xs"
                    aria-label={value.label}
                    checked={value.isFiltered}
                    disabled={value.disabled && !value.isFiltered}
                    onChange={(event) =>
                        handleToggleTile(value, event.currentTarget.checked)
                    }
                />
                <Tooltip
                    label={interpolateUiString(
                        getUiString('filters.config.fieldNotAvailableInChart'),
                        { field: value.invalidField ?? '' },
                    )}
                    position="top-start"
                    disabled={value.invalidField === undefined}
                >
                    <Group gap="xxs" wrap="nowrap" miw={0}>
                        <MantineIcon
                            color="blue.6"
                            icon={
                                value.targetType === 'dataApp'
                                    ? IconAppWindow
                                    : getChartIcon(value.tileChartKind)
                            }
                        />
                        <Text
                            fz="sm"
                            truncate
                            c={
                                value.invalidField
                                    ? 'red'
                                    : value.isFiltered
                                      ? undefined
                                      : 'dimmed'
                            }
                        >
                            {value.label}
                        </Text>
                    </Group>
                </Tooltip>
                {renderPicker(value)}
                <Tooltip label={getUiString('filters.config.revertTile')}>
                    <ActionIcon
                        size="sm"
                        aria-label={getUiString('filters.config.revertTile')}
                        disabled={!value.isOverride}
                        onClick={() =>
                            onChange(FilterActions.RESET, value.tileUuid)
                        }
                    >
                        <MantineIcon icon={IconRotate2} />
                    </ActionIcon>
                </Tooltip>
            </Box>
        ));
    };

    const formatFilteredCount = (tileList: TileTarget[]) =>
        interpolateUiString(getUiString('filters.config.tilesFilteredCount'), {
            filtered: tileList.filter((v) => v.isFiltered).length,
            total: tileList.length,
        });

    const renderTab = (tab: DashboardTab) => {
        const tileList = tabTiles(tab.uuid);
        const isCollapsed = collapsedTabs[tab.uuid] ?? true;
        const isAnyFiltered = tileList.some((v) => v.isFiltered);
        return (
            <Box key={tab.uuid}>
                <Group gap="xs" wrap="nowrap">
                    <ActionIcon
                        size="xs"
                        onClick={() =>
                            setCollapsedTabs((prev) => ({
                                ...prev,
                                [tab.uuid]: !(prev[tab.uuid] ?? true),
                            }))
                        }
                        aria-label={getUiString(
                            isCollapsed
                                ? 'filters.config.expandTab'
                                : 'filters.config.collapseTab',
                        )}
                    >
                        <MantineIcon
                            icon={
                                isCollapsed ? IconChevronRight : IconChevronDown
                            }
                        />
                    </ActionIcon>
                    <Switch
                        size="xs"
                        aria-label={tab.name}
                        checked={isAnyFiltered}
                        disabled={tileList.length === 0}
                        onChange={() => {
                            const action = getTabToggleAction(tileList);
                            onBulkChange(action.action, action.tileUuids);
                        }}
                    />
                    <Text fz="sm" fw={500}>
                        {tab.name}
                    </Text>
                    <Text fz="xs" c="dimmed">
                        {formatFilteredCount(tileList)}
                    </Text>
                </Group>
                <Collapse expanded={!isCollapsed}>
                    <Stack gap={0} mt="xs">
                        {renderRows(tileList)}
                    </Stack>
                </Collapse>
            </Box>
        );
    };

    const overrideCount = tileTargetList.filter((v) => v.isOverride).length;

    return (
        <Stack gap="sm" className={classes.tileScrollArea}>
            <Group justify="space-between" wrap="nowrap">
                <Text fz="xs" c="dimmed">
                    {formatFilteredCount(tileTargetList)}
                    {overrideCount > 0 &&
                        ` · ${
                            overrideCount === 1
                                ? getUiString(
                                      'filters.config.tileOverrides.singular',
                                  )
                                : interpolateUiString(
                                      getUiString(
                                          'filters.config.tileOverrides.plural',
                                      ),
                                      { n: overrideCount },
                                  )
                        }`}
                </Text>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    disabled={overrideCount === 0}
                    onClick={() =>
                        onBulkChange(
                            FilterActions.RESET,
                            tileTargetList
                                .filter((v) => v.isOverride)
                                .map((v) => v.tileUuid),
                        )
                    }
                >
                    {getUiString('filters.config.revertAllTiles')}
                </Button>
            </Group>
            <Box className={classes.tileHeader}>
                <Text fz="xs" fw={600} c="dimmed">
                    {getUiString('filters.config.tileHeaderOn')}
                </Text>
                <Text fz="xs" fw={600} c="dimmed">
                    {getUiString('filters.config.tileHeaderTile')}
                </Text>
                <Text fz="xs" fw={600} c="dimmed">
                    {getUiString('filters.config.tileHeaderFilterOn')}
                </Text>
            </Box>
            {tabs.length > 1 ? (
                <Stack gap="sm">{tabs.map(renderTab)}</Stack>
            ) : (
                <Stack gap={0}>{renderRows(tileTargetList)}</Stack>
            )}
        </Stack>
    );
};

export default TileFilterConfiguration;
