import { assertUnreachable } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Combobox,
    Group,
    InputBase,
    Text,
    Tooltip,
    useCombobox,
} from '@mantine/core';
import { IconArrowLeft, IconSearch } from '@tabler/icons-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from '../../features/dashboardControls/FilterEditor.module.css';
import fieldSelectClasses from '../../features/dashboardFilters/FilterConfiguration/FilterFieldSelect/FilterFieldSelect.module.css';

// The shipped field picker's row heights and list height
const OPTION_HEIGHT = 32;
const GROUP_HEADER_HEIGHT = 28;
const SECTION_HEADER_HEIGHT = 30;
const LIST_MAX_HEIGHT = 300;

type PickerRow = {
    value: string;
    icon: ReactNode;
    name: string;
    /** Dimmed on the right: "2 tiles", "On the bar · 2 tiles". */
    hint: string;
    /** On hover, as the shipped field picker shows a field's description. */
    description: string | null;
};

/** A table's or a model's rows under its label; keyed by its name. */
type PickerGroup = { key: string; label: string; rows: PickerRow[] };

/** The shipped picker's tab split; one unlabelled section otherwise. */
export type PickerSection = {
    key: string;
    label: string | null;
    dimmed: boolean;
    groups: PickerGroup[];
};

type ListItem =
    | { type: 'section'; key: string; label: string; dimmed: boolean }
    | { type: 'group'; key: string; label: string; dimmed: boolean }
    | {
          type: 'row';
          key: string;
          row: PickerRow;
          groupLabel: string;
          dimmed: boolean;
      };

const ITEM_HEIGHTS: Record<ListItem['type'], number> = {
    section: SECTION_HEADER_HEIGHT,
    group: GROUP_HEADER_HEIGHT,
    row: OPTION_HEIGHT,
};

type Props = {
    /** Placeholder and the input's name: "Search fields". */
    searchLabel: string;
    input: string;
    onInputChange: (input: string) => void;
    /** The settled search the sections were filtered by. */
    search: string;
    sections: PickerSection[];
    emptyText: string;
    /** Back to the Filter or Parameter choice; null when there is none. */
    onBack: (() => void) | null;
    onPick: (value: string) => void;
};

// One step of "Add" for fields and parameters alike: a search, rows grouped
// by table or model, and the tiles each reaches. As the shipped field picker,
// only the rows in view are drawn, so thousands of fields stay quick
export const ControlPicker: FC<Props> = ({
    searchLabel,
    input,
    onInputChange,
    search,
    sections,
    emptyText,
    onBack,
    onPick,
}) => {
    // Always open: the list is the step, and keys only move through an open one
    const combobox = useCombobox({ opened: true });
    const { selectFirstOption } = combobox;
    const scrollRef = useRef<HTMLDivElement>(null);
    const items = useMemo(
        (): ListItem[] =>
            sections.flatMap((section) => [
                ...(section.label === null
                    ? []
                    : [
                          {
                              type: 'section' as const,
                              key: `section:${section.key}`,
                              label: section.label,
                              dimmed: section.dimmed,
                          },
                      ]),
                ...section.groups.flatMap((group) => [
                    {
                        type: 'group' as const,
                        key: `group:${section.key}:${group.key}`,
                        label: group.label,
                        dimmed: section.dimmed,
                    },
                    ...group.rows.map((row) => ({
                        type: 'row' as const,
                        key: `row:${row.value}`,
                        row,
                        groupLabel: group.label,
                        dimmed: section.dimmed,
                    })),
                ]),
            ]),
        [sections],
    );
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: (index) => ITEM_HEIGHTS[items[index]?.type ?? 'row'],
        overscan: 10,
    });
    // As the shipped picker: mounted open, one measure draws the first rows
    useEffect(() => {
        virtualizer.measure();
    }, [virtualizer]);
    // Enter picks the first match, as in the shipped field picker
    useEffect(() => {
        selectFirstOption();
    }, [selectFirstOption, search]);

    const renderItem = (item: ListItem) => {
        switch (item.type) {
            case 'section':
                return (
                    <Box className={fieldSelectClasses.sectionHeader}>
                        {item.label}
                    </Box>
                );
            case 'group':
                return (
                    <Box className={fieldSelectClasses.groupHeader}>
                        {item.label}
                    </Box>
                );
            case 'row':
                return (
                    <Combobox.Option
                        value={item.row.value}
                        h="100%"
                        className={fieldSelectClasses.option}
                        // The group's heading is not tied to its rows in a
                        // flat virtual list: two models' "Region" stay apart
                        aria-label={`${item.row.name}, ${item.groupLabel}, ${item.row.hint}`}
                    >
                        <Tooltip
                            disabled={item.row.description === null}
                            label={item.row.description}
                            position="right"
                            maw={300}
                            openDelay={500}
                            multiline
                        >
                            <Group gap="xs" wrap="nowrap">
                                {item.row.icon}
                                <Text size="xs" truncate="end" flex={1}>
                                    {item.row.name}
                                </Text>
                                <Text size="xs" c="dimmed" flex="0 0 auto">
                                    {item.row.hint}
                                </Text>
                            </Group>
                        </Tooltip>
                    </Combobox.Option>
                );
            default:
                return assertUnreachable(item, 'Unknown picker item');
        }
    };

    return (
        <Box className={classes.content} data-controls-start>
            <Combobox store={combobox} onOptionSubmit={onPick}>
                <Group gap="xs" wrap="nowrap">
                    {onBack !== null && (
                        <Tooltip fz="xs" label="Back">
                            <ActionIcon
                                size="sm"
                                aria-label="Back"
                                onClick={onBack}
                            >
                                <MantineIcon icon={IconArrowLeft} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                    <Combobox.EventsTarget>
                        <InputBase
                            flex={1}
                            radius="md"
                            size="xs"
                            value={input}
                            placeholder={searchLabel}
                            aria-label={searchLabel}
                            leftSection={
                                <MantineIcon icon={IconSearch} color="dimmed" />
                            }
                            autoComplete="off"
                            onChange={(event) =>
                                onInputChange(event.currentTarget.value)
                            }
                        />
                    </Combobox.EventsTarget>
                </Group>
                <Combobox.Options mt="xs">
                    {items.length === 0 ? (
                        <Combobox.Empty>{emptyText}</Combobox.Empty>
                    ) : (
                        <Box
                            ref={scrollRef}
                            mah={LIST_MAX_HEIGHT}
                            className={fieldSelectClasses.scrollContainer}
                        >
                            <Box
                                pos="relative"
                                w="100%"
                                h={virtualizer.getTotalSize()}
                            >
                                {virtualizer.getVirtualItems().map((entry) => {
                                    const item = items[entry.index];
                                    if (!item) return null;
                                    return (
                                        <Box
                                            key={item.key}
                                            h={entry.size}
                                            className={`${fieldSelectClasses.virtualItem} ${item.dimmed ? fieldSelectClasses.dimmedOption : ''}`}
                                            // As the shipped picker: the row's place
                                            style={{
                                                '--item-start': `${entry.start}px`,
                                            }}
                                        >
                                            {renderItem(item)}
                                        </Box>
                                    );
                                })}
                            </Box>
                        </Box>
                    )}
                </Combobox.Options>
            </Combobox>
        </Box>
    );
};
