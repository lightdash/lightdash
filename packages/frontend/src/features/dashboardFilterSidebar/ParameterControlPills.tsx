import { FilterType, type ParameterValue } from '@lightdash/common';
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
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import pillClasses from '../dashboardFilters/ActiveFilters/Filter.module.css';
import { ParameterInput } from '../parameters/components/ParameterInput';
import classes from './FilterSidebar.module.css';
import {
    doesControlApplyToTile,
    getControlValue,
    type ParameterControl,
} from './parameterControls';
import { useFilterSidebar } from './useFilterSidebar';

type Props = {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
};

const formatValue = (
    value: ParameterValue | null | undefined,
    kind: FilterType,
): string | null => {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.join(', ');
    if (kind === FilterType.DATE && dayjs(String(value)).isValid()) {
        return dayjs(String(value)).format('MMMM D, YYYY');
    }
    return String(value);
};

const ControlPill: FC<{
    control: ParameterControl;
    isEditMode: boolean;
}> = ({ control, isEditMode }) => {
    const {
        editingControlId,
        isSidebarOpen,
        openControl,
        removeControl,
        cancelControl,
        setControlValue,
    } = useFilterSidebar();
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    const [opened, setOpened] = useState(false);

    const isDraft = control.label === '';
    const label = isDraft ? 'New control' : control.label;
    const [firstKey] = control.parameterKeys;
    const definition =
        firstKey === undefined ? undefined : parameterDefinitions[firstKey];
    const value = formatValue(
        getControlValue(control, parameterValues) ?? definition?.default,
        control.kind,
    );
    const isSelected = editingControlId === control.id;

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
                    <Group gap={2} wrap="nowrap">
                        <Tooltip
                            fz="xs"
                            label={
                                isDraft ? 'Discard control' : 'Remove control'
                            }
                        >
                            <ActionIcon
                                size="xs"
                                radius="xl"
                                aria-label={
                                    isDraft
                                        ? 'Discard control'
                                        : 'Remove control'
                                }
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (isDraft) cancelControl();
                                    else removeControl(control.id);
                                }}
                            >
                                <MantineIcon icon={IconX} size="sm" />
                            </ActionIcon>
                        </Tooltip>
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
                        · no value
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
                        setControlValue(control.id, next)
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
    const { parameterControls } = useFilterSidebar();
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );

    const controlsOnTab = useMemo(() => {
        const tiles = (dashboardTiles ?? []).filter(
            (tile) =>
                activeTabUuid === undefined || tile.tabUuid === activeTabUuid,
        );
        return parameterControls.filter((control) =>
            tiles.some((tile) =>
                doesControlApplyToTile(control, tile, tileParameterReferences),
            ),
        );
    }, [
        parameterControls,
        dashboardTiles,
        activeTabUuid,
        tileParameterReferences,
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
