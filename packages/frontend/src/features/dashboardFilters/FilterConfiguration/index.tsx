import {
    assertUnreachable,
    createDashboardFilterRuleFromField,
    createDashboardFilterRuleFromSqlColumn,
    DimensionType,
    FilterType,
    getFilterTypeFromItem,
    getFilterTypeFromItemType,
    getItemId,
    isDashboardFieldTarget,
    isField,
    isFilterableField,
    matchFieldByType,
    matchFieldByTypeAndName,
    matchFieldExact,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type FilterableDimension,
    type ResultColumn,
} from '@lightdash/common';
import {
    Box,
    Button,
    Flex,
    Group,
    Select,
    Stack,
    Tabs,
    Text,
    Tooltip,
    type PopoverProps,
} from '@mantine/core';
import { IconRotate2, IconSql } from '@tabler/icons-react';
import { produce } from 'immer';
import { useCallback, useMemo, useState, type FC } from 'react';
import FieldSelect from '../../../components/common/FieldSelect';
import FieldIcon from '../../../components/common/Filters/FieldIcon';
import FieldLabel from '../../../components/common/Filters/FieldLabel';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import FilterSettings from './FilterSettings';
import TileFilterConfiguration from './TileFilterConfiguration';
import { DEFAULT_TAB, FilterActions, FilterTabs } from './constants';
import {
    getFilterRuleRevertableObject,
    hasFilterValueSet,
    hasSavedFilterValueChanged,
    isFilterEnabled,
} from './utils';

interface Props {
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    field?: FilterableDimension;
    fields?: FilterableDimension[];
    availableTileFilters: Record<string, FilterableDimension[]>;
    originalFilterRule?: DashboardFilterRule;
    defaultFilterRule?: DashboardFilterRule;
    popoverProps?: Omit<PopoverProps, 'children'>;
    isEditMode: boolean;
    isCreatingNew?: boolean;
    isTemporary?: boolean;
    onSave: (value: DashboardFilterRule) => void;
    activeTabUuid?: string;
}

const getDefaultField = (
    fields: FilterableDimension[],
    selectedField: FilterableDimension,
) => {
    return (
        fields.find(matchFieldExact(selectedField)) ??
        fields.find(matchFieldByTypeAndName(selectedField)) ??
        fields.find(matchFieldByType(selectedField))
    );
};

/**
 * Returns the set of tile UUIDs that are relevant for the field dropdown.
 *
 * This includes tiles from the active tab, plus any tiles from other tabs
 * that the user has explicitly targeted in the filter's tileTargets.
 */
const getRelevantTileUuids = (
    activeTabUuid: string | undefined,
    tiles: DashboardTile[],
    draftFilterRule: DashboardFilterRule | undefined,
): Set<string> | null => {
    if (!activeTabUuid) return null; // No tab filtering when no active tab

    const relevantTileUuids = new Set<string>();

    // Always include tiles from the active tab
    for (const tile of tiles) {
        if (tile.tabUuid === activeTabUuid) {
            relevantTileUuids.add(tile.uuid);
        }
    }

    // Also include tiles that are explicitly targeted in the filter rule
    if (draftFilterRule?.tileTargets) {
        for (const [tileUuid, target] of Object.entries(
            draftFilterRule.tileTargets,
        )) {
            if (target !== false && isDashboardFieldTarget(target)) {
                relevantTileUuids.add(tileUuid);
            }
        }
    }

    return relevantTileUuids;
};

