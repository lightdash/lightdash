import {
    getControlTileUuids,
    resolveParameterDefault,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Text, Tooltip } from '@mantine/core';
import {
    IconAdjustmentsHorizontal,
    IconAsterisk,
    IconCheck,
    IconEyeOff,
    IconX,
} from '@tabler/icons-react';
import { isEqual } from 'es-toolkit/compat';
import { Fragment, useId, useMemo, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import {
    selectDashboardEffectiveParameterValues,
    selectParameterControlInputs,
    selectSavedParameterControlIds,
    selectTileParameterReferences,
    useDashboardSelector,
} from '../dashboard/store';
import { getParameterControlOptionValues } from '../dashboard/store/parameterControls';
import filterClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { useFilterTabPlacement } from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { ShadowedReservedNameWarning } from '../parameters/components/ShadowedReservedNameWarning';
import { getParameterDisplayValue } from '../parameters/utils/parameterDisplayValue';
import { useControlContractClasses } from './controlContractClasses';
import { ControlEditorPopover } from './ControlEditorPopover';
import pillClasses from './FilterPills.module.css';
import { ParameterControlPopover } from './ParameterControlPopover';
import {
    PARAMETER_DRAG,
    PARAMETER_PILL_SELECTOR,
} from './parameterControlsBar';
import classes from './ParameterPills.module.css';
import { BarDroppable, PillDraggable } from './PillDraggable';
import { useBarPill } from './useBarPill';
import { useControlsEditorSelector } from './useControlsEditor';
import { useIsControlEdited } from './useIsControlEdited';
import {
    getParameterEntryName,
    useIsParameterControlLockedInEmbed,
    useParameterBarControls,
    type ParameterBar,
    type ParameterBarEntry,
} from './useParameterBarControls';
import { useParameterEditorSelector } from './useParameterEditor';

const PARAMETER_ORPHANED_STRINGS = {
    noTabs: 'controls.parameter.notAppliedToAnyTabs',
    noTiles: 'controls.parameter.notAppliedToAnyTiles',
} as const;

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
    const draftControls = useParameterEditorSelector((c) => c.draftControls);
    const draft = useParameterEditorSelector((c) => c.draft);
    const mappedControl = draftControls?.find(({ id }) => id === draft?.id);
    const tileUuids =
        mappedControl && draftControls && controlInputs
            ? getControlTileUuids({
                  control: mappedControl,
                  controls: draftControls,
                  tileParameterReferences,
                  userParameterNames: controlInputs.userParameterNames,
              })
            : entry.tileUuids;
    const parameterValues = useMemo(
        () =>
            getParameterControlOptionValues({
                controlInputs,
                dashboardValues,
                tileUuids,
                key: entry.parameterKeys[0],
                tileParameterReferences,
            }),
        [
            controlInputs,
            dashboardValues,
            tileUuids,
            entry.parameterKeys,
            tileParameterReferences,
        ],
    );
    const isViewer = useParameterEditorSelector((c) => c.isViewer);
    const isNeedsValue = useParameterEditorSelector((c) => c.isNeedsValue);
    const update = useParameterEditorSelector((c) => c.update);
    const apply = useParameterEditorSelector((c) => c.apply);
    const cancel = useParameterEditorSelector((c) => c.cancel);
    const isAsking = useParameterEditorSelector((c) => c.isAsking);
    const resolvePending = useParameterEditorSelector((c) => c.resolvePending);
    const startMapping = useParameterEditorSelector((c) => c.startMapping);
    if (draft === null || projectUuid === undefined) return null;
    return (
        <ParameterControlPopover
            control={draft}
            nameSuffix={entry.nameSuffix}
            parameters={entry.parameters}
            input={entry.input}
            tileCount={tileUuids.length}
            hasChosenTiles={mappedControl !== undefined}
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
            onChooseTiles={isViewer ? null : startMapping}
        />
    );
};

const ParameterEditorPopover: FC<{
    isOpen: boolean;
    entry: ParameterBarEntry;
    bar: ParameterBar;
    children: ReactNode;
}> = ({ isOpen, entry, bar, children }) => {
    const filterMapping = useControlsEditorSelector((c) => c.isMapping);
    const parameterMapping = useParameterEditorSelector((c) => c.isMapping);
    return (
        <ControlEditorPopover
            isShown={isOpen && !filterMapping && !parameterMapping}
            dropdownClass="parameterDropdown"
            content={<ParameterEditorContent entry={entry} bar={bar} />}
        >
            {children}
        </ControlEditorPopover>
    );
};

