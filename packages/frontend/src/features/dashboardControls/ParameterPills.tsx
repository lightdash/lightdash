import { ActionIcon, Box, Button, Popover, Text, Tooltip } from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconCheck,
    IconEyeOff,
    IconX,
} from '@tabler/icons-react';
import {
    Fragment,
    useMemo,
    type FC,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import { DroppableArea } from '../../components/common/DndHelpers';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import {
    selectDashboardEffectiveParameterValues,
    selectParameterControlInputs,
    selectTileParameterReferences,
    useDashboardSelector,
} from '../dashboard/store';
import { getParameterControlOptionValues } from '../dashboard/store/parameterControls';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { ShadowedReservedNameWarning } from '../parameters/components/ShadowedReservedNameWarning';
import { getParameterDisplayValue } from '../parameters/utils/parameterDisplayValue';
import { useBarSelection } from './barSelection';
import editorClasses from './FilterEditor.module.css';
import pillClasses from './FilterPills.module.css';
import { ParameterControlPopover } from './ParameterControlPopover';
import {
    PARAMETER_DRAG,
    PARAMETER_PILL_SELECTOR,
} from './parameterControlsBar';
import classes from './ParameterPills.module.css';
import { PillDraggable } from './PillDraggable';
import { useRailContractClasses } from './railContractClasses';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useIsControlEdited } from './useIsControlEdited';
import {
    getParameterEntryName,
    useParameterBarControls,
    type ParameterBar,
    type ParameterBarEntry,
} from './useParameterBarControls';
import { useParameterEditorSelector } from './useParameterEditor';
import { usePillActionHover } from './usePillActionHover';
import { useTileHover } from './useTileHover';

const NO_TRANSITION = { duration: 0 };
const DRAG_DATA = { kind: PARAMETER_DRAG };

// The open control's popover, wired to the provider, the only writer
const ParameterEditorContent: FC<{
    entry: ParameterBarEntry;
    bar: ParameterBar;
}> = ({ entry, bar }) => {
    const projectUuid = useProjectUuid();
    const dashboardValues = useDashboardSelector(
        selectDashboardEffectiveParameterValues,
    );
    const controlInputs = useDashboardSelector(selectParameterControlInputs);
    const tileParameterReferences = useDashboardSelector(
        selectTileParameterReferences,
    );
    const parameterValues = useMemo(
        () =>
            getParameterControlOptionValues({
                controlInputs,
                dashboardValues,
                tileUuids: entry.tileUuids,
                key: entry.parameterKeys[0],
                tileParameterReferences,
            }),
        [
            controlInputs,
            dashboardValues,
            entry.tileUuids,
            entry.parameterKeys,
            tileParameterReferences,
        ],
    );
    const draft = useParameterEditorSelector((c) => c.draft);
    const isViewer = useParameterEditorSelector((c) => c.isViewer);
    const isNeedsValue = useParameterEditorSelector((c) => c.isNeedsValue);
    const update = useParameterEditorSelector((c) => c.update);
    const apply = useParameterEditorSelector((c) => c.apply);
    const cancel = useParameterEditorSelector((c) => c.cancel);
    const isAsking = useParameterEditorSelector((c) => c.isAsking);
    const resolvePending = useParameterEditorSelector((c) => c.resolvePending);
    if (draft === null || projectUuid === undefined) return null;
    return (
        <ParameterControlPopover
            control={draft}
            nameSuffix={entry.nameSuffix}
            parameters={entry.parameters}
            input={entry.input}
            tileCount={entry.tileUuids.length}
            totalTileCount={bar.totalTileCount}
            projectUuid={projectUuid}
            projectTimezone={null}
            parameterValues={parameterValues}
            shadowedReservedNames={bar.shadowedReservedNames}
            isViewer={isViewer}
            isMissingRequired={entry.isMissing}
            initialView="value"
            // An editor's Apply on a "needs a value" pill puts it on the bar
            applyLabel={
                isNeedsValue && !isViewer ? 'Add to the bar' : undefined
            }
            isAsking={isAsking}
            onResolvePending={resolvePending}
            onChange={update}
            onCancel={cancel}
            onApply={apply}
            onChooseTiles={null}
        />
    );
};

