import { ActionIcon, Box, Button, Popover, Text, Tooltip } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import {
    IconCalendarSearch,
    IconCheck,
    IconEyeOff,
    IconX,
} from '@tabler/icons-react';
import {
    Fragment,
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectAvailableCustomGranularities,
    selectControlSections,
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
} from '../dashboard/store';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { useEligibleDateZoomTiles } from '../dateZoom/hooks';
import { getGranularityLabel } from '../dateZoom/utils';
import { MOVE_KEYS, useBarMove, useBarSelection } from './barSelection';
import { DateZoomControlPopover } from './DateZoomControlPopover';
import {
    DATE_ZOOM_DRAG,
    DATE_ZOOM_PILL_SELECTOR,
    getZoomTileUuids,
} from './dateZoomControls';
import editorClasses from './FilterEditor.module.css';
import pillClasses from './FilterPills.module.css';
import classes from './ParameterPills.module.css';
import { BarDroppable, PillDraggable } from './PillDraggable';
import { useRailContractClasses } from './railContractClasses';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useDateZoomBar, type DateZoomBarEntry } from './useDateZoomBar';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useIsControlEdited } from './useIsControlEdited';
import { useParameterEditorSelector } from './useParameterEditor';
import { usePillActionHover } from './usePillActionHover';

const NO_TRANSITION = { duration: 0 };
const DRAG_DATA = { kind: DATE_ZOOM_DRAG };
const noop = () => {};

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
                          onChooseTiles: noop,
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

// As the parameter popover: focus kept inside, Escape and a press outside
// owned by the provider, mounted only while open
const DateZoomEditorPopover: FC<{ isOpen: boolean; children: ReactNode }> = ({
    isOpen,
    children,
}) => {
    const contractClasses = useRailContractClasses();
    const filterMapping = useControlsSidebarSelector((c) => c.isMapping);
    const parameterMapping = useParameterEditorSelector((c) => c.isMapping);
    const isShown = isOpen && !filterMapping && !parameterMapping;
    return (
        <Popover
            opened={isShown}
            position="bottom-start"
            withArrow
            offset={1}
            arrowOffset={14}
            transitionProps={NO_TRANSITION}
            trapFocus
            closeOnEscape={false}
            closeOnClickOutside={false}
            withRoles={false}
        >
            <Popover.Target>{children}</Popover.Target>
            {isShown && (
                <Popover.Dropdown
                    p={0}
                    tabIndex={-1}
                    data-controls-editor
                    className={
                        contractClasses === null
                            ? editorClasses.dropdown
                            : `${editorClasses.dropdown} ${contractClasses.rail} ${contractClasses.parameterDropdown}`
                    }
                >
                    <DateZoomEditorContent />
                </Popover.Dropdown>
            )}
        </Popover>
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

const DateZoomPill: FC<{ entry: DateZoomBarEntry }> = ({ entry }) => {
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    const { control, isNew } = entry;
    const isOpen = useDateZoomEditorSelector(
        (c) => c.editingId === control.uuid,
    );
    const isViewer = useDateZoomEditorSelector((c) => c.isViewer);
    const open = useDateZoomEditorSelector((c) => c.open);
    const remove = useDateZoomEditorSelector((c) => c.remove);
    // The open popover's grain and name, as the draft has them
    const draft = useDateZoomEditorSelector((c) =>
        c.editingId === control.uuid && !c.isViewer ? c.draft : null,
    );
    // A filter being edited closes first, or asks on unapplied changes
    const requestSwitch = useControlsSidebarSelector((c) => c.requestSwitch);
    const isEditing = useIsControlEdited();
    const selection = useBarSelection();
    const barMove = useBarMove();
    const customLabels = useDashboardSelector(
        selectAvailableCustomGranularities,
    );
    const isSaved = useDashboardContext(
        (c) =>
            c.dashboard?.config?.dateZoomConfig?.controls.some(
                ({ uuid }) => uuid === control.uuid,
            ) ?? false,
    );
    const { isOnAction, trackAction } = usePillActionHover(
        DATE_ZOOM_PILL_SELECTOR,
    );
    const os = useOs();
    const canEdit = !isViewer && !isNew;
    const isSelectable = selection !== null && canEdit && !isEditing;
    const isPicked =
        isSelectable && selection.selectedIds.includes(control.uuid);
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (isSelectable) {
            if (event.metaKey || event.ctrlKey || event.shiftKey) {
                selection.pick(control.uuid, event.shiftKey);
                return;
            }
            selection.clear();
        }
        requestSwitch(() => open(control));
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const direction = MOVE_KEYS[event.key];
        // Moves are an editor's, on the sectioned bar
        if (!canEdit || !event.altKey || direction === undefined) return;
        if (barMove === null) return;
        event.preventDefault();
        barMove(control.uuid, direction);
    };
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
        isSelectable
            ? `Click to edit · ${os === 'macos' ? '⌘' : 'Ctrl'} click to select`
            : null,
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
                            root: contractClasses?.parameter,
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
                                onClick={() => remove(control.uuid)}
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
    return (
        <>
            {shown.map((entry) => {
                const pill = <DateZoomPill entry={entry} />;
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
