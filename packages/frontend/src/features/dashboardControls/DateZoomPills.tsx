import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconCalendarSearch,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconEyeOff,
    IconX,
} from '@tabler/icons-react';
import { Fragment, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectAvailableCustomGranularities,
    selectControlSections,
    selectDashboardTiles,
    selectDateZoomGranularity,
    selectIsDateZoomDisabled,
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
    useDefaultDateZoomGranularity,
} from '../dashboard/store';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { useEligibleDateZoomTiles } from '../dateZoom/hooks';
import { getGranularityLabel } from '../dateZoom/utils';
import { ControlEditorPopover } from './ControlEditorPopover';
import { DateZoomControlPopover } from './DateZoomControlPopover';
import {
    DATE_ZOOM_DRAG,
    DATE_ZOOM_PILL_SELECTOR,
    DEFAULT_ZOOM_ID,
    getZoomTileUuids,
} from './dateZoomControls';
import { DefaultZoomPopover } from './DefaultZoomPopover';
import pillClasses from './FilterPills.module.css';
import classes from './ParameterPills.module.css';
import { BarDroppable, PillDraggable } from './PillDraggable';
import { useRailContractClasses } from './railContractClasses';
import { useBarPill } from './useBarPill';
import { useControlsSidebarSelector } from './useControlsSidebar';
import {
    useDateZoomBar,
    useDefaultZoomTileCount,
    type DateZoomBarEntry,
} from './useDateZoomBar';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useIsControlEdited } from './useIsControlEdited';
import { useParameterEditorSelector } from './useParameterEditor';

const DRAG_DATA = { kind: DATE_ZOOM_DRAG };

// The default zoom's popover: its draft (an editor's) or pick (a viewer's)
const DefaultZoomEditorContent: FC = () => {
    const isViewer = useDateZoomEditorSelector((c) => c.isViewer);
    const pick = useDateZoomEditorSelector((c) => c.pick);
    const isAsking = useDateZoomEditorSelector((c) => c.isAsking);
    const setPick = useDateZoomEditorSelector((c) => c.setPick);
    const apply = useDateZoomEditorSelector((c) => c.apply);
    const cancel = useDateZoomEditorSelector((c) => c.cancel);
    const resolvePending = useDateZoomEditorSelector((c) => c.resolvePending);
    const granularities = useDashboardDateZoomGranularities();
    const customLabels = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const tileCount = useDefaultZoomTileCount();
    return (
        <DefaultZoomPopover
            enabledGranularities={granularities}
            value={pick}
            customLabels={customLabels}
            mode={isViewer ? { kind: 'viewer' } : { kind: 'editor', tileCount }}
            isAsking={isAsking}
            onResolvePending={resolvePending}
            onChange={setPick}
            onCancel={cancel}
            onApply={apply}
        />
    );
};

// The open zoom's popover, wired to the provider, the only writer
const DateZoomEditorContent: FC = () => {
    const draft = useDateZoomEditorSelector((c) => c.draft);
    const draftTargets = useDateZoomEditorSelector((c) => c.draftTargets);
    const isNew = useDateZoomEditorSelector((c) => c.newZoom !== null);
    const isViewer = useDateZoomEditorSelector((c) => c.isViewer);
    const pick = useDateZoomEditorSelector((c) => c.pick);
    const isAsking = useDateZoomEditorSelector((c) => c.isAsking);
    const update = useDateZoomEditorSelector((c) => c.update);
    const setPick = useDateZoomEditorSelector((c) => c.setPick);
    const apply = useDateZoomEditorSelector((c) => c.apply);
    const cancel = useDateZoomEditorSelector((c) => c.cancel);
    const resolvePending = useDateZoomEditorSelector((c) => c.resolvePending);
    const startMapping = useDateZoomEditorSelector((c) => c.startMapping);
    const config = useDashboardDateZoomConfig();
    const granularities = useDashboardDateZoomGranularities();
    const customLabels = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const sections = useDashboardSelector(selectControlSections);
    const eligibleTiles = useEligibleDateZoomTiles(config, draft?.uuid ?? '');
    if (draft === null) return null;
    // A viewer's popover shows the zoom as saved, with their pick
    const control = isViewer
        ? (config.controls.find(({ uuid }) => uuid === draft.uuid) ?? draft)
        : draft;
    return (
        <DateZoomControlPopover
            control={control}
            granularities={granularities}
            customLabels={customLabels}
            mode={
                isViewer
                    ? { kind: 'viewer', granularity: pick, onChange: setPick }
                    : {
                          kind: 'editor',
                          isNew,
                          sections,
                          tileCount: getZoomTileUuids(
                              draftTargets ?? config.tileTargets,
                              draft.uuid,
                          ).length,
                          totalTileCount: eligibleTiles.length,
                          initialView: 'value',
                          onChooseTiles: startMapping,
                          onChange: update,
                      }
            }
            isAsking={isAsking}
            onResolvePending={resolvePending}
            onCancel={cancel}
            onApply={apply}
        />
    );
};

