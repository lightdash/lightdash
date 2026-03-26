import { SchedulerFormat } from '@lightdash/common';
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
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import classes from './FormatFilter.module.css';

type FormatFilterProps = Pick<
    ReturnType<typeof useSchedulerFilters>,
    'selectedFormats' | 'setSelectedFormats'
>;

const FORMAT_LABELS: Record<SchedulerFormat, string> = {
    [SchedulerFormat.CSV]: '.csv',
    [SchedulerFormat.XLSX]: '.xlsx',
    [SchedulerFormat.IMAGE]: 'Image',
    [SchedulerFormat.GSHEETS]: 'Google Sheets',
};

const FormatFilter: FC<FormatFilterProps> = ({
    selectedFormats,
    setSelectedFormats,
}) => {
    const allFormats = Object.values(SchedulerFormat);
    const hasSelectedFormats = selectedFormats.length > 0;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter schedulers by format"
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
                            hasSelectedFormats
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedFormats ? (
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
                                    {selectedFormats.length}
                                </Badge>
                            ) : null
                        }
                    >
                        Format
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldGray.9" fw={600}>
                        Filter by format:
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Stack gap="xs">
                            {allFormats.map((format) => (
                                <Checkbox
                                    key={format}
                                    label={FORMAT_LABELS[format]}
                                    checked={selectedFormats.includes(format)}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() => {
                                        if (selectedFormats.includes(format)) {
                                            setSelectedFormats(
                                                selectedFormats.filter(
                                                    (f) => f !== format,
                                                ),
                                            );
                                        } else {
                                            setSelectedFormats([
                                                ...selectedFormats,
                                                format,
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

export default FormatFilter;