const FilterConfiguration: FC<Props> = ({
    isEditMode,
    isCreatingNew = false,
    isTemporary = false,
    tiles,
    tabs,
    field,
    fields,
    availableTileFilters,
    originalFilterRule,
    defaultFilterRule,
    popoverProps,
    onSave,
    activeTabUuid,
}) => {
    const [selectedTabId, setSelectedTabId] = useState<FilterTabs>(DEFAULT_TAB);
    const [selectedField, setSelectedField] = useState<
        FilterableDimension | undefined
    >(field);

    const [draftFilterRule, setDraftFilterRule] = useState<
        DashboardFilterRule | undefined
    >(defaultFilterRule);

    const isFilterModified = useMemo(() => {
        if (!originalFilterRule || !draftFilterRule) return false;

        return hasSavedFilterValueChanged(originalFilterRule, draftFilterRule);
    }, [originalFilterRule, draftFilterRule]);

    // Compute which tile UUIDs are relevant for the field dropdown
    // (active tab tiles + explicitly targeted tiles from other tabs)
    const relevantTileUuids = useMemo(
        () => getRelevantTileUuids(activeTabUuid, tiles, draftFilterRule),
        [activeTabUuid, tiles, draftFilterRule],
    );

    // Filter fields to only show those from relevant tiles
    const displayedFields = useMemo(() => {
        if (!fields || !relevantTileUuids) return fields;

        const seenFieldIds = new Set<string>();
        const result: FilterableDimension[] = [];

        for (const [tileUuid, tileFields] of Object.entries(
            availableTileFilters,
        )) {
            if (!relevantTileUuids.has(tileUuid)) continue;
            for (const f of tileFields) {
                const fieldId = getItemId(f);
                if (!seenFieldIds.has(fieldId)) {
                    seenFieldIds.add(fieldId);
                    result.push(f);
                }
            }
        }

        return result;
    }, [fields, relevantTileUuids, availableTileFilters]);

    const handleChangeField = (newField: FilterableDimension) => {
        const isCreatingTemporary = isCreatingNew && !isEditMode;

        if (newField && isField(newField) && isFilterableField(newField)) {
            setDraftFilterRule(
                createDashboardFilterRuleFromField({
                    field: newField,
                    availableTileFilters,
                    isTemporary: isCreatingTemporary,
                }),
            );

            setSelectedField(newField);
        }
    };

    const handleRevert = useCallback(() => {
        if (!originalFilterRule) return;

        setDraftFilterRule((oldDraftFilterRule) => {
            return oldDraftFilterRule
                ? {
                      ...oldDraftFilterRule,
                      ...getFilterRuleRevertableObject(originalFilterRule),
                  }
                : undefined;
        });
    }, [originalFilterRule, setDraftFilterRule]);

    const handleChangeFilterRule = useCallback(
        (newFilterRule: DashboardFilterRule) => {
            setDraftFilterRule(() => {
                // When a disabled filter has a value set, it should be enabled by setting it to false
                const isNewFilterDisabled =
                    newFilterRule.disabled && !hasFilterValueSet(newFilterRule);

                // In view mode: if values cleared and not required, set to "any value"
                const shouldDisableInViewMode =
                    !isEditMode &&
                    !newFilterRule.required &&
                    !hasFilterValueSet(newFilterRule);

                return {
                    ...newFilterRule,
                    disabled: isNewFilterDisabled || shouldDisableInViewMode,
                };
            });
        },
        [setDraftFilterRule, isEditMode],
    );
    const sqlChartTilesMetadata = useDashboardContext(
        (c) => c.sqlChartTilesMetadata,
    );

    // Filter SQL columns to only show those from relevant tiles
    const columnsOptions = useMemo(() => {
        const filteredMetadata = relevantTileUuids
            ? Object.fromEntries(
                  Object.entries(sqlChartTilesMetadata).filter(([tileUuid]) =>
                      relevantTileUuids.has(tileUuid),
                  ),
              )
            : sqlChartTilesMetadata;

        const allColumns = Object.values(filteredMetadata).flatMap(
            (tileMetadata) => tileMetadata.columns,
        );
        const uniqueColumnsMap = new Map(
            allColumns.map((column) => [column.reference, column]),
        );
        return Array.from(uniqueColumnsMap.values());
    }, [sqlChartTilesMetadata, relevantTileUuids]);

    const handleChangeColumn = useCallback(
        (newColumn: ResultColumn) => {
            const isCreatingTemporary = isCreatingNew && !isEditMode;

            const allTileColumns = Object.fromEntries(
                Object.entries(sqlChartTilesMetadata).map(
                    ([tileUuid, tileMetadata]) => [
                        tileUuid,
                        tileMetadata.columns,
                    ],
                ),
            );

            setDraftFilterRule(
                createDashboardFilterRuleFromSqlColumn({
                    column: newColumn,
                    availableTileColumns: allTileColumns,
                    isTemporary: isCreatingTemporary,
                }),
            );
        },
        [isCreatingNew, isEditMode, sqlChartTilesMetadata],
    );

    const filterType: FilterType = useMemo(() => {
        if (selectedField) {
            return getFilterTypeFromItem(selectedField);
        }

        if (draftFilterRule?.target.fieldId) {
            const selectedColumn = columnsOptions.find(
                (column) => column.reference === draftFilterRule.target.fieldId,
            );
            return getFilterTypeFromItemType(
                selectedColumn?.type ??
                    draftFilterRule.target.fallbackType ??
                    DimensionType.STRING,
            );
        }

        return FilterType.STRING;
    }, [
        columnsOptions,
        draftFilterRule?.target.fallbackType,
        draftFilterRule?.target.fieldId,
        selectedField,
    ]);

    const handleChangeTileConfiguration = useCallback(
        (
            action: FilterActions,
            tileUuid: string,
            newTarget?: DashboardFieldTarget,
        ) => {
            const changedFilterRule = produce(draftFilterRule, (draftState) => {
                if (!draftState) return;

                draftState.tileTargets = draftState.tileTargets ?? {};

                switch (action) {
                    case FilterActions.ADD: {
                        let target: DashboardFieldTarget | undefined =
                            newTarget;

                        // Find fallback target
                        if (!target) {
                            const defaultColumn: ResultColumn | undefined =
                                sqlChartTilesMetadata[tileUuid]?.columns[0];
                            const defaultField = selectedField
                                ? getDefaultField(
                                      availableTileFilters[tileUuid] ?? [],
                                      selectedField,
                                  )
                                : undefined;

                            if (defaultColumn) {
                                // Set SQL chart fallback column
                                target = {
                                    fieldId: defaultColumn.reference,
                                    tableName: 'mock_table',
                                    isSqlColumn: true,
                                    fallbackType: defaultColumn.type,
                                };
                            } else if (defaultField) {
                                // Set default field
                                target = {
                                    fieldId: getItemId(defaultField),
                                    tableName: defaultField.table,
                                };
                            }
                        }

                        if (!target) return draftState;

                        draftState.tileTargets[tileUuid] = target;
                        return draftState;
                    }
                    case FilterActions.REMOVE:
                        draftState.tileTargets[tileUuid] = false;
                        return draftState;

                    default:
                        return assertUnreachable(
                            action,
                            'Invalid FilterActions',
                        );
                }
            });

            setDraftFilterRule(changedFilterRule);
        },
        [
            selectedField,
            availableTileFilters,
            setDraftFilterRule,
            draftFilterRule,
            sqlChartTilesMetadata,
        ],
    );

    const handleToggleAll = useCallback(
        (checked: boolean, targetTileUuids: string[]) => {
            if (!checked) {
                const newFilterRule = produce(draftFilterRule, (draftState) => {
                    if (!draftState || !selectedField) return;

                    Object.entries(availableTileFilters).forEach(
                        ([tileUuid]) => {
                            if (
                                !draftState.tileTargets ||
                                !targetTileUuids.includes(tileUuid)
                            )
                                return;
                            draftState.tileTargets[tileUuid] = false;
                        },
                    );
                    return draftState;
                });

                setDraftFilterRule(newFilterRule);
            } else {
                const newFilterRule = produce(draftFilterRule, (draftState) => {
                    if (!draftState || !selectedField) return;
                    targetTileUuids.forEach((tileUuid) => {
                        if (!draftState.tileTargets) return;
                        draftState.tileTargets[tileUuid] = {
                            fieldId: getItemId(selectedField),
                            tableName: selectedField.table,
                        };
                    });
                    return draftState;
                });

                setDraftFilterRule(newFilterRule);
            }
        },
        [
            selectedField,
            availableTileFilters,
            setDraftFilterRule,
            draftFilterRule,
        ],
    );

    const isApplyDisabled = !isFilterEnabled(
        draftFilterRule,
        isEditMode,
        isCreatingNew,
    );

    return (
        <Stack>
            <Tabs
                value={selectedTabId}
                onTabChange={(tabId: FilterTabs) => setSelectedTabId(tabId)}
            >
                {isCreatingNew || isEditMode || isTemporary ? (
                    <Tabs.List mb="md">
                        <Tooltip
                            label="Select the value you want to filter your dimension by"
                            position="top-start"
                        >
                            <Tabs.Tab value={FilterTabs.SETTINGS}>
                                Filter Settings
                            </Tabs.Tab>
                        </Tooltip>

                        <Tooltip
                            label={
                                tabs.length > 1
                                    ? 'Select which tabs and chart tiles this filter applies to'
                                    : 'Select tiles to apply filter to and which field to filter by'
                            }
                            position="top-start"
                        >
                            <Tabs.Tab
                                value={FilterTabs.TILES}
                                disabled={!draftFilterRule}
                            >
                                {tabs.length > 1
                                    ? 'Tabs & chart tiles'
                                    : 'Chart tiles'}
                            </Tabs.Tab>
                        </Tooltip>
                    </Tabs.List>
                ) : null}

                <Tabs.Panel value={FilterTabs.SETTINGS} miw={350} maw={520}>
                    <Stack spacing="sm">
                        {isCreatingNew ? (
                            !!displayedFields && displayedFields.length > 0 ? (
                                <FieldSelect
                                    data-testid="FilterConfiguration/FieldSelect"
                                    size="xs"
                                    focusOnRender={true}
                                    label={
                                        <Text>
                                            Select a dimension to filter{' '}
                                            <Text color="red" span>
                                                *
                                            </Text>{' '}
                                        </Text>
                                    }
                                    withinPortal={popoverProps?.withinPortal}
                                    onDropdownOpen={popoverProps?.onOpen}
                                    onDropdownClose={popoverProps?.onClose}
                                    hasGrouping
                                    item={selectedField}
                                    items={displayedFields}
                                    onChange={(newField) => {
                                        if (!newField) return;

                                        handleChangeField(newField);
                                    }}
                                />
                            ) : (
                                <Select
                                    size="xs"
                                    label={
                                        <Text>
                                            Select a column to filter{' '}
                                            <Text color="red" span>
                                                *
                                            </Text>{' '}
                                        </Text>
                                    }
                                    placeholder="Search column..."
                                    value={draftFilterRule?.target.fieldId}
                                    data={columnsOptions.map(
                                        ({ reference }) => reference,
                                    )}
                                    onChange={(newValue) => {
                                        if (!newValue) return;
                                        const selectedColumn =
                                            columnsOptions.find(
                                                (column) =>
                                                    column.reference ===
                                                    newValue,
                                            );
                                        if (!selectedColumn) return;
                                        handleChangeColumn(selectedColumn);
                                    }}
                                />
                            )
                        ) : selectedField ? (
                            <Group spacing="xs">
                                <FieldIcon item={selectedField} />
                                {originalFilterRule?.label && !isEditMode ? (
                                    <Text span fw={500}>
                                        {originalFilterRule.label}
                                    </Text>
                                ) : (
                                    <FieldLabel item={selectedField} />
                                )}
                            </Group>
                        ) : (
                            <Group spacing="xs">
                                <MantineIcon
                                    icon={IconSql}
                                    size={'lg'}
                                    color={'#0E5A8A'}
                                />
                                {originalFilterRule?.label && !isEditMode ? (
                                    <Text span fw={500}>
                                        {originalFilterRule.label}
                                    </Text>
                                ) : (
                                    <Text span fw={500}>
                                        {draftFilterRule?.target.fieldId ||
                                            'SQL column'}
                                    </Text>
                                )}
                            </Group>
                        )}

                        {draftFilterRule && (
                            <FilterSettings
                                isEditMode={isEditMode}
                                isCreatingNew={isCreatingNew}
                                filterType={filterType}
                                field={selectedField}
                                filterRule={draftFilterRule}
                                onChangeFilterRule={handleChangeFilterRule}
                                popoverProps={popoverProps}
                            />
                        )}
                    </Stack>
                </Tabs.Panel>

                {draftFilterRule && (
                    <Tabs.Panel
                        value={FilterTabs.TILES}
                        w={500}
                        data-testid="DashboardFilterConfiguration/ChartTiles"
                    >
                        <TileFilterConfiguration
                            field={selectedField}
                            tabs={tabs}
                            filterRule={draftFilterRule}
                            popoverProps={popoverProps}
                            tiles={tiles}
                            availableTileFilters={availableTileFilters}
                            onChange={handleChangeTileConfiguration}
                            onToggleAll={handleToggleAll}
                        />
                    </Tabs.Panel>
                )}
            </Tabs>

            <Flex gap="sm">
                <Box sx={{ flexGrow: 1 }} />

                {!isTemporary &&
                    isFilterModified &&
                    selectedTabId === FilterTabs.SETTINGS &&
                    !isEditMode && (
                        <Tooltip
                            label="Reset to original value"
                            position="left"
                        >
                            <Button
                                aria-label="Reset filter to original value"
                                size="xs"
                                variant="default"
                                color="gray"
                                onClick={handleRevert}
                            >
                                <MantineIcon icon={IconRotate2} />
                            </Button>
                        </Tooltip>
                    )}

                <Tooltip
                    label="Filter field and value required"
                    disabled={!isApplyDisabled}
                >
                    <Box>
                        <Button
                            size="xs"
                            variant="filled"
                            disabled={isApplyDisabled}
                            onClick={() => {
                                setSelectedTabId(FilterTabs.SETTINGS);

                                if (!!draftFilterRule) onSave(draftFilterRule);
                            }}
                        >
                            Apply
                        </Button>
                    </Box>
                </Tooltip>
            </Flex>
        </Stack>
    );
};

export default FilterConfiguration;