const DateZoomEditorPopover: FC<{
    isOpen: boolean;
    isDefault?: boolean;
    children: ReactNode;
}> = ({ isOpen, isDefault = false, children }) => {
    const filterMapping = useControlsSidebarSelector((c) => c.isMapping);
    const parameterMapping = useParameterEditorSelector((c) => c.isMapping);
    const dateZoomMapping = useDateZoomEditorSelector((c) => c.isMapping);
    return (
        <ControlEditorPopover
            isShown={
                isOpen &&
                !filterMapping &&
                !parameterMapping &&
                !dateZoomMapping
            }
            dropdownClass="dateZoomDropdown"
            // The default sits at the bar's end
            position={isDefault ? 'bottom-end' : 'bottom-start'}
            content={
                isDefault ? (
                    <DefaultZoomEditorContent />
                ) : (
                    <DateZoomEditorContent />
                )
            }
        >
            {children}
        </ControlEditorPopover>
    );
};

/** "Revenue zoom is Week": the name, a muted "is", the grain. */
const DateZoomPillLabel: FC<{
    name: string;
    grain: string;
    isInEffect: boolean;
}> = ({ name, grain, isInEffect }) => {
    const getUiString = useUiStrings();
    return (
        <Text fz="xs" truncate>
            <Text span fw={600}>
                {name}{' '}
            </Text>
            <Text span c="dimmed">
                {getUiString('parameters.is')}{' '}
            </Text>
            <Text span fw={isInEffect ? 600 : undefined}>
                {grain}
            </Text>
        </Text>
    );
};

const REMOVE_LABEL = 'Remove date zoom';

