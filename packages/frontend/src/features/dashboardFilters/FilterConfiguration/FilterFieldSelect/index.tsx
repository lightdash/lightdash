import {
    getItemId,
    getItemLabelWithoutTableName,
    isField,
    type DashboardTab,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Box,
    Combobox,
    Group,
    InputBase,
    Text,
    Tooltip,
    useCombobox,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine-8/hooks';
import { IconSearch, IconSelector } from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef, useState, type FC } from 'react';
import FieldIcon from '../../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../../components/common/MantineIcon';
import styles from './FilterFieldSelect.module.css';
import { useFilterFieldSections } from './useFilterFieldSections';

interface FilterFieldSelectProps {
    fields: FilterableDimension[];
    availableTileFilters: Record<string, FilterableDimension[]>;
    tiles: DashboardTile[];
    tabs: DashboardTab[];
    activeTabUuid: string | undefined;
    selectedField: FilterableDimension | undefined;
    onChange: (field: FilterableDimension) => void;
    popoverProps?: {
        onOpen?: () => void;
        onClose?: () => void;
    };
}

// Flattened virtual list item types
type VirtualItem =
    | { type: 'section-header'; label: string; dimmed: boolean }
    | { type: 'group-header'; label: string; dimmed: boolean }
    | { type: 'field'; field: FilterableDimension; dimmed: boolean };

const FIELD_HEIGHT = 32;
const GROUP_HEADER_HEIGHT = 28;
const SECTION_HEADER_HEIGHT = 30;
const DROPDOWN_MAX_HEIGHT = 300;

