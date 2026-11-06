import { Box, Combobox, Group, Text, Tooltip } from '@mantine/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import styles from './FilterFieldSelect.module.css';

/** What a drawn row shows; built only for the rows in view. */
export type VirtualOptionRow = {
    icon: ReactNode;
    name: string;
    description: string | null;
    /** Dimmed on the right ("2 tiles"); null for none. */
    hint: string | null;
};

// Flattened virtual list item types
export type VirtualOptionItem<T> =
    | { type: 'section-header'; label: string; dimmed: boolean }
    | { type: 'group-header'; label: string; dimmed: boolean }
    | {
          type: 'option';
          value: string;
          data: T;
          groupLabel: string;
          dimmed: boolean;
      };

const FIELD_HEIGHT = 32;
const GROUP_HEADER_HEIGHT = 28;
const SECTION_HEADER_HEIGHT = 30;
const DROPDOWN_MAX_HEIGHT = 300;

type Props<T> = {
    items: VirtualOptionItem<T>[];
    getRow: (data: T) => VirtualOptionRow;
    selectedValue: string | null;
    emptyText: string;
    /** Selects the first drawn option (the combobox's); null: no first-match selection. */
    onSelectFirst: (() => void) | null;
    /** The search the items were filtered by once typing has settled; null while it has not. */
    settledSearch: string | null;
};

// The picker's options: only the rows in view are drawn, so thousands of
// fields stay quick
export const VirtualOptionList = <T,>({
    items: virtualItems,
    getRow,
    selectedValue,
    emptyText,
    onSelectFirst,
    settledSearch,
}: Props<T>) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    const totalFields = virtualItems.filter((i) => i.type === 'option').length;

    const getItemSize = useCallback(
        (index: number) => {
            const item = virtualItems[index];
            if (!item) return FIELD_HEIGHT;
            switch (item.type) {
                case 'section-header':
                    return SECTION_HEADER_HEIGHT;
                case 'group-header':
                    return GROUP_HEADER_HEIGHT;
                case 'option':
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
    // Mounted open, the list exists before the virtualizer has seen its
    // scroll box; one measure after mount gets the first rows drawn
    useEffect(() => {
        virtualizer.measure();
    }, [virtualizer]);
    // Each settled search starts at the top and selects its first match,
    // once that row is drawn (the combobox only sees drawn rows)
    const isSelectingFirst = onSelectFirst !== null;
    const pendingFirst = useRef(false);
    useEffect(() => {
        if (!isSelectingFirst || settledSearch === null) return;
        pendingFirst.current = true;
        virtualizer.scrollToOffset(0);
    }, [isSelectingFirst, settledSearch, virtualizer]);
    const firstOptionIndex = virtualItems.findIndex(
        (item) => item.type === 'option',
    );
    const isFirstOptionDrawn = virtualizer
        .getVirtualItems()
        .some(({ index }) => index === firstOptionIndex);
    useEffect(() => {
        if (!pendingFirst.current || !isFirstOptionDrawn) return;
        pendingFirst.current = false;
        onSelectFirst?.();
    }, [isFirstOptionDrawn, onSelectFirst, settledSearch]);

    const renderVirtualItem = (item: VirtualOptionItem<T>) => {
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
            case 'option': {
                const row = getRow(item.data);
                return (
                    <Combobox.Option
                        value={item.value}
                        active={item.value === selectedValue}
                        className={`${styles.option} ${item.dimmed ? styles.dimmedOption : ''}`}
                        // A flat virtual list ties no heading to its rows:
                        // the group names each row, so two "Region" read apart
                        aria-label={
                            row.hint === null
                                ? undefined
                                : `${row.name}, ${item.groupLabel}, ${row.hint}`
                        }
                    >
                        <Tooltip
                            disabled={row.description === null}
                            label={row.description ?? undefined}
                            position="right"
                            maw={300}
                            openDelay={500}
                        >
                            <Group gap="xs" wrap="nowrap">
                                {row.icon}
                                <Text
                                    size="xs"
                                    truncate="end"
                                    flex={row.hint === null ? undefined : 1}
                                >
                                    {row.name}
                                </Text>
                                {row.hint !== null && (
                                    <Text size="xs" c="dimmed" flex="0 0 auto">
                                        {row.hint}
                                    </Text>
                                )}
                            </Group>
                        </Tooltip>
                    </Combobox.Option>
                );
            }
        }
    };

    // Inside the options, so they have their list id before rows report drawn
    return (
        <Combobox.Options>
            {totalFields === 0 ? (
                <Combobox.Empty>{emptyText}</Combobox.Empty>
            ) : (
                <Box
                    mah={DROPDOWN_MAX_HEIGHT}
                    ref={scrollRef}
                    className={styles.scrollContainer}
                >
                    <Box pos="relative" w="100%" h={virtualizer.getTotalSize()}>
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                            const item = virtualItems[virtualRow.index];
                            if (!item) return null;

                            return (
                                <Box
                                    key={virtualRow.key}
                                    h={virtualRow.size}
                                    className={styles.virtualItem}
                                    style={{
                                        '--item-start': `${virtualRow.start}px`,
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
    );
};