const ParameterPill: FC<{
    entry: ParameterBarEntry;
    bar: ParameterBar;
    /** The pass's pills in order: Alt with an arrow moves past one. */
    neighbourIds: string[];
}> = ({ entry, bar, neighbourIds }) => {
    const getUiString = useUiStrings();
    const contractClasses = useControlContractClasses();
    const { control, parameters, input, isNeedsValue, isMissing } = entry;
    const isOpen = useParameterEditorSelector(
        (c) => c.editingId === control.id,
    );
    const isViewer = useParameterEditorSelector((c) => c.isViewer);
    const open = useParameterEditorSelector((c) => c.open);
    // A filter being edited closes first, or asks on unapplied changes
    const requestSwitch = useControlsEditorSelector((c) => c.requestSwitch);
    const move = useParameterEditorSelector((c) => c.move);
    const remove = useParameterEditorSelector((c) => c.remove);
    const isEditing = useIsControlEdited();
    const canEdit = !isViewer && !isNeedsValue;
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
        id: control.id,
        pillSelector: PARAMETER_PILL_SELECTOR,
        // With the filter pills in one selection
        canSelect: canEdit && !isEditing,
        open: () => requestSwitch(() => open(entry)),
        canMove: canEdit,
        moveAlong: (direction) => {
            const index = neighbourIds.indexOf(control.id);
            const overId =
                neighbourIds[index + (direction === 'left' ? -1 : 1)];
            if (index !== -1 && overId !== undefined)
                move(control.id, { controlId: overId });
        },
        // As a filter pill: in edit mode the tiles it sets are marked
        isTileHoverEnabled: !isViewer && !isEditing,
        getTileUuids: () => entry.tileUuids,
    });
    const name = getParameterEntryName(entry);
    // Hidden from viewers: its value still applies; editors see the eye-off icon
    const isHidden = control.hidden === true;
    // As a filter added while editing: dashed until the dashboard is saved
    const isUnsaved = useDashboardSelector(
        (state) =>
            !isViewer &&
            !isNeedsValue &&
            !selectSavedParameterControlIds(state).includes(control.id),
    );
    // A value set on the dashboard reads in ink; with none, the pill says
    // so (with the required mark when a tile it covers has no value at all)
    const hasValue = entry.shownValue !== null;
    const needsValue = !hasValue && isMissing;
    const isNotSet = !hasValue && !isMissing;
    // As the legacy pill: with no value, the default its keys share
    const defaults = parameters.map(({ definition }) =>
        resolveParameterDefault(definition),
    );
    const showsDefault =
        isNotSet &&
        defaults[0] !== undefined &&
        defaults.every((value) => isEqual(value, defaults[0]));
    const needsValueMarkId = useId();
    const description = input.definition.description;
    const { getOrphanedTooltip } = useFilterTabPlacement();
    const { isOrphaned } = entry;
    // As a filter pill's: why it looks so first, then the description, then
    // the select hint
    const unsavedNote = isUnsaved ? 'Not saved yet' : null;
    const tooltipLines = [
        unsavedNote,
        isHidden ? 'Hidden from viewers' : null,
        isNotSet ? getUiString('controls.parameter.notSetTooltip') : null,
        description ?? null,
        isSelectable ? selectHint : null,
    ].filter((line) => line !== null && line !== '');
    const tooltipLabel = isOrphaned ? (
        unsavedNote === null ? (
            getOrphanedTooltip(PARAMETER_ORPHANED_STRINGS)
        ) : (
            <>
                <Text fz="xs">{unsavedNote}</Text>
                <Text fz="xs">
                    {getOrphanedTooltip(PARAMETER_ORPHANED_STRINGS)}
                </Text>
            </>
        )
    ) : tooltipLines.length > 0 ? (
        <>
            {tooltipLines.map((line) => (
                <Text key={line} fz="xs">
                    {line}
                </Text>
            ))}
        </>
    ) : null;
    const shadowedKey =
        parameters.find(({ key }) => bar.shadowedReservedNames.includes(key))
            ?.key ?? null;

    return (
        <ParameterEditorPopover isOpen={isOpen} entry={entry} bar={bar}>
            <Tooltip
                fz="xs"
                maw={350}
                multiline
                openDelay={isOrphaned ? 0 : 500}
                label={tooltipLabel}
                disabled={tooltipLabel === null || isOpen || isOnAction}
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
                        data-in-effect={(hasValue && !isOrphaned) || undefined}
                        data-temporary={isNeedsValue || isUnsaved || undefined}
                        data-open={isOpen || undefined}
                        data-missing={needsValue || undefined}
                        data-hidden={isHidden || undefined}
                        aria-pressed={isOpen || isPicked}
                        // The mark is not read in the name: the pill describes itself by it
                        aria-describedby={
                            needsValue ? needsValueMarkId : undefined
                        }
                        classNames={{
                            label: filterClasses.label,
                            root: contractClasses?.parameter,
                        }}
                        className={`${filterClasses.button} ${filterClasses.plain} ${classes.parameterPill}${
                            isPicked ? ` ${pillClasses.pickedPill}` : ''
                        }`}
                        leftSection={
                            <Group gap={4} wrap="nowrap">
                                {/* A required filter's mark, before the icon */}
                                {needsValue && (
                                    <Tooltip
                                        fz="xs"
                                        label={getUiString(
                                            'controls.parameter.needsValueTooltip',
                                        )}
                                    >
                                        <span
                                            className={
                                                filterClasses.lockSlotActive
                                            }
                                            data-own-tooltip
                                            aria-hidden
                                        >
                                            <span id={needsValueMarkId} hidden>
                                                {getUiString(
                                                    'controls.parameter.needsValueTooltip',
                                                )}
                                            </span>
                                            <MantineIcon
                                                size="sm"
                                                icon={IconAsterisk}
                                                color="dimmed"
                                                className={
                                                    filterClasses.statusIcon
                                                }
                                            />
                                        </span>
                                    </Tooltip>
                                )}
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
                            </Group>
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
                                        <span
                                            aria-hidden="true"
                                            className={classes.removeSpace}
                                        />
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
                            ) : isNotSet && !showsDefault ? (
                                <Text span c="dimmed">
                                    {getUiString('controls.parameter.isNotSet')}
                                </Text>
                            ) : (
                                <>
                                    <Text span c="dimmed">
                                        {getUiString('parameters.is')}{' '}
                                    </Text>
                                    <Text
                                        span
                                        fw={showsDefault ? undefined : 600}
                                    >
                                        {getParameterDisplayValue(
                                            input.definition,
                                            entry.shownValue,
                                        )}
                                    </Text>
                                </>
                            )}
                        </Text>
                    </Button>
                    {canEdit && (
                        <Tooltip
                            fz="xs"
                            label={getUiString(
                                'controls.parameter.removeParameter',
                            )}
                        >
                            <ActionIcon
                                data-parameter-pill-action
                                size="xs"
                                radius="xl"
                                className={classes.removeAction}
                                aria-label={getUiString(
                                    'controls.parameter.removeParameter',
                                )}
                                onClick={() => remove(control.id)}
                            >
                                <MantineIcon size="sm" icon={IconX} />
                            </ActionIcon>
                        </Tooltip>
                    )}
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
    /** Only these pills, in this order (default every one of the pass, in list order). */
    ids?: string[];
};

