import {
    Badge,
    Button,
    Checkbox,
    Group,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import { IconChevronDown } from '@tabler/icons-react';
import { type Icon as TablerIcon } from '@tabler/icons-react';
import MantineIcon from '../MantineIcon';
import classes from './FilterFacet.module.css';

export type FilterFacetOption = {
    value: string;
    label: string;
    count?: number;
};

export type FilterFacetProps = {
    label: string;
    options: FilterFacetOption[];
    selected: string[];
    onChange: (selected: string[]) => void;
    icon?: TablerIcon;
    emptyLabel?: string;
    tooltipLabel?: string;
    loading?: boolean;
    maxDropdownHeight?: number;
};

const FilterFacet = ({
    label,
    options,
    selected,
    onChange,
    icon,
    emptyLabel = 'No options',
    tooltipLabel,
    loading,
    maxDropdownHeight = 280,
}: FilterFacetProps) => {
    const selectedSet = new Set(selected);
    const visibleOptions = options.filter(
        (option) =>
            option.count === undefined ||
            option.count > 0 ||
            selectedSet.has(option.value),
    );

    const toggle = (value: string) => {
        if (selectedSet.has(value)) {
            onChange(selected.filter((v) => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const hasSelection = selected.length > 0;

    const trigger = (
        <Button
            variant="default"
            size="xs"
            radius="md"
            loading={loading}
            className={
                hasSelection
                    ? classes.filterButtonSelected
                    : classes.filterButton
            }
            leftSection={
                icon ? (
                    <MantineIcon
                        icon={icon}
                        size="md"
                        color={hasSelection ? 'indigo.5' : 'ldGray.5'}
                    />
                ) : undefined
            }
            rightSection={
                <MantineIcon
                    icon={IconChevronDown}
                    size="sm"
                    color={hasSelection ? 'indigo.5' : 'ldGray.5'}
                />
            }
        >
            <Group gap={6} wrap="nowrap">
                <Text
                    fz="xs"
                    fw={500}
                    c={hasSelection ? 'indigo.7' : 'ldGray.7'}
                >
                    {label}
                </Text>
                {hasSelection && (
                    <Badge size="xs" radius="xl" variant="light" color="indigo">
                        {selected.length}
                    </Badge>
                )}
            </Group>
        </Button>
    );

    return (
        <Popover position="bottom-start" withArrow shadow="md" radius="md">
            <Popover.Target>
                {tooltipLabel ? (
                    <Tooltip withinPortal variant="xs" label={tooltipLabel}>
                        {trigger}
                    </Tooltip>
                ) : (
                    trigger
                )}
            </Popover.Target>
            <Popover.Dropdown p={4} miw={220}>
                {visibleOptions.length === 0 ? (
                    <Text fz="xs" c="ldGray.6" p="xs">
                        {emptyLabel}
                    </Text>
                ) : (
                    <ScrollArea.Autosize
                        mah={maxDropdownHeight}
                        type="auto"
                        scrollbars="y"
                    >
                        <Stack gap={0}>
                            {visibleOptions.map((option) => {
                                const isChecked = selectedSet.has(option.value);
                                return (
                                    <UnstyledButton
                                        key={option.value}
                                        onClick={() => toggle(option.value)}
                                        px="xs"
                                        py={6}
                                        className={classes.option}
                                    >
                                        <Group
                                            justify="space-between"
                                            wrap="nowrap"
                                            gap="md"
                                        >
                                            <Group gap="xs" wrap="nowrap">
                                                <Checkbox
                                                    size="xs"
                                                    checked={isChecked}
                                                    readOnly
                                                    tabIndex={-1}
                                                />
                                                <Text
                                                    fz="xs"
                                                    c="ldGray.9"
                                                    truncate
                                                    maw={200}
                                                >
                                                    {option.label}
                                                </Text>
                                            </Group>
                                            {option.count !== undefined && (
                                                <Text
                                                    fz="xs"
                                                    c="ldGray.6"
                                                    fw={500}
                                                >
                                                    {option.count}
                                                </Text>
                                            )}
                                        </Group>
                                    </UnstyledButton>
                                );
                            })}
                        </Stack>
                    </ScrollArea.Autosize>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterFacet;
