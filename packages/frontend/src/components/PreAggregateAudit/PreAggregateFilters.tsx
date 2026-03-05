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
import type { FC } from 'react';
import {
    ALL_QUERY_TYPES,
    formatMissReason,
    QUERY_TYPE_LABELS,
    type QueryType,
} from './preAggregateHelpers';
import classes from './PreAggregateStatsTable.module.css';

// --- Query Type Filter ---

type QueryTypeFilterProps = {
    selected: QueryType | null;
    onChange: (value: QueryType | null) => void;
};

export const QueryTypeFilter: FC<QueryTypeFilterProps> = ({
    selected,
    onChange,
}) => {
    const hasSelection = selected !== null;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip withinPortal variant="xs" label="Filter by query type">
                    <Button
                        h={32}
                        c="foreground"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
                        px="sm"
                        className={
                            hasSelection
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        rightSection={
                            hasSelection ? (
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
                        Type
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldDark.3" fw={600}>
                        Filter by type:
                    </Text>
                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Radio.Group
                            value={selected ?? ''}
                            onChange={(v) => onChange(v as QueryType)}
                        >
                            <Stack gap="xs">
                                {ALL_QUERY_TYPES.map((type) => (
                                    <Radio
                                        key={type}
                                        value={type}
                                        label={QUERY_TYPE_LABELS[type]}
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

// --- Explore Filter ---

type ExploreFilterProps = {
    explores: string[];
    selected: string | null;
    onChange: (value: string | null) => void;
};

export const ExploreFilter: FC<ExploreFilterProps> = ({
    explores,
    selected,
    onChange,
}) => {
    const hasSelection = selected !== null;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip withinPortal variant="xs" label="Filter by explore">
                    <Button
                        h={32}
                        c="foreground"
                        fw={500}
                        fz="sm"
                        variant="default"
                        radius="md"
                        px="sm"
                        className={
                            hasSelection
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        rightSection={
                            hasSelection ? (
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
                        Explore
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldDark.3" fw={600}>
                        Filter by explore:
                    </Text>
                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Radio.Group
                            value={selected ?? ''}
                            onChange={(v) => onChange(v || null)}
                        >
                            <Stack gap="xs">
                                {explores.map((explore) => (
                                    <Radio
                                        key={explore}
                                        value={explore}
                                        label={explore}
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

// --- Pre-aggregate Filter ---

type PreAggregateFilterProps = {
    names: string[];
    selected: string | null;
    onChange: (value: string | null) => void;
};

export const PreAggregateFilter: FC<PreAggregateFilterProps> = ({
    names,
    selected,
    onChange,
}) => {
    const hasSelection = selected !== null;

    return (
        <Popover width={250} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter by pre-aggregate"
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
                            hasSelection
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        rightSection={
                            hasSelection ? (
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
                        Pre-aggregate
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldDark.3" fw={600}>
                        Filter by pre-aggregate:
                    </Text>
                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Radio.Group
                            value={selected ?? ''}
                            onChange={(v) => onChange(v || null)}
                        >
                            <Stack gap="xs">
                                {names.map((name) => (
                                    <Radio
                                        key={name}
                                        value={name}
                                        label={name}
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

// --- Miss Reason Filter ---

type MissReasonFilterProps = {
    reasons: string[];
    selected: string | null;
    onChange: (value: string | null) => void;
};

export const MissReasonFilter: FC<MissReasonFilterProps> = ({
    reasons,
    selected,
    onChange,
}) => {
    const hasSelection = selected !== null;

    return (
        <Popover width={280} position="bottom-start">
            <Popover.Target>
                <Tooltip
                    withinPortal
                    variant="xs"
                    label="Filter by miss reason"
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
                            hasSelection
                                ? classes.filterButtonSelected
                                : classes.filterButton
                        }
                        rightSection={
                            hasSelection ? (
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
                        Reason
                    </Button>
                </Tooltip>
            </Popover.Target>
            <Popover.Dropdown p="sm">
                <Stack gap={4}>
                    <Text fz="xs" c="ldDark.3" fw={600}>
                        Filter by miss reason:
                    </Text>
                    <ScrollArea.Autosize mah={200} type="always" scrollbars="y">
                        <Radio.Group
                            value={selected ?? ''}
                            onChange={(v) => onChange(v || null)}
                        >
                            <Stack gap="xs">
                                {reasons.map((reason) => (
                                    <Radio
                                        key={reason}
                                        value={reason}
                                        label={formatMissReason(reason)}
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