const DateZoomPill: FC<{
    entry: DateZoomBarEntry;
    /** The pass's pills in order: Alt with an arrow moves past one. */
    neighbourIds: string[];
}> = ({ entry, neighbourIds }) => {
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    const { control, isNew } = entry;
    const isOpen = useDateZoomEditorSelector(
        (c) => c.editingId === control.uuid,
    );
    const isViewer = useDateZoomEditorSelector((c) => c.isViewer);
    const open = useDateZoomEditorSelector((c) => c.open);
    const move = useDateZoomEditorSelector((c) => c.move);
    const remove = useDateZoomEditorSelector((c) => c.remove);
    // The open popover's grain and name, as the draft has them
    const draft = useDateZoomEditorSelector((c) =>
        c.editingId === control.uuid && !c.isViewer ? c.draft : null,
    );
    // A filter being edited closes first, or asks on unapplied changes
    const requestSwitch = useControlsSidebarSelector((c) => c.requestSwitch);
    const isEditing = useIsControlEdited();
    const customLabels = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const isSaved = useDashboardContext(
        (c) =>
            c.dashboard?.config?.dateZoomConfig?.controls.some(
                ({ uuid }) => uuid === control.uuid,
            ) ?? false,
    );
    const canEdit = !isViewer && !isNew;
    const {
        isSelectable,
        isPicked,
        selectHint,
        handleClick,
        handleKeyDown,
        tileHover,
        isOnAction,
        trackAction,
    } = useBarPill({
        id: control.uuid,
        pillSelector: DATE_ZOOM_PILL_SELECTOR,
        canSelect: canEdit && !isEditing,
        open: () => requestSwitch(() => open(control)),
        canMove: canEdit,
        moveAlong: (direction) => {
            const index = neighbourIds.indexOf(control.uuid);
            const overId =
                neighbourIds[index + (direction === 'left' ? -1 : 1)];
            if (index !== -1 && overId !== undefined)
                move(control.uuid, overId);
        },
        // As a filter pill: in edit mode the tiles it zooms are marked
        isTileHoverEnabled: !isViewer && !isEditing,
        getTileUuids: () => entry.tileUuids,
    });
    const name = (draft ?? control).name;
    const grain = getGranularityLabel(
        draft?.granularity ?? entry.granularity,
        customLabels,
        getUiString,
    );
    const isInEffect = entry.tileUuids.length > 0;
    const isUnsaved = !isViewer && (isNew || !isSaved);
    const tooltipLines = [
        isUnsaved ? 'Not saved yet' : null,
        !isViewer && entry.isHidden ? 'Hidden from viewers' : null,
        isSelectable ? selectHint : null,
    ].filter((line) => line !== null);

    return (
        <DateZoomEditorPopover isOpen={isOpen}>
            <Tooltip
                fz="xs"
                maw={350}
                multiline
                openDelay={500}
                label={tooltipLines.map((line) => (
                    <Text key={line} fz="xs">
                        {line}
                    </Text>
                ))}
                disabled={tooltipLines.length === 0 || isOpen || isOnAction}
            >
                <Box
                    className={`${classes.pill} ${pillClasses.pill}`}
                    onPointerOver={trackAction}
                    onPointerLeave={trackAction}
                >
                    <Button
                        {...tileHover}
                        size="xs"
                        variant="default"
                        pos="relative"
                        data-date-zoom-pill={control.uuid}
                        data-date-zoom-name={name}
                        data-in-effect={isInEffect || undefined}
                        data-temporary={isUnsaved || undefined}
                        data-open={isOpen || undefined}
                        data-hidden={entry.isHidden || undefined}
                        aria-pressed={isOpen || isPicked}
                        classNames={{
                            label: filterClasses.label,
                            root: contractClasses?.dateZoom,
                        }}
                        className={`${filterClasses.button} ${filterClasses.plain}${
                            isPicked ? ` ${pillClasses.pickedPill}` : ''
                        }`}
                        leftSection={
                            <MantineIcon
                                icon={
                                    isPicked
                                        ? IconCheck
                                        : !isViewer && entry.isHidden
                                          ? IconEyeOff
                                          : IconCalendarSearch
                                }
                                size="sm"
                                className={filterClasses.statusIcon}
                            />
                        }
                        rightSection={
                            canEdit && (
                                <Box className={classes.actions}>
                                    <span
                                        aria-hidden="true"
                                        className={classes.removeSpace}
                                    />
                                </Box>
                            )
                        }
                        onClick={handleClick}
                        onKeyDown={handleKeyDown}
                    >
                        <DateZoomPillLabel
                            name={name}
                            grain={grain}
                            isInEffect={isInEffect}
                        />
                    </Button>
                    {canEdit && (
                        <Tooltip fz="xs" label={REMOVE_LABEL}>
                            <ActionIcon
                                data-date-zoom-pill-action
                                size="xs"
                                radius="xl"
                                className={classes.removeAction}
                                aria-label={REMOVE_LABEL}
                                onClick={() =>
                                    requestSwitch(() => remove(control.uuid))
                                }
                            >
                                <MantineIcon size="sm" icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Box>
            </Tooltip>
        </DateZoomEditorPopover>
    );
};

type Props = {
    /** `undefined`: every zoom (the flat bar); null: the unsectioned ones; a string: that section's. */
    sectionId?: string | null;
    /** In the sectioned bar's one drag context: editors drag the pills. */
    isInBarContext?: boolean;
    /** Only these pills, in this order (default every one of the pass). */
    ids?: string[];
    /** A zoom being added in this pass, last (default: with no `ids`). */
    withNew?: boolean;
};

// Named date zooms after the filters and parameters of the same pass
export const DateZoomPills: FC<Props> = ({
    sectionId,
    isInBarContext = false,
    ids,
    withNew = ids === undefined,
}) => {
    const entries = useDateZoomBar();
    const isViewer = useDateZoomEditorSelector((c) => c.isViewer);
    const editingId = useDateZoomEditorSelector((c) => c.editingId);
    const passEntries = entries.filter(
        (entry) =>
            (sectionId === undefined || entry.sectionId === sectionId) &&
            (entry.isNew
                ? withNew
                : ids === undefined || ids.includes(entry.control.uuid)),
    );
    const shown =
        ids === undefined
            ? passEntries
            : [
                  ...ids.flatMap((id) =>
                      passEntries.filter(
                          ({ control, isNew }) => !isNew && control.uuid === id,
                      ),
                  ),
                  ...passEntries.filter(({ isNew }) => isNew),
              ];
    const neighbourIds = shown
        .filter(({ isNew }) => !isNew)
        .map(({ control }) => control.uuid);
    return (
        <>
            {shown.map((entry) => {
                const pill = (
                    <DateZoomPill entry={entry} neighbourIds={neighbourIds} />
                );
                if (!isInBarContext || isViewer || entry.isNew)
                    return <Fragment key={entry.control.uuid}>{pill}</Fragment>;
                return (
                    <BarDroppable
                        key={entry.control.uuid}
                        id={entry.control.uuid}
                    >
                        <PillDraggable
                            id={entry.control.uuid}
                            isInBarContext
                            isDisabled={editingId !== null}
                            data={DRAG_DATA}
                            pillSelector={DATE_ZOOM_PILL_SELECTOR}
                        >
                            {pill}
                        </PillDraggable>
                    </BarDroppable>
                );
            })}
        </>
    );
};

// The dashboard-wide default zoom, at the controls strip's start after the
// toggle, then a divider. Never moved, picked or removed. Hidden from viewers
// when nothing falls to it
export const DefaultZoomButton: FC = () => {
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    const isOpen = useDateZoomEditorSelector(
        (c) => c.editingId === DEFAULT_ZOOM_ID,
    );
    const isViewer = useDateZoomEditorSelector((c) => c.isViewer);
    const open = useDateZoomEditorSelector((c) => c.open);
    // The open popover's draft (an editor's), else what applies
    const pick = useDateZoomEditorSelector((c) =>
        c.editingId === DEFAULT_ZOOM_ID && !c.isViewer ? c.pick : undefined,
    );
    const requestSwitch = useControlsSidebarSelector((c) => c.requestSwitch);
    const isDateZoomDisabled = useDashboardSelector(selectIsDateZoomDisabled);
    const hasTiles = useDashboardSelector(
        (state) => (selectDashboardTiles(state)?.length ?? 0) > 0,
    );
    const runtime = useDashboardSelector(selectDateZoomGranularity);
    const defaultGranularity = useDefaultDateZoomGranularity();
    const customLabels = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const tileCount = useDefaultZoomTileCount();
    if (!hasTiles || (isViewer && (isDateZoomDisabled || tileCount === 0)))
        return null;
    const granularity =
        pick !== undefined
            ? pick
            : isViewer
              ? (runtime ?? null)
              : (defaultGranularity ?? null);
    const isHidden = !isViewer && isDateZoomDisabled;
    const isInEffect = granularity !== null && tileCount > 0;
    return (
        <Group gap="xs" wrap="nowrap" mih={30}>
            <DateZoomEditorPopover isOpen={isOpen} isDefault>
                <Tooltip
                    fz="xs"
                    openDelay={500}
                    label="Hidden from viewers"
                    disabled={!isHidden || isOpen}
                >
                    <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        data-date-zoom-pill={DEFAULT_ZOOM_ID}
                        // The shipped Default zoom button's walkthrough
                        // marker (view:Dashboard), kept on its equivalent
                        data-tour-scope="view:Dashboard"
                        data-tour-step="2"
                        data-tour-route="/projects/:projectUuid/dashboards/:dashboardUuid/view"
                        data-tour-label="Open the date zoom"
                        data-tour-title="Open and read a dashboard"
                        data-tour-interactive="true"
                        data-tour-via='[data-tour-nav="browse"] >> [data-tour-nav="all-dashboards"] >> [data-tour-anchor="dashboard-row"][data-tour-value="Jaffle Shop overview"]'
                        data-tour-then='[data-tour-anchor="zoom-option"][data-tour-value="Month"]'
                        data-tour-docs="explore/dashboards/date-zoom.mdx#intro:1"
                        data-in-effect={isInEffect || undefined}
                        data-open={isOpen || undefined}
                        data-hidden={isHidden || undefined}
                        aria-pressed={isOpen}
                        classNames={{ root: contractClasses?.dateZoom }}
                        leftSection={
                            <MantineIcon
                                icon={
                                    isHidden ? IconEyeOff : IconCalendarSearch
                                }
                                color="dimmed"
                            />
                        }
                        rightSection={
                            <MantineIcon
                                icon={isOpen ? IconChevronUp : IconChevronDown}
                                color="dimmed"
                            />
                        }
                        onClick={() =>
                            requestSwitch(() =>
                                open({
                                    uuid: DEFAULT_ZOOM_ID,
                                    name: getUiString('dateZoom.defaultZoom'),
                                    granularity: granularity ?? '',
                                }),
                            )
                        }
                    >
                        {/* One text run: the label's flex would drop the space */}
                        <Text span fz="xs">
                            <Text span c="dimmed">
                                {getUiString('dateZoom.defaultZoom')}{' '}
                            </Text>
                            <Text
                                span
                                fw={isInEffect ? 600 : undefined}
                                c={isInEffect ? undefined : 'dimmed'}
                            >
                                {granularity === null
                                    ? getUiString('dateZoom.none')
                                    : getGranularityLabel(
                                          granularity,
                                          customLabels,
                                          getUiString,
                                      )}
                            </Text>
                        </Text>
                    </Button>
                </Tooltip>
            </DateZoomEditorPopover>
            <Divider orientation="vertical" />
        </Group>
    );
};
