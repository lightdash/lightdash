import {
    FilterType,
    resolveParameterDefault,
    type DashboardParameterControl,
    type ParameterValue,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Popover, Text, Tooltip } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { ParameterInput } from '../parameters/components/ParameterInput';
import classes from './FilterPills.module.css';
import {
    getControlKeysSetOnTile,
    getControlValue,
    getParameterKind,
} from './parameterControls';
import { useControlsSidebar } from './useControlsSidebar';

type Props = {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
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

const ControlPill: FC<{
    control: DashboardParameterControl;
    isEditMode: boolean;
}> = ({ control, isEditMode }) => {
    const { editingControl, isSidebarOpen, openControl, removeControlById } =
        useControlsSidebar();
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const [opened, setOpened] = useState(false);

    const label = control.label || 'New parameter control';
    const [firstKey] = control.parameterKeys;
    const definition =
        firstKey === undefined ? undefined : parameterDefinitions[firstKey];
    const value = formatValue(
        getControlValue(control, parameterValues) ??
            (definition && resolveParameterDefault(definition)),
        definition ? getParameterKind(definition) : FilterType.STRING,
    );
    const isSelected = editingControl?.id === control.id;

    const button = (
        <Button
            size="xs"
            variant="default"
            aria-pressed={isSelected}
            classNames={{ label: pillClasses.label }}
            className={[
                pillClasses.button,
                isSelected ? classes.selectedPill : '',
            ].join(' ')}
            rightSection={
                isEditMode &&
                !isSidebarOpen && (
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
                        {'\u00b7 no value'}
                    </Text>
                ) : (
                    <>is {value}</>
                )}
            </Text>
        </Button>
    );

    if (isEditMode || definition === undefined || firstKey === undefined) {
        return <Box className={classes.pill}>{button}</Box>;
    }

    return (
        <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-start"
            shadow="md"
            withinPortal
        >
            <Popover.Target>
                <Box className={classes.pill}>{button}</Box>
            </Popover.Target>
            <Popover.Dropdown p="xs" miw={240}>
                <ParameterInput
                    paramKey={firstKey}
                    parameter={definition}
                    value={parameterValues[firstKey] ?? null}
                    onParameterChange={(_key, next) =>
                        control.parameterKeys.forEach((key) =>
                            setParameter(key, next),
                        )
                    }
                    size="xs"
                    projectUuid={projectUuid}
                    parameterValues={parameterValues}
                />
            </Popover.Dropdown>
        </Popover>
    );
};

export const ParameterControlPills: FC<Props> = ({
    isEditMode,
    activeTabUuid,
}) => {
    const { editingControl } = useControlsSidebar();
    const parameterControls = useDashboardContext((c) => c.parameterControls);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );

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
                control.id === editingControl?.id ||
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
        editingControl?.id,
    ]);

    return (
        <>
            {controlsOnTab.map((control) => (
                <ControlPill
                    key={control.id}
                    control={control}
                    isEditMode={isEditMode}
                />
            ))}
        </>
    );
};
