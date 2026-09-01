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
    Box,
    Collapse,
    Flex,
    Group,
    Stack,
    Text,
    ActionIcon,
    Checkbox,
    Select,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import {
    IconAppWindow,
    IconChevronDown,
    IconChevronRight,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import MantineIcon from '../../../components/common/MantineIcon';
import { getChartIcon } from '../../../components/common/ResourceIcon/utils';
import { useUiStrings } from '../../../ee/providers/Embed/useUiStrings';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { FilterActions } from './constants';
import classes from './FilterConfiguration.module.css';
import { getFilterTileRelation, getValidSqlColumnReferences } from './utils';

type TileWithTargetFields = {
    targetType: 'field';
    key: string;
    label: string;
    checked: boolean;
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
    checked: boolean;
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
    checked: boolean;
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
    onToggleAll: (checked: boolean, tileUuids: string[]) => void;
};

const TileFilterConfiguration: FC<Props> = ({
    tiles,
    tabs,
    field,
    filterRule,
    availableTileFilters,
    popoverProps,
    onChange,
    onToggleAll,
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
                        checked: !!selectedField || !!invalidField,
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
                    checked: !!selectedField || !!invalidField,
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
            .map<DataAppTileTarget>((tile) => ({
                targetType: 'dataApp',
                key: tile.uuid,
                label: tile.properties.title,
                checked:
                    getFilterTileRelation(filterRule, tile.uuid).relation !==
                    'disabled',
                disabled: false,
                invalidField: undefined,
                tileUuid: tile.uuid,
                tileChartKind: undefined,
                sortedFilters: undefined,
                selectedField: undefined,
                tabUuid: tile.tabUuid ?? null,
                hasExactMatch: true,
            }));

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

    const filteredTileTargetList = (tabUUid: string) => {
        return tileTargetList.filter((v) => v.tabUuid === tabUUid);
    };

    const TabToggle = ({
        tileList,
        tabUuid,
        tabName,
        label,
        disabled,
    }: {
        tileList: TileTarget[];
        tabUuid: string;
        tabName: string;
        label: string;
        disabled?: boolean;
    }) => {
        const isAllChecked = tileList.every(({ checked }) => checked);
        const isIndeterminate =
            !isAllChecked && tileList.some(({ checked }) => checked);
        const tileUuids = tileList.map((tile) => tile.tileUuid);
        const shouldBeChecked = isAllChecked || isIndeterminate;
        const hasAnyExactMatch = tileList.some((tile) => tile.hasExactMatch);
        // Disable if no tiles OR if unchecked and no exact matches available
        const isDisabled = disabled || (!shouldBeChecked && !hasAnyExactMatch);
        const isCollapsed = collapsedTabs[tabUuid] ?? true;
        const selectedCount = tileList.filter((tile) => tile.checked).length;

        const getTooltipLabel = () => {
            if (disabled) return 'No tiles in this tab';
            if (!hasAnyExactMatch && !shouldBeChecked)
                return 'No tiles in this tab have an exact field match';
            if (shouldBeChecked)
                return `Uncheck to turn filter off for tab '${tabName}'`;
            return `Check to turn filter on for tab '${tabName}'`;
        };

        const toggleCollapse = () => {
            setCollapsedTabs((prev) => ({
                ...prev,
                [tabUuid]: !(prev[tabUuid] ?? true),
            }));
        };

        return (
            <Flex align="center" gap="xxs">
                <ActionIcon
                    size="xs"
                    onClick={toggleCollapse}
                    aria-label={getUiString(
                        isCollapsed
                            ? 'filters.config.expandTab'
                            : 'filters.config.collapseTab',
                    )}
                >
                    <MantineIcon
                        icon={isCollapsed ? IconChevronRight : IconChevronDown}
                    />
                </ActionIcon>
                <Tooltip label={getTooltipLabel()} position="top-start">
                    <Box>
                        <Checkbox
                            size="xs"
                            checked={isDisabled ? false : shouldBeChecked}
                            indeterminate={isDisabled ? false : isIndeterminate}
                            disabled={isDisabled}
                            label={
                                <Group gap="xs">
                                    <Text>{label}</Text>

                                    {isCollapsed && (
                                        <Text c="dimmed">
                                            ({selectedCount} of{' '}
                                            {tileList.length} selected)
                                        </Text>
                                    )}
                                </Group>
                            }
                            classNames={{
                                body: classes.checkboxBody,
                                label: classes.checkboxLabel,
                            }}
                            onChange={() => {
                                if (isIndeterminate) {
                                    onToggleAll(false, tileUuids);
                                } else if (isAllChecked) {
                                    onToggleAll(false, tileUuids);
                                } else {
                                    // When toggling ON, only include tiles with exact field match
                                    const exactMatchTileUuids = tileList
                                        .filter((tile) => tile.hasExactMatch)
                                        .map((tile) => tile.tileUuid);
                                    onToggleAll(true, exactMatchTileUuids);
                                }
                            }}
                        />
                    </Box>
                </Tooltip>
            </Flex>
        );
    };

    const StackSubComponent = ({
        tileList,
        isNested = false,
    }: {
        tileList: TileTarget[];
        isNested?: boolean;
    }) => {
        if (tileList.length === 0) {
            return (
                <Text
                    size="xs"
                    c="dimmed"
                    mt={isNested ? 'lg' : undefined}
                    ml={isNested ? 22 : undefined}
                >
                    {getUiString('filters.config.noTilesInTab')}
                </Text>
            );
        }

        return (
            <Stack
                gap="md"
                mt={isNested ? 'lg' : undefined}
                ml={isNested ? 22 : undefined}
            >
                {tileList.map((value) => {
                    // Only disable if no type-compatible fields AND not already checked
                    // (allow unchecking even when no compatible fields)
                    const isCheckboxDisabled = value.disabled && !value.checked;
                    const hasFiltersToShow =
                        value.sortedFilters && value.sortedFilters.length > 0;

                    return (
                        <Box key={value.key} data-testid="tile-filter-item">
                            <Tooltip
                                label={
                                    value.invalidField
                                        ? interpolateUiString(
                                              getUiString(
                                                  'filters.config.fieldNotAvailableInChart',
                                              ),
                                              { field: value.invalidField },
                                          )
                                        : getUiString(
                                              'filters.config.noFieldsMatchingType',
                                          )
                                }
                                position="top-start"
                                disabled={
                                    !isCheckboxDisabled &&
                                    value.invalidField === undefined
                                }
                            >
                                <Box>
                                    <Checkbox
                                        size="xs"
                                        fw={500}
                                        disabled={isCheckboxDisabled}
                                        label={
                                            <Flex align="center" gap="xxs">
                                                <MantineIcon
                                                    color="blue.6"
                                                    icon={
                                                        value.targetType ===
                                                        'dataApp'
                                                            ? IconAppWindow
                                                            : getChartIcon(
                                                                  value.tileChartKind,
                                                              )
                                                    }
                                                />
                                                <Text
                                                    fz="sm"
                                                    fw={500}
                                                    c={
                                                        value.invalidField
                                                            ? 'red'
                                                            : undefined
                                                    }
                                                >
                                                    {value.label}
                                                </Text>
                                            </Flex>
                                        }
                                        classNames={{
                                            body: classes.checkboxBody,
                                            label: classes.checkboxLabel,
                                        }}
                                        checked={value.checked}
                                        onChange={(event) => {
                                            onChange(
                                                event.currentTarget.checked
                                                    ? FilterActions.ADD
                                                    : FilterActions.REMOVE,
                                                value.tileUuid,
                                                event.currentTarget.checked &&
                                                    typeof value.selectedField ===
                                                        'string'
                                                    ? {
                                                          fieldId:
                                                              value.selectedField,
                                                          tableName:
                                                              'mock_table',
                                                          isSqlColumn: true,
                                                      }
                                                    : undefined,
                                            );
                                        }}
                                    />
                                </Box>
                            </Tooltip>

                            {hasFiltersToShow && (
                                <Box
                                    ml="xl"
                                    mt="sm"
                                    display={!value.checked ? 'none' : 'auto'}
                                >
                                    {value.targetType === 'field' ? (
                                        <FieldSelect
                                            size="xs"
                                            disabled={!value.checked}
                                            item={value.selectedField}
                                            items={value.sortedFilters ?? []}
                                            comboboxProps={{
                                                withinPortal: false,
                                                classNames: {
                                                    dropdown:
                                                        classes.inlineDropdown,
                                                },
                                            }}
                                            onDropdownOpen={
                                                popoverProps?.onOpen
                                            }
                                            onDropdownClose={
                                                popoverProps?.onClose
                                            }
                                            onChange={(newField) => {
                                                onChange(
                                                    FilterActions.ADD,
                                                    value.tileUuid,
                                                    newField
                                                        ? {
                                                              fieldId:
                                                                  getItemId(
                                                                      newField,
                                                                  ),
                                                              tableName:
                                                                  newField.table,
                                                          }
                                                        : undefined,
                                                );
                                            }}
                                        />
                                    ) : (
                                        <Select
                                            w="100%"
                                            size="xs"
                                            searchable
                                            withScrollArea={false}
                                            leftSection={undefined}
                                            allowDeselect={false}
                                            comboboxProps={{
                                                withinPortal: false,
                                                classNames: {
                                                    dropdown:
                                                        classes.inlineDropdown,
                                                },
                                            }}
                                            onDropdownOpen={
                                                popoverProps?.onOpen
                                            }
                                            onDropdownClose={
                                                popoverProps?.onClose
                                            }
                                            value={value.selectedField ?? null}
                                            data={value.sortedFilters}
                                            onChange={(newField) => {
                                                onChange(
                                                    FilterActions.ADD,
                                                    value.tileUuid,
                                                    newField
                                                        ? {
                                                              fieldId: newField,
                                                              tableName:
                                                                  'mock_table',
                                                              isSqlColumn: true,
                                                          }
                                                        : undefined,
                                                );
                                            }}
                                        />
                                    )}
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Stack>
        );
    };

    const isAllChecked = useMemo(
        () => tileTargetList.every(({ checked }) => checked),
        [tileTargetList],
    );
    const isIndeterminate = useMemo(
        () => !isAllChecked && tileTargetList.some(({ checked }) => checked),
        [tileTargetList, isAllChecked],
    );

    const tileList =
        tabs.length > 1 ? (
            tabs.map((tab) => {
                const tabTiles = filteredTileTargetList(tab.uuid);
                const isCollapsed = collapsedTabs[tab.uuid] ?? true;
                return (
                    <div key={tab.uuid}>
                        <TabToggle
                            tileList={tabTiles}
                            tabUuid={tab.uuid}
                            tabName={tab.name}
                            label={tab.name}
                            disabled={tabTiles.length === 0}
                        />

                        <Collapse in={!isCollapsed}>
                            <StackSubComponent
                                tileList={tabTiles}
                                isNested={true}
                            />
                        </Collapse>
                    </div>
                );
            })
        ) : (
            <StackSubComponent tileList={tileTargetList} isNested={false} />
        );

    return (
        <Stack gap="xl" className={classes.tileScrollArea}>
            <Checkbox
                size="xs"
                checked={isAllChecked}
                indeterminate={isIndeterminate}
                label={
                    <Text fz="sm" fw={500}>
                        Select all{' '}
                        {isIndeterminate
                            ? ` (${
                                  tileTargetList.filter((v) => v.checked).length
                              } tiles selected)`
                            : ''}
                    </Text>
                }
                classNames={{
                    body: classes.checkboxBody,
                    label: classes.checkboxLabel,
                }}
                onChange={() => {
                    const tileUuids = tileTargetList.map((v) => v.tileUuid);
                    if (isIndeterminate) {
                        onToggleAll(false, tileUuids);
                    } else if (isAllChecked) {
                        onToggleAll(false, tileUuids);
                    } else {
                        // When toggling ON, only include tiles with exact field match
                        const exactMatchTileUuids = tileTargetList
                            .filter((v) => v.hasExactMatch)
                            .map((v) => v.tileUuid);
                        onToggleAll(true, exactMatchTileUuids);
                    }
                }}
            />
            {tileList}
        </Stack>
    );
};

export default TileFilterConfiguration;
