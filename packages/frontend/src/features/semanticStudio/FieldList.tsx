import {
    Box,
    Button,
    Checkbox,
    Group,
    Menu,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import {
    IconCheck,
    IconChevronDown,
    IconGripVertical,
    IconLock,
    IconSearch,
} from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent,
    type FC,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import classes from './FieldList.module.css';
import { summaryOf, type Explore, type Field } from './model';
import { CHANGE_KIND_LABELS } from './modelCode';
import { usePageVirtualizer } from './pageScroll';
import { FieldTypeIcon } from './shared';
import sharedClasses from './shared.module.css';
import { startStudioChatRefDrag, useAddToStudioChat } from './studioChatRefs';
import { type FieldFilter } from './useFieldListState';
import { type ViewModel } from './useSemanticStudio';

const FIELD_ROW_HEIGHT = 36;

// ---------------------------------------------------------------------------
// Field table (virtualised: PostHog alone has 2,310 fields)

const DIVIDER_HEIGHT = 36;

type FieldListRow =
    | { type: 'divider'; label: string; count: number }
    | { type: 'field'; field: Field; index: number };

/** Each group, dimensions then metrics, opens with its own header row. */
const toRows = (fields: Field[]): FieldListRow[] => {
    const metricCount = fields.filter(
        ({ fieldKind }) => fieldKind === 'metric',
    ).length;
    const dimensionCount = fields.length - metricCount;
    return fields.flatMap((field, index): FieldListRow[] => {
        const row: FieldListRow = { type: 'field', field, index };
        const isMetric = field.fieldKind === 'metric';
        const previous = fields[index - 1];
        const startsGroup =
            !previous || (isMetric && previous.fieldKind !== 'metric');
        if (!startsGroup) return [row];
        return [
            isMetric
                ? { type: 'divider', label: 'Metrics', count: metricCount }
                : {
                      type: 'divider',
                      label: 'Dimensions',
                      count: dimensionCount,
                  },
            row,
        ];
    });
};

/**
 * One field in the table. Memoised: typing in the field search re-renders the
 * table, and rows that didn't change skip it.
 */
const FieldRow = memo<{
    field: Field;
    index: number;
    top: number;
    selected: boolean;
    tabStop: boolean;
    /** From a joined table, not the explore's own. */
    joined: boolean;
    unsaved: boolean;
    onOpen: (field: Field) => void;
    onDragStart: (event: DragEvent, field: Field) => void;
}>(
    ({
        field,
        index,
        top,
        selected,
        tabStop,
        joined,
        unsaved,
        onOpen,
        onDragStart,
    }) => {
        const canDrag = useAddToStudioChat() !== null;
        const summary = summaryOf(field.description);
        return (
            <Box className={classes.fieldItem} top={top}>
                <Box
                    className={classes.fieldRow}
                    data-selected={selected}
                    data-off={!field.inUse || field.draftState === 'removed'}
                    data-change={field.draftState ?? undefined}
                    data-field-index={index}
                    data-field-id={field.id}
                    role="row"
                    aria-selected={selected}
                    tabIndex={tabStop ? 0 : -1}
                    draggable={canDrag}
                    onDragStart={(event) => onDragStart(event, field)}
                    onClick={() => onOpen(field)}
                >
                    {canDrag ? (
                        <Box className={classes.dragGrip} aria-hidden>
                            <MantineIcon icon={IconGripVertical} size={12} />
                        </Box>
                    ) : null}
                    <Group gap={8} wrap="nowrap" className={classes.fieldName}>
                        <Box flex="none" display="flex">
                            <FieldTypeIcon field={field} />
                        </Box>
                        <Text
                            truncate
                            className={classes.fieldLabel}
                            title={field.label}
                        >
                            {field.label}
                        </Text>
                        {joined ? (
                            <Text truncate className={classes.fieldTable}>
                                {field.table}
                            </Text>
                        ) : null}
                        {unsaved ? (
                            <Text className={classes.fieldUnsaved}>
                                Unsaved
                            </Text>
                        ) : null}
                        {field.draftState ? (
                            <Text
                                className={classes.fieldUnsaved}
                                data-change={field.draftState}
                            >
                                {CHANGE_KIND_LABELS[field.draftState]}
                            </Text>
                        ) : null}
                        {field.visibleTo ? (
                            <Tooltip
                                label={`Only people with ${field.visibleTo}`}
                                openDelay={300}
                            >
                                <Box flex="none" display="flex">
                                    <MantineIcon
                                        icon={IconLock}
                                        size={12}
                                        color="dimmed"
                                    />
                                </Box>
                            </Tooltip>
                        ) : null}
                    </Group>
                    <Text
                        truncate
                        className={classes.fieldDescription}
                        title={summary || undefined}
                    >
                        {summary}
                    </Text>
                </Box>
            </Box>
        );
    },
);

export const FieldList: FC<{
    view: ViewModel;
    explore: Explore;
    fields: Field[];
    /** Fields not in use that match but are hidden; offered when none show. */
    hiddenCount: number;
    onShowHidden: () => void;
    /** The field whose details are open, from the URL. */
    openFieldId: string | null;
    /** A field to bring into view on arrival, such as one just published. */
    revealFieldId: string | null;
    /** Click or Enter opens a field's details; arrows move between rows. */
    onOpen: (field: Field) => void;
    toolbar?: ReactNode;
}> = ({
    view,
    explore,
    fields,
    hiddenCount,
    onShowHidden,
    openFieldId,
    revealFieldId,
    onOpen,
    toolbar,
}) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(() => toRows(fields), [fields]);
    const rowIndexByField = useMemo(
        () =>
            new Map(
                rows.flatMap((row, rowIndex) =>
                    row.type === 'field'
                        ? [[row.field.id, rowIndex] as const]
                        : [],
                ),
            ),
        [rows],
    );
    const virtualizer = usePageVirtualizer(parentRef, {
        count: rows.length,
        estimateSize: (index) =>
            rows[index].type === 'divider' ? DIVIDER_HEIGHT : FIELD_ROW_HEIGHT,
        overscan: 12,
    });
    const [activeFieldId, setActiveFieldId] = useState(openFieldId);
    // Rows are memoised, so they get one stable handler; it reads the latest
    // onOpen when called.
    const onOpenRef = useRef(onOpen);
    useEffect(() => {
        onOpenRef.current = onOpen;
    });
    const openRow = useCallback((field: Field) => {
        setActiveFieldId(field.id);
        onOpenRef.current(field);
    }, []);
    const dragRow = useCallback(
        (event: DragEvent, field: Field) =>
            startStudioChatRefDrag(event.dataTransfer, {
                modelName: explore.id,
                fieldName: field.id,
                modelLabel: explore.label,
                fieldLabel: field.label,
                fieldKind: field.fieldKind,
                fieldType: field.type,
                code: null,
            }),
        [explore.id, explore.label],
    );
    const selectedIndex = fields.findIndex(({ id }) => id === activeFieldId);
    const tabStop = selectedIndex < 0 ? 0 : selectedIndex;
    // Arriving on an open field (a link, back, reload), or one to reveal: show its row.
    useEffect(() => {
        const arrivedAt = openFieldId ?? revealFieldId;
        const rowIndex = arrivedAt ? rowIndexByField.get(arrivedAt) : undefined;
        if (rowIndex === undefined) return;
        virtualizer.scrollToIndex(rowIndex, { align: 'center' });
        // Only on arrival, not on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const focusField = (index: number) => {
        const field = fields[index];
        if (!field) return;
        setActiveFieldId(field.id);
        const rowIndex = rowIndexByField.get(field.id);
        if (rowIndex !== undefined) virtualizer.scrollToIndex(rowIndex);
        // The row may only exist after the scroll renders it.
        requestAnimationFrame(() =>
            parentRef.current
                ?.querySelector<HTMLElement>(`[data-field-index="${index}"]`)
                ?.focus(),
        );
    };

    // Arrow keys move between rows, Enter opens one.
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            !(event.target instanceof HTMLElement) ||
            event.target.getAttribute('role') !== 'row'
        ) {
            return;
        }
        const current = selectedIndex < 0 ? -1 : selectedIndex;
        const next =
            event.key === 'ArrowDown'
                ? Math.min(current + 1, fields.length - 1)
                : event.key === 'ArrowUp'
                  ? Math.max(current - 1, 0)
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? fields.length - 1
                      : null;
        if (next !== null) {
            event.preventDefault();
            focusField(next);
            return;
        }
        const field = fields[current];
        if (event.key === 'Enter' && field) {
            event.preventDefault();
            onOpen(field);
        }
    };

    // From the search box, ArrowDown moves into the list.
    const handleTableKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            event.key === 'ArrowDown' &&
            event.target instanceof HTMLElement &&
            event.target.closest('[data-field-search]') &&
            fields.length > 0
        ) {
            event.preventDefault();
            focusField(selectedIndex < 0 ? 0 : selectedIndex);
        }
    };

    return (
        <Box className={classes.table} onKeyDown={handleTableKeyDown}>
            {toolbar}
            <Box className={classes.fieldHeader} role="presentation">
                <span>Field</span>
                <span>Description</span>
            </Box>
            {fields.length === 0 && hiddenCount > 0 ? (
                <Stack gap={8} align="center" py="xl">
                    <Stack gap={2} align="center">
                        <Text fz="sm" fw={500}>
                            {hiddenCount === 1
                                ? '1 hidden field matches'
                                : `${hiddenCount.toLocaleString()} hidden fields match`}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            Fields not in use are hidden.
                        </Text>
                    </Stack>
                    <Button
                        size="xs"
                        variant="default"
                        className={sharedClasses.pressable}
                        onClick={onShowHidden}
                    >
                        Show hidden
                    </Button>
                </Stack>
            ) : fields.length === 0 ? (
                <Stack gap={2} align="center" py="xl">
                    <Text fz="sm" fw={500}>
                        No fields match
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Clear the search or show all fields.
                    </Text>
                </Stack>
            ) : (
                <Box
                    ref={parentRef}
                    className={classes.fieldList}
                    role="grid"
                    aria-label={`${explore.label} fields`}
                    onKeyDown={handleKeyDown}
                >
                    <Box
                        className={sharedClasses.fieldListInner}
                        h={virtualizer.getTotalSize()}
                    >
                        {virtualizer.getVirtualItems().map((item) => {
                            const row = rows[item.index];
                            if (row.type === 'divider') {
                                return (
                                    <Box
                                        key={`divider:${row.label}`}
                                        className={classes.fieldDivider}
                                        top={
                                            item.start -
                                            virtualizer.options.scrollMargin
                                        }
                                        role="presentation"
                                    >
                                        <span>{row.label}</span>
                                        <span
                                            className={
                                                classes.fieldDividerCount
                                            }
                                        >
                                            {row.count.toLocaleString()}
                                        </span>
                                    </Box>
                                );
                            }
                            const { field, index } = row;
                            return (
                                <FieldRow
                                    key={field.id}
                                    field={field}
                                    index={index}
                                    top={
                                        item.start -
                                        virtualizer.options.scrollMargin
                                    }
                                    selected={field.id === activeFieldId}
                                    tabStop={index === tabStop}
                                    joined={field.table !== explore.name}
                                    unsaved={!!view.getDraft(explore, field)}
                                    onOpen={openRow}
                                    onDragStart={dragRow}
                                />
                            );
                        })}
                    </Box>
                </Box>
            )}
        </Box>
    );
};