// Parameter controls after the filters of the same pass, in list order
export const ParameterPills: FC<Props> = ({
    sectionId,
    isInBarContext = false,
    ids,
}) => {
    const bar = useParameterBarControls();
    const isViewer = useParameterEditorSelector((c) => c.isViewer);
    const editingId = useParameterEditorSelector((c) => c.editingId);
    const isLockedInEmbed = useIsParameterControlLockedInEmbed();
    // A hidden control is an editor's to see; its value still applies.
    // An embed viewer also doesn't see the controls their token keeps from them.
    const passEntries = bar.entries.filter(
        (entry) =>
            !(
                isViewer &&
                (entry.control.hidden || isLockedInEmbed(entry.control))
            ) &&
            (sectionId === undefined ||
                (entry.isNeedsValue
                    ? sectionId === null
                    : entry.sectionId === sectionId)),
    );
    const entries =
        ids === undefined
            ? passEntries
            : ids.flatMap((id) =>
                  passEntries.filter(({ control }) => control.id === id),
              );
    const neighbourIds = entries
        .filter(({ isNeedsValue }) => !isNeedsValue)
        .map(({ control }) => control.id);
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
                    <BarDroppable key={entry.control.id} id={entry.control.id}>
                        <PillDraggable
                            id={entry.control.id}
                            isInBarContext
                            isDisabled={editingId !== null}
                            data={DRAG_DATA}
                            pillSelector={PARAMETER_PILL_SELECTOR}
                        >
                            {pill}
                        </PillDraggable>
                    </BarDroppable>
                );
            })}
        </>
    );
};