const FilterFieldSelect: FC<FilterFieldSelectProps> = ({
    fields,
    availableTileFilters,
    tiles,
    tabs,
    activeTabUuid,
    selectedField,
    onChange,
    popoverProps,
}) => {
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 150);
    const searchRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const combobox = useCombobox({
        onDropdownOpen: () => {
            combobox.resetSelectedOption();
            popoverProps?.onOpen?.();
        },
        onDropdownClose: () => {
            combobox.resetSelectedOption();
            setSearch('');
            popoverProps?.onClose?.();
        },
    });

    const sections = useFilterFieldSections({
        fields,
        availableTileFilters,
        tiles,
        tabs,
        activeTabUuid,
        search: debouncedSearch,
    });

    const hasMultipleTabs = tabs.length > 1 && !!activeTabUuid;

    // Flatten sections into virtual items
    const virtualItems = useMemo((): VirtualItem[] => {
        const items: VirtualItem[] = [];

        for (const section of sections) {
            if (hasMultipleTabs && section.label) {
                items.push({
                    type: 'section-header',
                    label: section.label,
                    dimmed: section.dimmed,
                });
            }

            for (const group of section.groups) {
                items.push({
                    type: 'group-header',
                    label: group.tableLabel,
                    dimmed: section.dimmed,
                });

                for (const field of group.fields) {
                    items.push({
                        type: 'field',
                        field,
                        dimmed: section.dimmed,
                    });
                }
            }
        }

        return items;
    }, [sections, hasMultipleTabs]);

    const totalFields = virtualItems.filter((i) => i.type === 'field').length;

    const getItemSize = useCallback(
        (index: number) => {
            const item = virtualItems[index];
            if (!item) return FIELD_HEIGHT;
            switch (item.type) {
                case 'section-header':
                    return SECTION_HEADER_HEIGHT;
                case 'group-header':
                    return GROUP_HEADER_HEIGHT;
                case 'field':
                    return FIELD_HEIGHT;
            }
        },
        [virtualItems],
    );

    const virtualizer = useVirtualizer({
        count: virtualItems.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: getItemSize,
        overscan: 10,
    });

    const handleOptionSubmit = (value: string) => {
        const field = fields.find((f) => getItemId(f) === value);
        if (field) {
            onChange(field);
        }
        combobox.closeDropdown();
    };

    const renderVirtualItem = useCallback(
        (item: VirtualItem) => {
            switch (item.type) {
                case 'section-header':
                    return (
                        <div
                            className={
                                item.dimmed
                                    ? styles.sectionHeaderDimmed
                                    : styles.sectionHeader
                            }
                        >
                            {item.label}
                        </div>
                    );
                case 'group-header':
                    return (
                        <div
                            className={`${styles.groupHeader} ${item.dimmed ? styles.dimmedOption : ''}`}
                        >
                            {item.label}
                        </div>
                    );
                case 'field': {
                    const fieldId = getItemId(item.field);
                    return (
                        <Combobox.Option
                            value={fieldId}
                            className={`${styles.option} ${item.dimmed ? styles.dimmedOption : ''}`}
                        >
                            <Tooltip
                                disabled={
                                    !isField(item.field) ||
                                    !item.field.description
                                }
                                label={
                                    isField(item.field)
                                        ? item.field.description
                                        : undefined
                                }
                                position="right"
                                multiline
                                maw={300}
                                withinPortal
                                openDelay={500}
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <FieldIcon item={item.field} size="md" />
                                    <Text size="xs" truncate="end">
                                        {getItemLabelWithoutTableName(
                                            item.field,
                                        )}
                                    </Text>
                                </Group>
                            </Tooltip>
                        </Combobox.Option>
                    );
                }
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    return (
        <div>
            <Text size="sm" mb={4}>
                Select a dimension to filter{' '}
                <Text component="span" c="red">
                    *
                </Text>
            </Text>

            <Combobox
                store={combobox}
                onOptionSubmit={handleOptionSubmit}
                withinPortal={false}
            >
                <Combobox.Target>
                    <InputBase
                        component="button"
                        type="button"
                        size="xs"
                        pointer
                        onClick={() => combobox.toggleDropdown()}
                        leftSection={
                            selectedField ? (
                                <FieldIcon item={selectedField} />
                            ) : undefined
                        }
                        rightSection={<MantineIcon icon={IconSelector} />}
                        rightSectionPointerEvents="none"
                        multiline={false}
                        data-testid="FilterConfiguration/FieldSelect"
                    >
                        {selectedField ? (
                            <Text size="xs" truncate="end">
                                {isField(selectedField)
                                    ? `${selectedField.tableLabel} ${selectedField.label}`
                                    : getItemLabelWithoutTableName(
                                          selectedField,
                                      )}
                            </Text>
                        ) : (
                            <Text size="xs" truncate="end">
                                Select a filter
                            </Text>
                        )}
                    </InputBase>
                </Combobox.Target>

                <Combobox.Dropdown p={0}>
                    <Combobox.Search
                        ref={searchRef}
                        value={search}
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                        placeholder="Search field..."
                        size="xs"
                        radius="md"
                        leftSection={
                            <MantineIcon icon={IconSearch} color="ldGray.6" />
                        }
                        data-testid="FilterConfiguration/FieldSelectSearch"
                        styles={{
                            input: {
                                border: `1px solid var(--mantine-color-ldGray-1)`,
                                borderRadius: 'var(--mantine-radius-sm)',
                                margin: 2,
                                width: 'calc(100% - 4px)',
                            },
                        }}
                    />
                    <Combobox.Options>
                        {totalFields === 0 ? (
                            <Combobox.Empty>No matching fields</Combobox.Empty>
                        ) : (
                            <Box
                                mah={DROPDOWN_MAX_HEIGHT}
                                ref={scrollRef}
                                className={styles.scrollContainer}
                            >
                                <Box
                                    pos="relative"
                                    w="100%"
                                    h={virtualizer.getTotalSize()}
                                >
                                    {virtualizer
                                        .getVirtualItems()
                                        .map((virtualRow) => {
                                            const item =
                                                virtualItems[virtualRow.index];
                                            if (!item) return null;

                                            return (
                                                <Box
                                                    key={virtualRow.key}
                                                    pos="absolute"
                                                    top={0}
                                                    left={0}
                                                    w="100%"
                                                    h={virtualRow.size}
                                                    style={{
                                                        transform: `translateY(${virtualRow.start}px)`,
                                                    }}
                                                >
                                                    {renderVirtualItem(item)}
                                                </Box>
                                            );
                                        })}
                                </Box>
                            </Box>
                        )}
                    </Combobox.Options>
                </Combobox.Dropdown>
            </Combobox>
        </div>
    );
};

export default FilterFieldSelect;