// As the filter editor's popover: focus kept inside, Escape and a press
// outside owned by the provider, mounted only while open
const ParameterEditorPopover: FC<{
    isOpen: boolean;
    entry: ParameterBarEntry;
    bar: ParameterBar;
    children: ReactNode;
}> = ({ isOpen, entry, bar, children }) => {
    const contractClasses = useRailContractClasses();
    const isMapping = useControlsSidebarSelector((c) => c.isMapping);
    return (
        <Popover
            opened={isOpen && !isMapping}
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
            {isOpen && !isMapping && (
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
                    <ParameterEditorContent entry={entry} bar={bar} />
                </Popover.Dropdown>
            )}
        </Popover>
    );
};

const ParameterPill: FC<{
    entry: ParameterBarEntry;
    bar: ParameterBar;
    /** The pass's pills in order: Alt with an arrow moves past one. */
    neighbourIds: string[];
}> = ({ entry, bar, neighbourIds }) => {
    const getUiString = useUiStrings();
    const contractClasses = useRailContractClasses();
    const { control, parameters, input, isNeedsValue, isMissing } = entry;
    const isOpen = useParameterEditorSelector(
        (c) => c.editingId === control.id,
    );
    const isViewer = useParameterEditorSelector((c) => c.isViewer);
    const open = useParameterEditorSelector((c) => c.open);
    // A filter being edited closes first, or asks on unapplied changes
    const requestSwitch = useControlsSidebarSelector((c) => c.requestSwitch);
    const move = useParameterEditorSelector((c) => c.move);
    const remove = useParameterEditorSelector((c) => c.remove);
    const isEditing = useIsControlEdited();
    const selection = useBarSelection();
    // On an editor's sectioned bar a modified click picks the pill, with the
    // filter pills in one selection
    const isSelectable =
        selection !== null && !isViewer && !isNeedsValue && !isEditing;
    const isPicked = isSelectable && selection.selectedIds.includes(control.id);
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (isSelectable) {
            if (event.metaKey || event.ctrlKey || event.shiftKey) {
                selection.pick(control.id, event.shiftKey);
                return;
            }
            selection.clear();
        }
        requestSwitch(() => open(entry));
    };
    // As a filter pill: in edit mode the tiles it sets are marked on hover
    const tileHover = useTileHover(
        control.id,
        !isViewer && !isEditing,
        () => entry.tileUuids,
    );
    const { isOnAction, trackAction } = usePillActionHover(
        PARAMETER_PILL_SELECTOR,
    );
    const name = getParameterEntryName(entry);
    // Hidden from viewers: its value still applies; editors see it muted
    const isHidden = control.hidden === true;
    // A value set on the dashboard reads in ink; with none, the pill says
    // so (amber when a tile it covers is left with no value at all)
    const hasValue = entry.shownValue !== null;
    const needsValue = !hasValue && isMissing;
    const isNotSet = !hasValue && !isMissing;
    const description = input.definition.description;
    const tooltipLabel = isNotSet ? (
        <>
            <Text fz="xs">
                {getUiString('controls.parameter.notSetTooltip')}
            </Text>
            {description && <Text fz="xs">{description}</Text>}
        </>
    ) : (
        description
    );
    const shadowedKey =
        parameters.find(({ key }) => bar.shadowedReservedNames.includes(key))
            ?.key ?? null;
    const canEdit = !isViewer && !isNeedsValue;

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (
            !canEdit ||
            !event.altKey ||
            (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
        )
            return;
        event.preventDefault();
        const index = neighbourIds.indexOf(control.id);
        const overId =
            neighbourIds[index + (event.key === 'ArrowLeft' ? -1 : 1)];
        if (index !== -1 && overId !== undefined)
            move(control.id, { controlId: overId });
    };

    return (
        <ParameterEditorPopover isOpen={isOpen} entry={entry} bar={bar}>
            <Tooltip
                fz="xs"
                maw={350}
                multiline
                openDelay={500}
                label={tooltipLabel}
                disabled={(!isNotSet && !description) || isOpen || isOnAction}
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
                        data-parameter-pill={control.id}
                        data-parameter-name={name}
                        data-in-effect={hasValue || undefined}
                        data-temporary={isNeedsValue || undefined}
                        data-open={isOpen || undefined}
                        data-missing={needsValue || undefined}
                        data-hidden={isHidden || undefined}
                        aria-pressed={isOpen || isPicked}
                        classNames={{
                            label: filterClasses.label,
                            root: contractClasses?.parameter,
                        }}
                        className={`${filterClasses.button} ${filterClasses.plain} ${classes.parameterPill}${
                            isPicked ? ` ${pillClasses.pickedPill}` : ''
                        }`}
                        leftSection={
                            <MantineIcon
                                icon={
                                    isPicked
                                        ? IconCheck
                                        : isHidden
                                          ? IconEyeOff
                                          : IconAdjustmentsHorizontal
                                }
                                size="sm"
                                className={filterClasses.statusIcon}
                            />
                        }
                        rightSection={
                            (shadowedKey !== null || canEdit) && (
                                <Box className={classes.actions}>
                                    {shadowedKey !== null && (
                                        <Box
                                            component="span"
                                            display="inline-flex"
                                            data-own-tooltip
                                        >
                                            <ShadowedReservedNameWarning
                                                paramKey={shadowedKey}
                                            />
                                        </Box>
                                    )}
                                    {canEdit && (
                                        <Tooltip
                                            fz="xs"
                                            label="Remove parameter"
                                        >
                                            <ActionIcon
                                                size="xs"
                                                radius="xl"
                                                className={
                                                    filterClasses.pillAction
                                                }
                                                aria-label="Remove parameter"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    remove(control.id);
                                                }}
                                            >
                                                <MantineIcon
                                                    size="sm"
                                                    icon={IconX}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </Box>
                            )
                        }
                        onClick={handleClick}
                        onKeyDown={handleKeyDown}
                    >
                        <Text fz="xs" truncate>
                            <Text span fw={600}>
                                {name}{' '}
                            </Text>
                            {needsValue ? (
                                <Text span c="dimmed">
                                    {getUiString(
                                        'controls.parameter.needsValue',
                                    )}
                                </Text>
                            ) : isNotSet ? (
                                <Text span c="dimmed">
                                    {getUiString('controls.parameter.isNotSet')}
                                </Text>
                            ) : (
                                <>
                                    <Text span c="dimmed">
                                        {getUiString('parameters.is')}{' '}
                                    </Text>
                                    <Text span fw={600}>
                                        {getParameterDisplayValue(
                                            input.definition,
                                            entry.shownValue,
                                        )}
                                    </Text>
                                </>
                            )}
                        </Text>
                    </Button>
                </Box>
            </Tooltip>
        </ParameterEditorPopover>
    );
};

