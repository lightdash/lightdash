import {
    DimensionType,
    DateGranularity,
    getItemId,
    getTileControl,
    isDashboardChartTileType,
    isDimension,
    type DateZoomConfig,
    type DateZoomControl,
    type DateZoomTileTarget,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Checkbox,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine-8/core';
import { useMemo, useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';

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

// v1 offers the five day+ granularities; sub-day grains are intentionally omitted.
const CONTROL_GRANULARITIES: DateGranularity[] = [
    DateGranularity.DAY,
    DateGranularity.WEEK,
    DateGranularity.MONTH,
    DateGranularity.QUARTER,
    DateGranularity.YEAR,
];

enum ControlModalTab {
    SETTINGS = 'settings',
    TILES = 'tiles',
}

type DraftTarget = { fieldId: string; tableName: string };

const isDateField = (field: FilterableDimension): boolean =>
    field.type === DimensionType.DATE || field.type === DimensionType.TIMESTAMP;

export const DateZoomControlModal: FC<DateZoomControlModalProps> = ({
    control,
    config,
    opened,
    onSave,
    onDelete,
    onClose,
}) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
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

    // Saved-chart tiles that expose at least one DATE/TIMESTAMP field, with the
    // control they are currently attached to (for conflict display).
    const eligibleTiles = useMemo(() => {
        return (dashboardTiles ?? [])
            .filter(isDashboardChartTileType)
            .map((tile) => {
                const dateFields = (
                    filterableFieldsByTileUuid?.[tile.uuid] ?? []
                ).filter(
                    (field): field is FilterableDimension =>
                        isDimension(field) && isDateField(field),
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
                return { tile, dateFields, conflictControl, label };
            })
            .filter(({ dateFields }) => dateFields.length > 0);
    }, [dashboardTiles, filterableFieldsByTileUuid, config, draft.uuid]);

    const toggleTile = (
        tileUuid: string,
        dateFields: FilterableDimension[],
        checked: boolean,
    ) => {
        setDraftTargets((prev) => {
            if (!checked) {
                const { [tileUuid]: _removed, ...rest } = prev;
                return rest;
            }
            const firstField = dateFields[0];
            return {
                ...prev,
                [tileUuid]: {
                    fieldId: getItemId(firstField),
                    tableName: firstField.table,
                },
            };
        });
    };

    const setTileField = (
        tileUuid: string,
        dateFields: FilterableDimension[],
        fieldId: string,
    ) => {
        const field = dateFields.find((f) => getItemId(f) === fieldId);
        if (!field) return;
        setDraftTargets((prev) => ({
            ...prev,
            [tileUuid]: { fieldId, tableName: field.table },
        }));
    };

    const handleSelectAll = () => {
        setDraftTargets((prev) => {
            const next = { ...prev };
            eligibleTiles.forEach(({ tile, dateFields, conflictControl }) => {
                if (conflictControl || next[tile.uuid]) return;
                const firstField = dateFields[0];
                next[tile.uuid] = {
                    fieldId: getItemId(firstField),
                    tableName: firstField.table,
                };
            });
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

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Date zoom control"
            size="lg"
            onConfirm={handleSave}
            confirmLabel="Save changes"
            confirmDisabled={draft.name.trim().length === 0}
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

                        <Stack gap="xxs">
                            <Text fz="sm" fw={500}>
                                Default granularity
                            </Text>
                            <SegmentedControl
                                data={CONTROL_GRANULARITIES.map(
                                    (granularity) => ({
                                        label: granularity,
                                        value: granularity,
                                    }),
                                )}
                                value={String(draft.granularity)}
                                onChange={(value) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        granularity: value,
                                    }))
                                }
                            />
                        </Stack>

                        <Group justify="space-between">
                            <Text fz="sm" c="dimmed">
                                Targeting {targetCount}{' '}
                                {targetCount === 1 ? 'tile' : 'tiles'}
                            </Text>
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={() =>
                                    setSelectedTab(ControlModalTab.TILES)
                                }
                            >
                                Edit tiles
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
                                {eligibleTiles.map(
                                    ({
                                        tile,
                                        dateFields,
                                        conflictControl,
                                        label,
                                    }) => {
                                        const target = draftTargets[tile.uuid];
                                        const isChecked = !!target;
                                        return (
                                            <Group
                                                key={tile.uuid}
                                                justify="space-between"
                                                wrap="nowrap"
                                            >
                                                <Checkbox
                                                    label={label}
                                                    checked={isChecked}
                                                    disabled={!!conflictControl}
                                                    onChange={(e) =>
                                                        toggleTile(
                                                            tile.uuid,
                                                            dateFields,
                                                            e.currentTarget
                                                                .checked,
                                                        )
                                                    }
                                                />
                                                {conflictControl ? (
                                                    <Badge
                                                        color="gray"
                                                        variant="light"
                                                    >
                                                        in:{' '}
                                                        {conflictControl.name}
                                                    </Badge>
                                                ) : (
                                                    <Select
                                                        size="xs"
                                                        w={200}
                                                        disabled={!isChecked}
                                                        placeholder="Date field"
                                                        data={dateFields.map(
                                                            (field) => ({
                                                                value: getItemId(
                                                                    field,
                                                                ),
                                                                label: field.label,
                                                            }),
                                                        )}
                                                        value={
                                                            target?.fieldId ??
                                                            null
                                                        }
                                                        onChange={(value) =>
                                                            value &&
                                                            setTileField(
                                                                tile.uuid,
                                                                dateFields,
                                                                value,
                                                            )
                                                        }
                                                    />
                                                )}
                                            </Group>
                                        );
                                    },
                                )}
                            </>
                        )}
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineModal>
    );
};
