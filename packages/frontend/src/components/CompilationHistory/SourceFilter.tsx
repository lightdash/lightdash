import {
    Badge,
    Button,
    Popover,
    Radio,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { type FC } from 'react';
import classes from './SourceFilter.module.css';
import { ALL_SOURCES, SOURCE_LABELS, type CompilationSource } from './types';

type CompilationSourceFilterProps = {
    selectedSource: CompilationSource | null;
    setSelectedSource: (source: CompilationSource | null) => void;
};

const CompilationSourceFilter: FC<CompilationSourceFilterProps> = ({
    selectedSource,
    setSelectedSource,
}) => {
    const hasSelectedSource = selectedSource !== null;

    const handleSourceChange = (value: string) => {
        setSelectedSource(value as CompilationSource);
    };

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter logs by source"
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
                            hasSelectedSource
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        rightSection={
                            hasSelectedSource ? (
                                <Badge
                                    size="xs"
                                    variant="filled"
                                    color="indigo.6"
                                    circle
                                >
                                    1
                                </Badge>
                            ) : null
                        }
                    >
                        Source
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldDark.3" fw={600}>
                        Filter by source:
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Radio.Group
                            value={selectedSource ?? ''}
                            onChange={handleSourceChange}
                        >
                            <Stack gap="xs">
                                {ALL_SOURCES.map((source) => (
                                    <Radio
                                        key={source}
                                        value={source}
                                        label={SOURCE_LABELS[source]}
                                        size="xs"
                                    />
                                ))}
                            </Stack>
                        </Radio.Group>
                    </ScrollArea.Autosize>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default CompilationSourceFilter;
