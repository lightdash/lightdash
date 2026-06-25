import {
    getTileControl,
    isDashboardChartTileType,
    isStandardDateGranularity,
    type ChartZoomableField,
    type DateZoomConfig,
    type DateZoomControl,
    type DateZoomTileTarget,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Checkbox,
    Group,
    Select,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useMemo, useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { getGranularityLabel } from '../utils';

// The control modal owns a draft of one control plus that control's slice of
// `tileTargets`, and returns the full updated config so the caller just stores it.
export type DateZoomControlModalProps = {
    control: DateZoomControl;
    config: DateZoomConfig;
    opened: boolean;
    onSave: (nextConfig: DateZoomConfig) => void;
    onDelete: (controlUuid: string) => void;
    onClose: () => void;
};

enum ControlModalTab {
    SETTINGS = 'settings',
    TILES = 'tiles',
}

type DraftTarget = { fieldId: string; tableName: string };

export const DateZoomControlModal: FC<DateZoomControlModalProps> = ({
    control,
    config,
    opened,
    onSave,
    onDelete,
    onClose,
}) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const chartZoomableFieldsByTileUuid = useDashboardContext(
        (c) => c.chartZoomableFieldsByTileUuid,
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

    const [selectedTab, setSelectedTab] = useState<ControlModalTab>(
        ControlModalTab.SETTINGS,
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
                label: String(granularity),
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

    // Chart tiles that expose at least one zoomable date field (a date/timestamp
    // dimension the chart actually queries), with the control they are currently
    // attached to (for conflict display).
    const eligibleTiles = useMemo(() => {
        return (dashboardTiles ?? [])
            .filter(isDashboardChartTileType)
            .map((tile) => {
                const zoomableFields =
                    chartZoomableFieldsByTileUuid[tile.uuid] ?? [];
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
                    conflictControl,
                    label,
                };
            })
            .filter(({ zoomableFields }) => zoomableFields.length > 0);
    }, [dashboardTiles, chartZoomableFieldsByTileUuid, config, draft.uuid]);

    // Group eligible tiles by tab so editors can tell apart charts that live on
    // different tabs. Tab headers only appear when the dashboard has tabs and
    // more than one group ends up with charts.
    const tileGroups = useMemo(() => {
        const byTab = new Map<string | undefined, typeof eligibleTiles>();
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
            const firstField = zoomableFields[0];
            return {
                ...prev,
                [tileUuid]: {
                    fieldId: firstField.fieldId,
                    tableName: firstField.tableName,
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

    const handleSelectAll = () => {
        setDraftTargets((prev) => {
            const next = { ...prev };
            eligibleTiles.forEach(
                ({ tile, zoomableFields, conflictControl }) => {
                    if (conflictControl || next[tile.uuid]) return;
                    const firstField = zoomableFields[0];
                    next[tile.uuid] = {
                        fieldId: firstField.fieldId,
                        tableName: firstField.tableName,
                    };
                },
            );
            return next;
        });
    };

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
        conflictControl,
        label,
    }: (typeof eligibleTiles)[number]) => {
        const target = draftTargets[tile.uuid];
        const isChecked = !!target;
        return (
            <Group key={tile.uuid} justify="space-between" wrap="nowrap">
                <Checkbox
                    label={label}
                    checked={isChecked}
                    disabled={!!conflictControl}
                    onChange={(e) =>
                        toggleTile(
                            tile.uuid,
                            zoomableFields,
                            e.currentTarget.checked,
                        )
                    }
                />
                {conflictControl ? (
                    <Badge color="gray" variant="light">
                        in: {conflictControl.name}
                    </Badge>
                ) : (
                    <Select
                        size="xs"
                        w={200}
                        disabled={!isChecked}
                        placeholder="Date field"
                        data={zoomableFields.map((field) => ({
                            value: field.fieldId,
                            label: field.label,
                        }))}
                        value={target?.fieldId ?? null}
                        onChange={(value) =>
                            value &&
                            setTileField(tile.uuid, zoomableFields, value)
                        }
                    />
                )}
            </Group>
        );
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Date zoom control"
            size="lg"
            onConfirm={handleSave}
            confirmLabel="Save changes"
            confirmDisabled={
                draft.name.trim().length === 0 || targetCount === 0
            }
            leftActions={
                <Button
                    variant="subtle"
                    color="red"
                    onClick={() => onDelete(draft.uuid)}
                >
                    Delete
                </Button>
            }
        >
            <Tabs
                value={selectedTab}
                onChange={(value) =>
                    setSelectedTab(
                        (value as ControlModalTab) ?? ControlModalTab.SETTINGS,
                    )
                }
            >
                <Tabs.List mb="md">
                    <Tabs.Tab value={ControlModalTab.SETTINGS}>
                        Zoom settings
                    </Tabs.Tab>
                    <Tabs.Tab value={ControlModalTab.TILES}>
                        Chart tiles
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value={ControlModalTab.SETTINGS}>
                    <Stack gap="md">
                        <TextInput
                            label="Control name"
                            placeholder="e.g. Revenue zoom"
                            value={draft.name}
                            onChange={(e) => {
                                const name = e.currentTarget.value;
                                setDraft((prev) => ({ ...prev, name }));
                            }}
                        />

                        <Select
                            label="Default granularity"
                            data={granularityData}
                            value={String(draft.granularity)}
                            allowDeselect={false}
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
                                fz="sm"
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
                                onClick={() =>
                                    setSelectedTab(ControlModalTab.TILES)
                                }
                            >
                                Edit charts
                            </Button>
                        </Group>
                    </Stack>
                </Tabs.Panel>

                <Tabs.Panel value={ControlModalTab.TILES}>
                    <Stack gap="xs">
                        {eligibleTiles.length === 0 ? (
                            <Text fz="sm" c="dimmed">
                                No chart tiles with a date dimension to zoom.
                            </Text>
                        ) : (
                            <>
                                <Group justify="flex-end">
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        onClick={handleSelectAll}
                                    >
                                        Select all
                                    </Button>
                                </Group>
                                {tileGroups.map((group) => (
                                    <Stack
                                        key={group.tabUuid ?? 'untabbed'}
                                        gap="xs"
                                    >
                                        {showTabHeaders && group.name && (
                                            <Text
                                                fz="xs"
                                                fw={600}
                                                c="dimmed"
                                                tt="uppercase"
                                            >
                                                {group.name}
                                            </Text>
                                        )}
                                        {group.tiles.map(renderTileRow)}
                                    </Stack>
                                ))}
                            </>
                        )}
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineModal>
    );
};
