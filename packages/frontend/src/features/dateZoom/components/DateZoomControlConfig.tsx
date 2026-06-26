import {
    getTileControl,
    hasReservedParameterReference,
    isDashboardChartTileType,
    isStandardDateGranularity,
    type ChartZoomableField,
    type DateZoomConfig,
    type DateZoomControl,
    type DateZoomTileTarget,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Checkbox,
    Code,
    Collapse,
    Flex,
    Group,
    Select,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconChevronRight,
    IconClock,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { getChartIcon } from '../../../components/common/ResourceIcon/utils';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { getGranularityLabel } from '../utils';
import styles from './DateZoom.module.css';

// The control config owns a draft of one control plus that control's slice of
// `tileTargets`, and returns the full updated config so the caller just stores it.
export type DateZoomControlConfigProps = {
    control: DateZoomControl;
    config: DateZoomConfig;
    onSave: (nextConfig: DateZoomConfig) => void;
    // Inner Select dropdowns portal outside this popover, so the caller tracks
    // their open state to avoid closing the popover when one is clicked.
    popoverProps: {
        onDropdownOpen: () => void;
        onDropdownClose: () => void;
    };
};

enum ControlTab {
    SETTINGS = 'settings',
    TILES = 'tiles',
}

// Param-only tiles carry a null field: there is nothing to re-grain, only the
// control's grain feeds the reserved `date_zoom` parameter.
type DraftTarget = { fieldId: string | null; tableName: string | null };

export const DateZoomControlConfig: FC<DateZoomControlConfigProps> = ({
    control,
    config,
    onSave,
    popoverProps,
}) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const chartZoomableFieldsByTileUuid = useDashboardContext(
        (c) => c.chartZoomableFieldsByTileUuid,
    );
    // Param-only tiles (custom SQL referencing `${ld.parameters.date_zoom}` but
    // no re-grainable date field) are also affected by a control's grain.
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    // Custom granularities discovered across the dashboard's tiles (same source
    // as the global picker). A control can zoom to these when available.
    const availableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    );
    // The dashboard's enabled granularities (set in the default picker); every
    // control offers only these.
    const dateZoomGranularities = useDashboardContext(
        (c) => c.dateZoomGranularities,
    );

    const [selectedTab, setSelectedTab] = useState<ControlTab>(
        ControlTab.SETTINGS,
    );
    const [collapsedTabs, setCollapsedTabs] = useState<Record<string, boolean>>(
        {},
    );

    // Seeded once on mount; the parent remounts with `key={control.uuid}` when
    // switching controls, so we never sync props into state via useEffect.
    const [draft, setDraft] = useState<DateZoomControl>(() => control);
    const [draftTargets, setDraftTargets] = useState<
        Record<string, DraftTarget>
    >(() =>
        Object.fromEntries(
            Object.entries(config.tileTargets)
                .filter(([, target]) => target.controlUuid === control.uuid)
                .map(([tileUuid, target]) => [
                    tileUuid,
                    { fieldId: target.fieldId, tableName: target.tableName },
                ]),
        ),
    );

    const targetCount = useMemo(
        () => Object.keys(draftTargets).length,
        [draftTargets],
    );

    // Only the dashboard's enabled granularities, grouped standard vs custom.
    const granularityData = useMemo(() => {
        const standardItems = dateZoomGranularities
            .filter(isStandardDateGranularity)
            .map((granularity) => ({
                value: String(granularity),
                label: getGranularityLabel(
                    granularity,
                    availableCustomGranularities,
                ),
            }));
        const customItems = dateZoomGranularities
            .filter((g) => !isStandardDateGranularity(g))
            .sort((a, b) =>
                getGranularityLabel(
                    a,
                    availableCustomGranularities,
                ).localeCompare(
                    getGranularityLabel(b, availableCustomGranularities),
                ),
            )
            .map((key) => ({
                value: key,
                label: getGranularityLabel(key, availableCustomGranularities),
            }));
        if (customItems.length === 0) return standardItems;
        if (standardItems.length === 0) return customItems;
        return [
            { group: 'Standard', items: standardItems },
            { group: 'Custom', items: customItems },
        ];
    }, [dateZoomGranularities, availableCustomGranularities]);

    // Chart tiles a control can touch: those that expose a zoomable date field
    // (a date/timestamp dimension the chart queries) OR reference the reserved
    // `date_zoom` parameter in custom SQL (param-only, no field to re-grain).
    // Each carries the control it is currently attached to (for conflict display).
    const eligibleTiles = useMemo(() => {
        return (dashboardTiles ?? [])
            .filter(isDashboardChartTileType)
            .map((tile) => {
                const zoomableFields =
                    chartZoomableFieldsByTileUuid[tile.uuid] ?? [];
                const isParamOnly =
                    zoomableFields.length === 0 &&
                    hasReservedParameterReference(
                        tileParameterReferences?.[tile.uuid] ?? [],
                    );
                const otherControl = getTileControl(config, tile.uuid);
                const conflictControl =
                    otherControl && otherControl.uuid !== draft.uuid
                        ? otherControl
                        : undefined;
                const label =
                    (tile.properties.title?.length
                        ? tile.properties.title
                        : tile.properties.chartName) || 'Untitled chart';
                return {
                    tile,
                    tabUuid: tile.tabUuid ?? undefined,
                    zoomableFields,
                    isParamOnly,
                    conflictControl,
                    label,
                };
            })
            .filter(
                ({ zoomableFields, isParamOnly }) =>
                    zoomableFields.length > 0 || isParamOnly,
            );
    }, [
        dashboardTiles,
        chartZoomableFieldsByTileUuid,
        tileParameterReferences,
        config,
        draft.uuid,
    ]);

    type EligibleTile = (typeof eligibleTiles)[number];

    // Group eligible tiles by tab so editors can tell apart charts that live on
    // different tabs. Tab headers only appear when the dashboard has tabs and
    // more than one group ends up with charts.
    const tileGroups = useMemo(() => {
        const byTab = new Map<string | undefined, EligibleTile[]>();
        eligibleTiles.forEach((entry) => {
            const group = byTab.get(entry.tabUuid) ?? [];
            group.push(entry);
            byTab.set(entry.tabUuid, group);
        });
        const groups = dashboardTabs
            .map((tab) => ({
                tabUuid: tab.uuid as string | undefined,
                name: tab.name,
                tiles: byTab.get(tab.uuid) ?? [],
            }))
            .filter((group) => group.tiles.length > 0);
        const untabbed = byTab.get(undefined) ?? [];
        if (untabbed.length > 0) {
            groups.unshift({ tabUuid: undefined, name: '', tiles: untabbed });
        }
        return groups;
    }, [eligibleTiles, dashboardTabs]);

    const showTabHeaders = tileGroups.length > 1;

    // Tiles a control can actually claim (conflict tiles belong to another).
    const selectableTiles = useMemo(
        () => eligibleTiles.filter(({ conflictControl }) => !conflictControl),
        [eligibleTiles],
    );

    const isSelected = (tile: EligibleTile['tile']) =>
        !!draftTargets[tile.uuid];

    const toggleTile = (
        tileUuid: string,
        zoomableFields: ChartZoomableField[],
        checked: boolean,
    ) => {
        setDraftTargets((prev) => {
            if (!checked) {
                const { [tileUuid]: _removed, ...rest } = prev;
                return rest;
            }
            // Param-only tiles have no field to pick; carry a null field.
            const firstField = zoomableFields[0];
            return {
                ...prev,
                [tileUuid]: {
                    fieldId: firstField?.fieldId ?? null,
                    tableName: firstField?.tableName ?? null,
                },
            };
        });
    };

    const setTileField = (
        tileUuid: string,
        zoomableFields: ChartZoomableField[],
        fieldId: string,
    ) => {
        const field = zoomableFields.find((f) => f.fieldId === fieldId);
        if (!field) return;
        setDraftTargets((prev) => ({
            ...prev,
            [tileUuid]: { fieldId, tableName: field.tableName },
        }));
    };

    // Select/deselect a group of tiles at once (used by "Select all" and the
    // per-tab header checkbox). When already all selected, clears them.
    const toggleMany = (tiles: EligibleTile[], allSelected: boolean) => {
        setDraftTargets((prev) => {
            const next = { ...prev };
            tiles.forEach(({ tile, zoomableFields }) => {
                if (allSelected) {
                    delete next[tile.uuid];
                } else if (!next[tile.uuid]) {
                    const firstField = zoomableFields[0];
                    next[tile.uuid] = {
                        fieldId: firstField?.fieldId ?? null,
                        tableName: firstField?.tableName ?? null,
                    };
                }
            });
            return next;
        });
    };

    const allSelected =
        selectableTiles.length > 0 &&
        selectableTiles.every(({ tile }) => isSelected(tile));
    const someSelected = selectableTiles.some(({ tile }) => isSelected(tile));
    const isIndeterminate = someSelected && !allSelected;

    const handleSave = () => {
        // Upsert this control.
        const controls = config.controls.some((c) => c.uuid === draft.uuid)
            ? config.controls.map((c) => (c.uuid === draft.uuid ? draft : c))
            : [...config.controls, draft];

        // Rewrite only THIS control's targets; leave other controls untouched.
        const tileTargets: Record<string, DateZoomTileTarget> =
            Object.fromEntries(
                Object.entries(config.tileTargets).filter(
                    ([, target]) => target.controlUuid !== draft.uuid,
                ),
            );
        Object.entries(draftTargets).forEach(
            ([tileUuid, { fieldId, tableName }]) => {
                tileTargets[tileUuid] = {
                    controlUuid: draft.uuid,
                    fieldId,
                    tableName,
                };
            },
        );

        onSave({ controls, tileTargets });
    };

    const renderTileRow = ({
        tile,
        zoomableFields,
        isParamOnly,
        conflictControl,
        label,
    }: EligibleTile) => {
        const target = draftTargets[tile.uuid];
        const isChecked = !!target;
        return (
            <Box key={tile.uuid}>
                <Checkbox
                    size="xs"
                    fw={500}
                    checked={isChecked}
                    disabled={!!conflictControl}
                    classNames={{ input: styles.checkboxInput }}
                    label={
                        <Flex align="center" gap="xxs">
                            <MantineIcon
                                color="blue.6"
                                icon={getChartIcon(
                                    tile.properties.lastVersionChartKind ??
                                        undefined,
                                )}
                            />
                            <Text fz="xs" fw={500}>
                                {label}
                            </Text>
                        </Flex>
                    }
                    onChange={(e) =>
                        toggleTile(
                            tile.uuid,
                            zoomableFields,
                            e.currentTarget.checked,
                        )
                    }
                />
                {conflictControl ? (
                    <Box ml="xl" mt="xxs">
                        <Badge size="sm" color="gray" variant="light">
                            In {conflictControl.name}
                        </Badge>
                    </Box>
                ) : isChecked && isParamOnly ? (
                    <Box ml="xl" mt="xxs">
                        <Text fz="xs" c="dimmed">
                            Follows the selected granularity via{' '}
                            <Code fz="xs">{'${ld.parameters.date_zoom}'}</Code>
                        </Text>
                    </Box>
                ) : isChecked ? (
                    <Box ml="xl" mt="sm">
                        <Select
                            w="100%"
                            size="xs"
                            allowDeselect={false}
                            placeholder="Date field"
                            leftSection={<MantineIcon icon={IconClock} />}
                            data={zoomableFields.map((field) => ({
                                value: field.fieldId,
                                label: field.label,
                            }))}
                            value={target?.fieldId ?? null}
                            comboboxProps={{ withinPortal: true }}
                            onDropdownOpen={popoverProps.onDropdownOpen}
                            onDropdownClose={popoverProps.onDropdownClose}
                            onChange={(value) =>
                                value &&
                                setTileField(tile.uuid, zoomableFields, value)
                            }
                        />
                    </Box>
                ) : null}
            </Box>
        );
    };

    const renderTileGroup = (group: (typeof tileGroups)[number]) => {
        if (!showTabHeaders || !group.name) {
            return (
                <Stack key={group.tabUuid ?? 'untabbed'} gap="md">
                    {group.tiles.map(renderTileRow)}
                </Stack>
            );
        }

        const tabKey = group.tabUuid ?? 'untabbed';
        // Default to collapsed, matching the dashboard filters' tab sections.
        const isCollapsed = collapsedTabs[tabKey] ?? true;
        const groupSelectable = group.tiles.filter(
            ({ conflictControl }) => !conflictControl,
        );
        const groupSelectedCount = group.tiles.filter(({ tile }) =>
            isSelected(tile),
        ).length;
        const groupAllSelected =
            groupSelectable.length > 0 &&
            groupSelectable.every(({ tile }) => isSelected(tile));
        const groupIndeterminate =
            !groupAllSelected &&
            groupSelectable.some(({ tile }) => isSelected(tile));

        return (
            <Box key={tabKey}>
                <Flex align="center" gap="xxs">
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        aria-label={isCollapsed ? 'Expand tab' : 'Collapse tab'}
                        onClick={() =>
                            setCollapsedTabs((prev) => ({
                                ...prev,
                                [tabKey]: !(prev[tabKey] ?? true),
                            }))
                        }
                    >
                        <MantineIcon
                            icon={
                                isCollapsed ? IconChevronRight : IconChevronDown
                            }
                        />
                    </ActionIcon>
                    <Checkbox
                        size="xs"
                        fw={500}
                        checked={groupAllSelected}
                        indeterminate={groupIndeterminate}
                        disabled={groupSelectable.length === 0}
                        classNames={{ input: styles.checkboxInput }}
                        label={
                            <Group gap="xs">
                                <Text fz="xs" fw={500}>
                                    {group.name}
                                </Text>
                                {isCollapsed && (
                                    <Text fz="xs" c="dimmed">
                                        ({groupSelectedCount} of{' '}
                                        {group.tiles.length} selected)
                                    </Text>
                                )}
                            </Group>
                        }
                        onChange={() =>
                            toggleMany(groupSelectable, groupAllSelected)
                        }
                    />
                </Flex>
                <Collapse in={!isCollapsed}>
                    <Stack gap="md" mt="sm" ml={22}>
                        {group.tiles.map(renderTileRow)}
                    </Stack>
                </Collapse>
            </Box>
        );
    };

    return (
        <Stack gap="md">
            <Tabs
                value={selectedTab}
                onChange={(value) =>
                    setSelectedTab((value as ControlTab) ?? ControlTab.SETTINGS)
                }
            >
                <Tabs.List mb="md">
                    <Tabs.Tab value={ControlTab.SETTINGS}>Settings</Tabs.Tab>
                    <Tabs.Tab value={ControlTab.TILES}>Chart tiles</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value={ControlTab.SETTINGS} w={360}>
                    <Stack gap="md">
                        <TextInput
                            size="xs"
                            label="Control name"
                            placeholder="e.g. Revenue zoom"
                            value={draft.name}
                            onChange={(e) => {
                                const name = e.currentTarget.value;
                                setDraft((prev) => ({ ...prev, name }));
                            }}
                        />

                        <Select
                            size="xs"
                            label="Default granularity"
                            data={granularityData}
                            value={String(draft.granularity)}
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                            onDropdownOpen={popoverProps.onDropdownOpen}
                            onDropdownClose={popoverProps.onDropdownClose}
                            onChange={(value) =>
                                value &&
                                setDraft((prev) => ({
                                    ...prev,
                                    granularity: value,
                                }))
                            }
                        />

                        <Group justify="space-between">
                            <Text
                                fz="xs"
                                c={targetCount === 0 ? 'red' : 'dimmed'}
                            >
                                {targetCount === 0
                                    ? 'Select at least one chart'
                                    : `Targeting ${targetCount} ${
                                          targetCount === 1 ? 'chart' : 'charts'
                                      }`}
                            </Text>
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={() => setSelectedTab(ControlTab.TILES)}
                            >
                                Edit charts
                            </Button>
                        </Group>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value={ControlTab.TILES} w={440}>
                    {eligibleTiles.length === 0 ? (
                        <Text fz="xs" c="dimmed">
                            No chart tiles with a date dimension to zoom.
                        </Text>
                    ) : (
                        <Stack gap="xl" className={styles.tileScrollArea}>
                            <Checkbox
                                size="xs"
                                fw={500}
                                checked={allSelected}
                                indeterminate={isIndeterminate}
                                disabled={selectableTiles.length === 0}
                                classNames={{ input: styles.checkboxInput }}
                                label="Select all"
                                onChange={() =>
                                    toggleMany(selectableTiles, allSelected)
                                }
                            />
                            {tileGroups.map(renderTileGroup)}
                        </Stack>
                    )}
                </Tabs.Panel>
            </Tabs>

            <Group justify="flex-end">
                <Button
                    size="xs"
                    disabled={
                        draft.name.trim().length === 0 || targetCount === 0
                    }
                    onClick={handleSave}
                >
                    Save changes
                </Button>
            </Group>
        </Stack>
    );
};