type Props = {
    /** `undefined`: every control (the flat bar); null: the unsectioned ones and the safety net; a string: that section's. */
    sectionId?: string | null;
    /** In the sectioned bar's one drag context: editors drag the pills. */
    isInBarContext?: boolean;
};

// Parameter controls after the filters of the same pass, in list order
export const ParameterPills: FC<Props> = ({
    sectionId,
    isInBarContext = false,
}) => {
    const bar = useParameterBarControls();
    const isViewer = useParameterEditorSelector((c) => c.isViewer);
    const editingId = useParameterEditorSelector((c) => c.editingId);
    // A hidden control is an editor's to see; its value still applies
    const entries = bar.entries.filter(
        (entry) =>
            !(isViewer && entry.control.hidden) &&
            (sectionId === undefined ||
                (entry.isNeedsValue
                    ? sectionId === null
                    : entry.sectionId === sectionId)),
    );
    const neighbourIds = entries
        .filter(({ isNeedsValue }) => !isNeedsValue)
        .map(({ control }) => control.id);
    const orderedKeys = bar.entries.map(({ control }) => control.id);
    return (
        <>
            {entries.map((entry) => {
                const pill = (
                    <ParameterPill
                        entry={entry}
                        bar={bar}
                        neighbourIds={neighbourIds}
                    />
                );
                if (!isInBarContext || isViewer || entry.isNeedsValue)
                    return <Fragment key={entry.control.id}>{pill}</Fragment>;
                return (
                    <DroppableArea
                        key={entry.control.id}
                        id={entry.control.id}
                        orderedKeys={orderedKeys}
                    >
                        <PillDraggable
                            id={entry.control.id}
                            isInBarContext
                            isDisabled={editingId !== null}
                            looseEnd={undefined}
                            data={DRAG_DATA}
                            pillSelector={PARAMETER_PILL_SELECTOR}
                        >
                            {pill}
                        </PillDraggable>
                    </DroppableArea>
                );
            })}
        </>
    );
};
