import {
    ActionIcon,
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
} from '@mantine/core';
import {
    IconChevronDown,
    IconSearch,
    IconX,
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
    /** Shows a row that selects/deselects every listed option at once */
    enableSelectAll?: boolean;
    /** Rendered at the top of the dropdown, above the search input */
    headerSection?: ReactNode;
    /** Shows a clear button next to the trigger while there is a selection */
    clearable?: boolean;
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
    enableSelectAll = false,
    headerSection,
    clearable = false,
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

    const selectableValues = [
        ...visibleFlatOptions,
        ...visibleGroups.flatMap((group) => group.options),
    ]
        .filter((option) => option.disabled !== true)
        .map((option) => option.value);

    const showSelectAll =
        enableSelectAll && mode === 'multi' && selectableValues.length > 0;
    const allSelected = selectableValues.every((value) =>
        selectedSet.has(value),
    );
    const someSelected =
        !allSelected &&
        selectableValues.some((value) => selectedSet.has(value));

    const toggleAll = () => {
        const selectableSet = new Set(selectableValues);
        if (allSelected) {
            onChange(selected.filter((value) => !selectableSet.has(value)));
        } else {
            onChange([
                ...selected,
                ...selectableValues.filter((value) => !selectedSet.has(value)),
            ]);
        }
    };

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
                        <Box maw={200} className={classes.optionLabel}>
                            {typeof option.label === 'string' ? (
                                <Text fz="xs" truncate>
                                    {option.label}
                                </Text>
                            ) : (
                                option.label
                            )}
                        </Box>
                    </Group>
                    {option.count !== undefined && (
                        <Text fz="xs" c="dimmed" fw={500}>
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
                        color={hasSelection ? 'ldGray.7' : 'ldGray.5'}
                    />
                ) : undefined
            }
            rightSection={
                <MantineIcon
                    icon={IconChevronDown}
                    size="sm"
                    color={hasSelection ? 'ldGray.7' : 'ldGray.5'}
                />
            }
        >
            <Group gap={6} wrap="nowrap">
                <Text fz="xs" fw={500} c="ldGray.7">
                    {label}
                </Text>
                {hasSelection && (
                    <Badge size="xs" radius="xl" variant="filled">
                        {selected.length}
                    </Badge>
                )}
            </Group>
        </Button>
    );

    const popover = (
        <Popover position="bottom-start" withArrow>
            <Popover.Target>
                {tooltipLabel ? (
                    <Tooltip label={tooltipLabel}>{trigger}</Tooltip>
                ) : (
                    trigger
                )}
            </Popover.Target>
            <Popover.Dropdown p={4} miw={240}>
                {headerSection && (
                    <Box px="xs" pt={4} pb={6}>
                        {headerSection}
                    </Box>
                )}
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
                                <MantineIcon icon={IconSearch} size="md" />
                            }
                            rightSection={
                                loading || loadingMore ? (
                                    <Loader size="xs" />
                                ) : null
                            }
                        />
                    </Box>
                )}
                {showSelectAll && (
                    <UnstyledButton
                        onClick={toggleAll}
                        px="xs"
                        py={6}
                        className={classes.option}
                    >
                        <Group gap="xs" wrap="nowrap">
                            <Checkbox
                                size="xs"
                                checked={allSelected}
                                indeterminate={someSelected}
                                readOnly
                                tabIndex={-1}
                            />
                            <Text fz="xs" fw={500}>
                                {allSelected ? 'Deselect all' : 'Select all'}
                            </Text>
                        </Group>
                    </UnstyledButton>
                )}
                {!hasAnyOption ? (
                    <Text fz="xs" c="dimmed" p="xs">
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

    if (!clearable) return popover;

    return (
        <Group gap={2} wrap="nowrap">
            {popover}
            {hasSelection && (
                <Tooltip label="Clear">
                    <ActionIcon
                        size="xs"
                        color="ldGray.5"
                        aria-label={`Clear ${label} filter`}
                        onClick={() => onChange([])}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default FilterFacet;
