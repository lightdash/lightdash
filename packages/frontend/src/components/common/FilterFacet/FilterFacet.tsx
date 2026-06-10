import {
    Badge,
    Box,
    Button,
    Checkbox,
    Group,
    Loader,
    Popover,
    Radio,
    ScrollArea,
    Stack,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconSearch,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useCallback, useRef, type ReactNode } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './FilterFacet.module.css';

export type FilterFacetOption = {
    value: string;
    label: ReactNode;
    searchLabel?: string;
    count?: number;
    disabled?: boolean;
};

export type FilterFacetGroup = {
    label: string;
    options: FilterFacetOption[];
};

export type FilterFacetMode = 'multi' | 'single';

export type FilterFacetProps = {
    label: string;
    selected: string[];
    onChange: (selected: string[]) => void;
    options?: FilterFacetOption[];
    groups?: FilterFacetGroup[];
    icon?: TablerIcon;
    emptyLabel?: string;
    tooltipLabel?: string;
    loading?: boolean;
    loadingMore?: boolean;
    maxDropdownHeight?: number;
    helperText?: string;
    mode?: FilterFacetMode;
    searchValue?: string;
    onSearchChange?: (value: string) => void;
    searchPlaceholder?: string;
    onScrollEnd?: () => void;
    scrollEndOffset?: number;
};

const isOptionVisible = (
    option: FilterFacetOption,
    selectedSet: Set<string>,
): boolean =>
    option.count === undefined ||
    option.count > 0 ||
    selectedSet.has(option.value);

const FilterFacet = ({
    label,
    options,
    groups,
    selected,
    onChange,
    icon,
    emptyLabel = 'No options',
    tooltipLabel,
    loading,
    loadingMore,
    maxDropdownHeight = 280,
    helperText,
    mode = 'multi',
    searchValue,
    onSearchChange,
    searchPlaceholder = 'Search…',
    onScrollEnd,
    scrollEndOffset = 50,
}: FilterFacetProps) => {
    const selectedSet = new Set(selected);
    const viewportRef = useRef<HTMLDivElement>(null);

    const handleScrollPositionChange = useCallback(
        ({ y }: { x: number; y: number }) => {
            if (!onScrollEnd || !viewportRef.current) return;
            const { scrollHeight, clientHeight } = viewportRef.current;
            if (y >= scrollHeight - clientHeight - scrollEndOffset) {
                onScrollEnd();
            }
        },
        [onScrollEnd, scrollEndOffset],
    );

    const flatOptions: FilterFacetOption[] = options ?? [];
    const visibleFlatOptions = flatOptions.filter((option) =>
        isOptionVisible(option, selectedSet),
    );
    const visibleGroups = (groups ?? [])
        .map((group) => ({
            label: group.label,
            options: group.options.filter((option) =>
                isOptionVisible(option, selectedSet),
            ),
        }))
        .filter((group) => group.options.length > 0);

    const hasAnyOption =
        visibleFlatOptions.length > 0 || visibleGroups.length > 0;

    const toggle = (value: string, disabled?: boolean) => {
        if (disabled) return;
        if (mode === 'single') {
            onChange(selectedSet.has(value) ? [] : [value]);
            return;
        }
        if (selectedSet.has(value)) {
            onChange(selected.filter((v) => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const hasSelection = selected.length > 0;

    const renderOption = (option: FilterFacetOption) => {
        const isChecked = selectedSet.has(option.value);
        const disabled = option.disabled === true;
        return (
            <UnstyledButton
                key={option.value}
                onClick={() => toggle(option.value, disabled)}
                px="xs"
                py={6}
                className={`${classes.option} ${
                    disabled ? classes.optionDisabled : ''
                }`}
                disabled={disabled}
            >
                <Group justify="space-between" wrap="nowrap" gap="md">
                    <Group gap="xs" wrap="nowrap">
                        {mode === 'single' ? (
                            <Radio
                                size="xs"
                                checked={isChecked}
                                readOnly
                                tabIndex={-1}
                                disabled={disabled}
                            />
                        ) : (
                            <Checkbox
                                size="xs"
                                checked={isChecked}
                                readOnly
                                tabIndex={-1}
                                disabled={disabled}
                            />
                        )}
                        <Box maw={200} style={{ overflow: 'hidden' }}>
                            {typeof option.label === 'string' ? (
                                <Text fz="xs" c="ldGray.9" truncate>
                                    {option.label}
                                </Text>
                            ) : (
                                option.label
                            )}
                        </Box>
                    </Group>
                    {option.count !== undefined && (
                        <Text fz="xs" c="ldGray.6" fw={500}>
                            {option.count}
                        </Text>
                    )}
                </Group>
            </UnstyledButton>
        );
    };

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
            <Popover.Dropdown p={4} miw={240}>
                {helperText && (
                    <Text fz="xs" c="dimmed" px="xs" py={4}>
                        {helperText}
                    </Text>
                )}
                {onSearchChange && (
                    <Box px={4} pt={4} pb={6}>
                        <TextInput
                            size="xs"
                            autoFocus
                            placeholder={searchPlaceholder}
                            value={searchValue ?? ''}
                            onChange={(e) =>
                                onSearchChange(e.currentTarget.value)
                            }
                            leftSection={
                                <MantineIcon icon={IconSearch} size="xs" />
                            }
                            rightSection={
                                loading || loadingMore ? (
                                    <Loader size="xs" />
                                ) : null
                            }
                        />
                    </Box>
                )}
                {!hasAnyOption ? (
                    <Text fz="xs" c="ldGray.6" p="xs">
                        {emptyLabel}
                    </Text>
                ) : (
                    <ScrollArea.Autosize
                        mah={maxDropdownHeight}
                        type="auto"
                        scrollbars="y"
                        viewportRef={viewportRef}
                        onScrollPositionChange={
                            onScrollEnd ? handleScrollPositionChange : undefined
                        }
                    >
                        <Stack gap={0}>
                            {visibleFlatOptions.map(renderOption)}
                            {visibleGroups.map((group) => (
                                <Stack key={group.label} gap={0} mt={4}>
                                    <Text className={classes.groupLabel}>
                                        {group.label}
                                    </Text>
                                    {group.options.map(renderOption)}
                                </Stack>
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                )}
            </Popover.Dropdown>
        </Popover>
    );
};

export default FilterFacet;