const FILTER_LABELS: Record<FieldFilter, string> = {
    all: 'All fields',
    noDescription: 'Missing description',
};

/** The table's top edge: search, Show hidden and one filter menu. */
export const FieldListToolbar: FC<{
    filter: FieldFilter;
    onFilterChange: (filter: FieldFilter) => void;
    query: string;
    onQueryChange: (query: string) => void;
    showInternal: boolean;
    onShowInternalChange: (value: boolean) => void;
    hasInternal: boolean;
    showHidden: boolean;
    onShowHiddenChange: (value: boolean) => void;
    /** Fields not in use; only live data sources have any. */
    hasHidden: boolean;
}> = ({
    filter,
    onFilterChange,
    query,
    onQueryChange,
    showInternal,
    onShowInternalChange,
    hasInternal,
    showHidden,
    onShowHiddenChange,
    hasHidden,
}) => (
    <Group className={classes.tableToolbar} gap="xs" wrap="nowrap">
        <TextInput
            variant="unstyled"
            size="xs"
            flex={1}
            placeholder="Search fields"
            data-field-search
            leftSection={<MantineIcon icon={IconSearch} size={14} />}
            value={query}
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && query) onQueryChange('');
            }}
        />
        {hasHidden ? (
            <Checkbox
                size="xs"
                label="Show hidden"
                className={classes.showHidden}
                checked={showHidden}
                onChange={(event) =>
                    onShowHiddenChange(event.currentTarget.checked)
                }
            />
        ) : null}
        <Menu position="bottom-end" width={200}>
            <Menu.Target>
                <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    className={sharedClasses.pressable}
                    rightSection={
                        <MantineIcon icon={IconChevronDown} size={12} />
                    }
                >
                    {FILTER_LABELS[filter]}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {(Object.keys(FILTER_LABELS) as FieldFilter[]).map((value) => (
                    <Menu.Item
                        key={value}
                        rightSection={
                            filter === value ? (
                                <MantineIcon icon={IconCheck} size={14} />
                            ) : null
                        }
                        onClick={() => onFilterChange(value)}
                    >
                        {FILTER_LABELS[value]}
                    </Menu.Item>
                ))}
                {hasInternal ? (
                    <>
                        <Menu.Divider />
                        <Menu.Item
                            closeMenuOnClick={false}
                            rightSection={
                                showInternal ? (
                                    <MantineIcon icon={IconCheck} size={14} />
                                ) : null
                            }
                            onClick={() => onShowInternalChange(!showInternal)}
                        >
                            Internal fields
                        </Menu.Item>
                    </>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    </Group>
);
