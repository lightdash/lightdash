import { SchedulerRunStatus } from '@lightdash/common';
import {
    Badge,
    Button,
    Checkbox,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { type FC } from 'react';
import { type useLogsFilters } from '../../../features/scheduler/hooks/useLogsFilters';
import classes from './FormatFilter.module.css';

type StatusFilterProps = Pick<
    ReturnType<typeof useLogsFilters>,
    'selectedStatuses' | 'setSelectedStatuses'
>;

const STATUS_LABELS: Record<SchedulerRunStatus, string> = {
    [SchedulerRunStatus.COMPLETED]: 'Completed',
    [SchedulerRunStatus.PARTIAL_FAILURE]: 'Partial Failure',
    [SchedulerRunStatus.FAILED]: 'Failed',
    [SchedulerRunStatus.RUNNING]: 'Running',
    [SchedulerRunStatus.SCHEDULED]: 'Scheduled',
};

const StatusFilter: FC<StatusFilterProps> = ({
    selectedStatuses,
    setSelectedStatuses,
}) => {
    const filterableStatuses = Object.values(SchedulerRunStatus).filter(
        (status) => status !== SchedulerRunStatus.SCHEDULED,
    );
    const hasSelectedStatuses = selectedStatuses.length > 0;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter runs by status"
                >
                    <Button
                        h={32}
                        c="foreground"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
                        px="sm"
                        className={
                            hasSelectedStatuses
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedStatuses ? (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="indigo.6"
                                    circle
                                    styles={{
                                        root: {
                                            minWidth: 18,
                                            height: 18,
                                            padding: '0 4px',
                                        },
                                    }}
                                >
                                    {selectedStatuses.length}
                                </Badge>
                            ) : null
                        }
                    >
                        Status
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldGray.9" fw={600}>
                        Filter by status:
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Stack gap="xs">
                            {filterableStatuses.map((status) => (
                                <Checkbox
                                    key={status}
                                    label={STATUS_LABELS[status]}
                                    checked={selectedStatuses.includes(status)}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() => {
                                        if (selectedStatuses.includes(status)) {
                                            setSelectedStatuses(
                                                selectedStatuses.filter(
                                                    (s) => s !== status,
                                                ),
                                            );
                                        } else {
                                            setSelectedStatuses([
                                                ...selectedStatuses,
                                                status,
                                            ]);
                                        }
                                    }}
                                />
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default StatusFilter;
