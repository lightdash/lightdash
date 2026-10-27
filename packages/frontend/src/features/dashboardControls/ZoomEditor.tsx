import { type DateZoomControl } from '@lightdash/common';
import {
    Badge,
    Box,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectDashboardTabs,
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import { useEligibleZoomTiles, useGranularityOptions } from '../dateZoom/hooks';
import classes from './ControlSidebar.module.css';
import { Disclosure } from './Disclosure';
import { EditorFooter } from './EditorFooter';
import { formatTileCount } from './fieldLabels';
import { getEffectiveTabUuid } from './peers';
import { RemoveZoomButton } from './RemoveZoomButton';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFocusLabelOnMount, useLabelDraft } from './useLabelDraft';
import {
    DEFAULT_ZOOM_NAME,
    getZoomTileUuids,
    replaceZoomControl,
} from './zoomState';

// The zoom's tiles, each with the field it is zoomed on. Changed on the tiles
const ZoomTiles: FC<{ control: DateZoomControl }> = ({ control }) => {
    const config = useDashboardDateZoomConfig();
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const eligibleTiles = useEligibleZoomTiles(config, control.uuid);
    const tiles = eligibleTiles.filter(
        ({ tile }) =>
            config.tileTargets[tile.uuid]?.controlUuid === control.uuid,
    );
    return (
        <Stack gap="xs">
            {tiles.map(({ tile, label, zoomableFields }) => {
                const fieldId = config.tileTargets[tile.uuid]?.fieldId ?? null;
                const fieldLabel =
                    fieldId === null
                        ? 'Parameter'
                        : (zoomableFields.find(
                              (field) => field.fieldId === fieldId,
                          )?.label ?? fieldId);
                const tabName =
                    dashboardTabs.length > 1
                        ? dashboardTabs.find(
                              (tab) =>
                                  tab.uuid ===
                                  getEffectiveTabUuid(tile, dashboardTabs),
                          )?.name
                        : undefined;
                return (
                    <Group key={tile.uuid} gap="xs" wrap="nowrap">
                        <Text fz="sm" truncate flex={1}>
                            {label}
                        </Text>
                        <Text fz="xs" c="dimmed" truncate>
                            {tabName
                                ? `${fieldLabel} · ${tabName}`
                                : fieldLabel}
                        </Text>
                    </Group>
                );
            })}
            <Text fz="xs" c="dimmed">
                {tiles.length === 0
                    ? 'No tiles yet. Pick a date field on a tile, or switch a parameter tile on.'
                    : "Change a tile's date field on the tile itself."}
            </Text>
        </Stack>
    );
};

type Props = {
    control: DateZoomControl;
    /** The header's name, which names the rail. */
    labelId: string;
};

// Mounted with the zoom's uuid as key, as a filter's editor is, so the name
// draft never carries over to another control
export const ZoomEditor: FC<Props> = ({ control, labelId }) => {
    const getUiString = useUiStrings();
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const isDirty = useControlsSidebarSelector((c) => c.isDirty);
    const activeSection = useControlsSidebarSelector((c) => c.activeSection);
    const setActiveSection = useControlsSidebarSelector(
        (c) => c.setActiveSection,
    );
    const updateDateZoomConfig = useControlsSidebarSelector(
        (c) => c.updateDateZoomConfig,
    );
    const config = useDashboardDateZoomConfig();
    const granularityOptions = useGranularityOptions();
    useFocusLabelOnMount();
    // The debounced commit runs the latest render's callback, so it writes
    // over the config as it is then
    const name = useLabelDraft(control.name, (next) =>
        updateDateZoomConfig(
            replaceZoomControl(config, { ...control, name: next.trim() }),
        ),
    );
    const tileCount = getZoomTileUuids(config, control.uuid).length;
    // A new zoom is kept once it has a tile
    const isIncomplete = isNew && tileCount === 0;

    return (
        <>
            <Group
                gap="xs"
                wrap="nowrap"
                px="md"
                py="xs"
                className={classes.header}
            >
                <MantineIcon
                    icon={IconCalendar}
                    size={14}
                    color="dimmed"
                    className={classes.typeIcon}
                />
                <Text id={labelId} fz="sm" fw={600} flex={1} truncate>
                    {control.name.trim() === ''
                        ? DEFAULT_ZOOM_NAME
                        : control.name}
                </Text>
                {isDirty && (
                    <Badge size="sm">
                        {getUiString(
                            isNew
                                ? 'filters.rail.newBadge'
                                : 'filters.rail.editedBadge',
                        )}
                    </Badge>
                )}
            </Group>
            <Box className={classes.body}>
                <Stack gap="xs" className={classes.content}>
                    <TextInput
                        label="Name"
                        size="xs"
                        placeholder={DEFAULT_ZOOM_NAME}
                        autoFocus
                        data-controls-label
                        value={name.draft}
                        onChange={(event) =>
                            name.type(event.currentTarget.value)
                        }
                        // Synchronous, so a click on Apply keeps the name; an
                        // emptied one goes back to the one a zoom starts with
                        onBlur={() => {
                            if (name.draft.trim() === '')
                                name.set(DEFAULT_ZOOM_NAME);
                            else name.flush();
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            name.flush();
                        }}
                    />
                    <Select
                        size="xs"
                        label="Granularity"
                        data={granularityOptions}
                        value={String(control.granularity)}
                        allowDeselect={false}
                        comboboxProps={{ withinPortal: true }}
                        onChange={(value) => {
                            if (value === null) return;
                            updateDateZoomConfig(
                                replaceZoomControl(config, {
                                    ...control,
                                    granularity: value,
                                }),
                            );
                        }}
                    />
                    <Box className={classes.disclosures}>
                        <Disclosure
                            section="tiles"
                            label={getUiString('filters.rail.tiles')}
                            summary={
                                tileCount === 0
                                    ? 'No tiles'
                                    : formatTileCount(getUiString, tileCount)
                            }
                            isOpen={activeSection === 'tiles'}
                            onToggle={(section) =>
                                setActiveSection(
                                    activeSection === section ? null : section,
                                )
                            }
                        >
                            <ZoomTiles control={control} />
                        </Disclosure>
                    </Box>
                    <RemoveZoomButton />
                </Stack>
            </Box>
            <EditorFooter
                isApplyDisabled={isIncomplete}
                hint={isIncomplete ? 'Select a tile to keep this zoom' : null}
            />
        </>
    );
};
