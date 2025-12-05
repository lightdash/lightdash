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
import { type DestinationType } from '../../../features/scheduler/hooks/useSchedulerFilters';
import classes from './FormatFilter.module.css';

interface DestinationFilterProps {
    selectedDestinations: DestinationType[];
    setSelectedDestinations: (destinations: DestinationType[]) => void;
    availableDestinations: DestinationType[];
}

const DESTINATION_LABELS: Record<DestinationType, string> = {
    slack: 'Slack',
    email: 'Email',
    msteams: 'MS Teams',
};

const DestinationFilter: FC<DestinationFilterProps> = ({
    selectedDestinations,
    setSelectedDestinations,
    availableDestinations,
}) => {
    const hasSelectedDestinations = selectedDestinations.length > 0;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter by destination type"
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
                            hasSelectedDestinations
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        classNames={{
                            label: classes.buttonLabel,
                        }}
                        rightSection={
                            hasSelectedDestinations ? (
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
                                    {selectedDestinations.length}
                                </Badge>
                            ) : null
                        }
                    >
                        Destination
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldGray.9" fw={600}>
                        Filter by destination:
                    </Text>

                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Stack gap="xs">
                            {availableDestinations.map((destination) => (
                                <Checkbox
                                    key={destination}
                                    label={DESTINATION_LABELS[destination]}
                                    checked={selectedDestinations.includes(
                                        destination,
                                    )}
                                    size="xs"
                                    classNames={{
                                        body: classes.checkboxBody,
                                        input: classes.checkboxInput,
                                        label: classes.checkboxLabel,
                                    }}
                                    onChange={() => {
                                        if (
                                            selectedDestinations.includes(
                                                destination,
                                            )
                                        ) {
                                            setSelectedDestinations(
                                                selectedDestinations.filter(
                                                    (d) => d !== destination,
                                                ),
                                            );
                                        } else {
                                            setSelectedDestinations([
                                                ...selectedDestinations,
                                                destination,
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

export default DestinationFilter;
