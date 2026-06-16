import {
    ActionIcon,
    Button,
    Group,
    Popover,
    Radio,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
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
    const buttonLabel = useMemo(
        () => (selectedSource ? SOURCE_LABELS[selectedSource] : 'Source'),
        [selectedSource],
    );

    const handleSourceChange = (value: string) => {
        setSelectedSource(value as CompilationSource);
    };

    return (
        <Group gap={2} wrap="nowrap">
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
                                    ? `${classes.filterButton} ${classes.filterButtonSelected}`
                                    : classes.filterButton
                            }
                            classNames={{
                                label: classes.filterButtonLabel,
                            }}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack gap={4}>
                        <Text fz="xs" c="ldDark.3" fw={600}>
                            Filter by source:
                        </Text>

                        <ScrollArea.Autosize
                            mah={200}
                            type="always"
                            scrollbars="y"
                        >
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
            {hasSelectedSource && (
                <Tooltip label="Clear source filter">
                    <ActionIcon
                        aria-label="Clear source filter"
                        size="xs"
                        color="ldGray.5"
                        variant="subtle"
                        onClick={() => setSelectedSource(null)}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default CompilationSourceFilter;
