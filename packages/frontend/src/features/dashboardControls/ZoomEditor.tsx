import { type DateZoomControl } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowBackUp,
    IconChevronDown,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { ConfirmDeleteButton } from '../../components/common/ConfirmDeleteButton';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectActiveTab,
    selectDashboardTabs,
    useDashboardDateZoomConfig,
    useDashboardSelector,
} from '../dashboard/store';
import { useEligibleZoomTiles, useGranularityOptions } from '../dateZoom/hooks';
import classes from './ControlSidebar.module.css';
import { Disclosure } from './Disclosure';
import { formatTileCount } from './fieldLabels';
import { getEffectiveTabUuid } from './peers';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFocusLabelOnMount, useLabelDraft } from './useLabelDraft';
import { ZoomTypeIcon } from './ZoomRow';
import {
    addZoomTiles,
    DEFAULT_ZOOM_NAME,
    replaceZoomControl,
} from './zoomState';

type Props = {
    control: DateZoomControl;
};

// The zoom's tiles, each with the field it is zoomed on. Changed on the tiles,
// or all at once for the tab in view
const ZoomTiles: FC<{ control: DateZoomControl }> = ({ control }) => {
    const config = useDashboardDateZoomConfig();
    const dashboardTabs = useDashboardSelector(selectDashboardTabs);
    const activeTab = useDashboardSelector(selectActiveTab);
    const updateDateZoomConfig = useControlsSidebarSelector(
        (c) => c.updateDateZoomConfig,
    );
    const eligibleTiles = useEligibleZoomTiles(config, control.uuid);
    // Tiles of the tab in view that no zoom has yet: a chart on its first
    // date field, a param-only tile on the parameter
    const addable = eligibleTiles.filter(
        ({ tile }) =>
            config.tileTargets[tile.uuid] === undefined &&
            (dashboardTabs.length === 0 ||
                getEffectiveTabUuid(tile, dashboardTabs) === activeTab?.uuid),
    );
    const addAll = () =>
        updateDateZoomConfig(
            addZoomTiles(
                config,
                control.uuid,
                addable.map(({ tile, zoomableFields }) => ({
                    tileUuid: tile.uuid,
                    field: {
                        fieldId: zoomableFields[0]?.fieldId ?? null,
                        tableName: zoomableFields[0]?.tableName ?? null,
                    },
                })),
            ),
        );
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
            <Button
                variant="subtle"
                size="xs"
                leftSection={<MantineIcon icon={IconPlus} />}
                disabled={addable.length === 0}
                onClick={addAll}
            >
                {dashboardTabs.length > 0
                    ? 'Add every tile on this tab'
                    : 'Add every tile'}
            </Button>
        </Stack>
    );
};

// Mounted with the zoom's uuid as key, as a filter's editor is
export const ZoomEditor: FC<Props> = ({ control }) => {
    const getUiString = useUiStrings();
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const isDirty = useControlsSidebarSelector((c) => c.isDirty);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const collapse = useControlsSidebarSelector((c) => c.collapse);
    const removeZoom = useControlsSidebarSelector((c) => c.removeZoom);
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
            replaceZoomControl(config, { ...control, name: next }),
        ),
    );
    const tileCount = Object.values(config.tileTargets).filter(
        (target) => target.controlUuid === control.uuid,
    ).length;
    const discardLabel = isNew
        ? 'Discard date zoom'
        : isDirty
          ? getUiString('filters.rail.discardChanges')
          : null;
    // A new zoom with no tiles leaves through the footer's Cancel
    const hasDiscard = discardLabel !== null && !(isNew && tileCount === 0);

    return (
        <Box className={classes.edited}>
            <Group
                gap="xs"
                wrap="nowrap"
                className={classes.editedHead}
                onClick={(event) => {
                    if (
                        event.target instanceof Element &&
                        event.target.closest('input, button')
                    )
                        return;
                    collapse();
                }}
            >
                <ZoomTypeIcon />
                <TextInput
                    aria-label="Date zoom name"
                    size="xs"
                    className={classes.nameInput}
                    classNames={{ input: classes.nameInputField }}
                    placeholder={DEFAULT_ZOOM_NAME}
                    autoFocus
                    data-controls-label
                    value={name.draft}
                    onChange={(event) => name.type(event.currentTarget.value)}
                    // An emptied name goes back to the one it started with
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
                {hasDiscard && (
                    <Tooltip label={discardLabel}>
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            aria-label={discardLabel}
                            onClick={discard}
                        >
                            <MantineIcon icon={IconArrowBackUp} />
                        </ActionIcon>
                    </Tooltip>
                )}
                {!isNew && (
                    <ConfirmDeleteButton
                        size="sm"
                        aria-label="Remove date zoom"
                        tooltip={getUiString('filters.rail.confirmRemove')}
                        onConfirm={removeZoom}
                    >
                        <MantineIcon icon={IconTrash} />
                    </ConfirmDeleteButton>
                )}
                <Tooltip label={getUiString('filters.rail.collapse')}>
                    <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label="Collapse date zoom"
                        aria-expanded
                        onClick={collapse}
                    >
                        <MantineIcon icon={IconChevronDown} size={14} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <Stack gap="sm" className={classes.editedBody}>
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
            </Stack>
        </Box>
    );
};
