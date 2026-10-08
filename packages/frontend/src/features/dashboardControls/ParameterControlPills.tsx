import {
    FilterType,
    getAllowedParameterValue,
    resolveParameterDefault,
    type DashboardParameterControl,
    type LightdashProjectParameter,
    type ParameterValue,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import Parameter from '../parameters/components/Parameter';
import parameterClasses from '../parameters/components/Parameter.module.css';
import { ParameterInput } from '../parameters/components/ParameterInput';
import { ShadowedReservedNameWarning } from '../parameters/components/ShadowedReservedNameWarning';
import classes from './FilterPills.module.css';
import {
    getControlKeysSetOnTile,
    getControlValue,
    getParameterKind,
    getParameterLabel,
} from './parameterControls';
import { useControlsSidebarSelector } from './useControlsSidebar';

type Props = {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    /** Required parameters that have no value yet. */
    missingRequiredParameters: string[];
    shadowedReservedNames: string[];
};

type PillProps = Pick<
    Props,
    'isEditMode' | 'missingRequiredParameters' | 'shadowedReservedNames'
> & {
    control: DashboardParameterControl;
};

const formatValue = (
    value: ParameterValue | undefined,
    kind: FilterType,
): string | null => {
    if (value === undefined) return null;
    if (Array.isArray(value)) return value.join(', ');
    if (kind === FilterType.DATE && dayjs(String(value)).isValid()) {
        return dayjs(String(value)).format('MMMM D, YYYY');
    }
    return String(value);
};

const ControlPill: FC<PillProps> = ({
    control,
    isEditMode,
    missingRequiredParameters,
    shadowedReservedNames,
}) => {
    const getUiString = useUiStrings();
    const isSelected = useControlsSidebarSelector(
        (c) => c.editingControl?.id === control.id,
    );
    const isSidebarOpen = useControlsSidebarSelector((c) => c.isSidebarOpen);
    const openControl = useControlsSidebarSelector((c) => c.openControl);
    const removeControlById = useControlsSidebarSelector(
        (c) => c.removeControlById,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const [opened, setOpened] = useState(false);

    const [firstKey] = control.parameterKeys;
    const definition =
        firstKey === undefined ? undefined : parameterDefinitions[firstKey];
    // An unnamed control reads as its parameter, like its editor's title
    const label =
        control.label ||
        (firstKey === undefined
            ? 'Parameter control'
            : getParameterLabel(firstKey, parameterDefinitions));
    // As on the shipped pill, a value outside the fixed options is unset
    const rawValue = getControlValue(control, parameterValues);
    const allowedValue =
        rawValue == null
            ? null
            : getAllowedParameterValue(definition, rawValue);
    const hasValue = allowedValue !== null && allowedValue !== '';
    const value = formatValue(
        hasValue
            ? allowedValue
            : definition && resolveParameterDefault(definition),
        definition ? getParameterKind(definition) : FilterType.STRING,
    );
    const isUnsetRequired =
        !hasValue &&
        control.parameterKeys.some((key) =>
            missingRequiredParameters.includes(key),
        );
    const shadowedKeys = control.parameterKeys.filter((key) =>
        shadowedReservedNames.includes(key),
    );
    const description = control.parameterKeys
        .map((key) => parameterDefinitions[key]?.description)
        .find((text) => !!text);
    const canRemove = isEditMode && !isSidebarOpen;
    const canClear = !isEditMode && hasValue;
    const setEveryKey = (next: ParameterValue | null) =>
        control.parameterKeys.forEach((key) => setParameter(key, next));

    const button = (
        <Button
            size="xs"
            variant={isUnsetRequired ? 'outline' : 'default'}
            aria-pressed={isSelected}
            classNames={{ label: pillClasses.label }}
            className={[
                pillClasses.button,
                isUnsetRequired ? parameterClasses.unsetRequired : '',
                isSelected ? classes.selectedPill : '',
            ].join(' ')}
            rightSection={
                (shadowedKeys.length > 0 || canRemove || canClear) && (
                    <Group gap={4} wrap="nowrap">
                        {shadowedKeys.map((key) => (
                            <ShadowedReservedNameWarning
                                key={key}
                                paramKey={key}
                            />
                        ))}
                        {canRemove && (
                            <Tooltip fz="xs" label="Remove control">
                                <ActionIcon
                                    size="xs"
                                    radius="xl"
                                    aria-label="Remove control"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeControlById(control.id);
                                    }}
                                >
                                    <MantineIcon icon={IconX} size="sm" />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        {canClear && (
                            <ActionIcon
                                size="xs"
                                radius="xl"
                                aria-label={getUiString('parameters.clear')}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEveryKey(null);
                                }}
                            >
                                <MantineIcon icon={IconX} size="sm" />
                            </ActionIcon>
                        )}
                    </Group>
                )
            }
            onClick={() =>
                isEditMode ? openControl(control.id) : setOpened((o) => !o)
            }
        >
            <Text fz="inherit" span>
                <Text fw={600} span>
                    {label}
                </Text>{' '}
                {value === null ? (
                    <Text span c="dimmed">
                        {'· no value'}
                    </Text>
                ) : (
                    <>is {value}</>
                )}
            </Text>
        </Button>
    );

    const pill = (
        <Tooltip
            label={description}
            disabled={!description || opened}
            position="top"
            maw={350}
        >
            <Box className={classes.pill}>{button}</Box>
        </Tooltip>
    );

    if (isEditMode || definition === undefined || firstKey === undefined) {
        return pill;
    }

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            shadow="md"
            withinPortal
        >
            <Popover.Target>{pill}</Popover.Target>
            <Popover.Dropdown p="xs" miw={240}>
                <ParameterInput
                    paramKey={firstKey}
                    parameter={definition}
                    value={hasValue ? allowedValue : null}
                    onParameterChange={(_key, next) => setEveryKey(next)}
                    size="xs"
                    projectUuid={projectUuid}
                    parameterValues={parameterValues}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

type SinglePillProps = {
    control: DashboardParameterControl;
    paramKey: string;
    definition: LightdashProjectParameter;
    isRequired: boolean;
    shadowedReservedNames: string[];
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
};

// A control on one parameter is, for a viewer, that parameter under the
// control's label: the shipped pill with its clear X, tooltip and warnings
const SingleParameterPill: FC<SinglePillProps> = ({
    control,
    paramKey,
    definition,
    isRequired,
    shadowedReservedNames,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
}) => {
    const getUiString = useUiStrings();
    const value = useDashboardContext(
        (c) => c.parameterValues[paramKey] ?? null,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const labelled = useMemo(
        () => ({ ...definition, label: control.label || definition.label }),
        [definition, control.label],
    );
    return (
        <Parameter
            paramKey={paramKey}
            parameter={labelled}
            value={value}
            parameterValues={parameterValues}
            openPopoverId={openPopoverId}
            onPopoverOpen={onPopoverOpen}
            onPopoverClose={onPopoverClose}
            onParameterChange={setParameter}
            projectUuid={projectUuid}
            isRequired={isRequired}
            triggerClassName={pillClasses.button}
            shadowedReservedNames={shadowedReservedNames}
            getUiString={getUiString}
        />
    );
};

export const ParameterControlPills: FC<Props> = ({
    isEditMode,
    activeTabUuid,
    missingRequiredParameters,
    shadowedReservedNames,
}) => {
    const editingControlId = useControlsSidebarSelector(
        (c) => c.editingControl?.id,
    );
    const parameterControls = useDashboardContext((c) => c.parameterControls);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const closePopover = useCallback(() => setOpenPopoverId(undefined), []);

    const controlsOnTab = useMemo(() => {
        if (activeTabUuid === undefined) return parameterControls;
        const tiles = (dashboardTiles ?? []).filter(
            (tile) => tile.tabUuid === activeTabUuid,
        );
        // Until a tile on the tab reports its parameters, nothing can be ruled out
        const hasReferences = tiles.some(
            (tile) => tileParameterReferences[tile.uuid] !== undefined,
        );
        if (!hasReferences) return parameterControls;
        return parameterControls.filter(
            (control) =>
                control.id === editingControlId ||
                tiles.some(
                    (tile) =>
                        getControlKeysSetOnTile(
                            control,
                            tile,
                            tileParameterReferences,
                        ).length > 0,
                ),
        );
    }, [
        parameterControls,
        dashboardTiles,
        activeTabUuid,
        tileParameterReferences,
        editingControlId,
    ]);

    return (
        <>
            {controlsOnTab.map((control) => {
                const [paramKey, ...otherKeys] = control.parameterKeys;
                const definition =
                    paramKey === undefined
                        ? undefined
                        : parameterDefinitions[paramKey];
                if (
                    !isEditMode &&
                    paramKey !== undefined &&
                    otherKeys.length === 0 &&
                    definition !== undefined
                ) {
                    return (
                        <SingleParameterPill
                            key={control.id}
                            control={control}
                            paramKey={paramKey}
                            definition={definition}
                            isRequired={missingRequiredParameters.includes(
                                paramKey,
                            )}
                            shadowedReservedNames={shadowedReservedNames}
                            openPopoverId={openPopoverId}
                            onPopoverOpen={setOpenPopoverId}
                            onPopoverClose={closePopover}
                        />
                    );
                }
                return (
                    <ControlPill
                        key={control.id}
                        control={control}
                        isEditMode={isEditMode}
                        missingRequiredParameters={missingRequiredParameters}
                        shadowedReservedNames={shadowedReservedNames}
                    />
                );
            })}
        </>
    );
};
