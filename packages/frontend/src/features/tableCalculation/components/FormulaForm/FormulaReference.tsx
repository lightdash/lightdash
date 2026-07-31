import { listFunctions } from '@lightdash/formula';
import type { FunctionDefinition } from '@lightdash/formula';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Divider,
    Group,
    HoverCard,
    ScrollArea,
    Text,
    TextInput,
    Tooltip,
    UnstyledButton,
} from '@mantine-8/core';
import {
    IconArrowUpRight,
    IconChevronDown,
    IconChevronRight,
    IconMathFunction,
    IconSearch,
    IconX,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import FieldIcon from '../../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../../components/common/MantineIcon';
import { type FieldSuggestionItem } from '../../../../components/common/SuggestionList';
import TruncatedText from '../../../../components/common/TruncatedText';
import classes from './FormulaReference.module.css';
import {
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    type FunctionCategory,
} from './functionCategories';

// Mirrors `formatFunctionArgs` in packages/formula/src/functions.ts.
const formatSignature = (fn: FunctionDefinition): string => {
    if (fn.maxArgs === 0) return '()';
    if (fn.maxArgs === Infinity) return '(arg1, arg2, …)';
    const required = Array.from(
        { length: fn.minArgs },
        (_, i) => `arg${i + 1}`,
    ).join(', ');
    const optional =
        fn.maxArgs > fn.minArgs
            ? `, [${Array.from(
                  { length: fn.maxArgs - fn.minArgs },
                  (_, i) => `optional${i + 1}`,
              ).join(', ')}]`
            : '';
    return `(${required}${optional})`;
};

type PanelProps = {
    opened: boolean;
    onToggle: (next: boolean) => void;
    onInsert: (text: string) => void;
};

export const FormulaReferencePanel: FC<PanelProps> = ({
    opened,
    onToggle,
    onInsert,
}) => {
    const [query, setQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<
        Set<FunctionCategory>
    >(new Set());

    const isSearching = query.trim().length > 0;
    const isCategoryExpanded = (cat: FunctionCategory) =>
        isSearching || expandedCategories.has(cat);
    const toggleCategory = (cat: FunctionCategory) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    const grouped = useMemo(() => {
        const all = listFunctions();
        const trimmed = query.trim().toLowerCase();
        const filtered = trimmed
            ? all.filter(
                  (fn) =>
                      fn.name.toLowerCase().includes(trimmed) ||
                      fn.description.toLowerCase().includes(trimmed),
              )
            : all;

        const byCategory = new Map<FunctionCategory, FunctionDefinition[]>();
        for (const fn of filtered) {
            const list = byCategory.get(fn.category) ?? [];
            list.push(fn);
            byCategory.set(fn.category, list);
        }
        for (const list of byCategory.values()) {
            list.sort((a, b) => a.name.localeCompare(b.name));
        }
        return CATEGORY_ORDER.flatMap((cat) => {
            const fns = byCategory.get(cat);
            return fns && fns.length > 0
                ? [{ category: cat, functions: fns }]
                : [];
        });
    }, [query]);

    const handleInsert = (fn: FunctionDefinition) => {
        const insertText = fn.maxArgs === 0 ? `${fn.name}()` : `${fn.name}(`;
        onInsert(insertText);
    };

    return (
        <Box className={classes.panel}>
            <Group gap="xs" wrap="nowrap" className={classes.searchWrapper}>
                <TextInput
                    size="xs"
                    value={query}
                    onChange={(e) => setQuery(e.currentTarget.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            onToggle(false);
                        }
                    }}
                    placeholder="Search functions"
                    leftSection={<MantineIcon icon={IconSearch} size="xs" />}
                    autoFocus={opened}
                    flex={1}
                />
                <Tooltip
                    label="Close (Esc)"
                    withArrow
                    position="top"
                    openDelay={300}
                >
                    <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="gray"
                        onClick={() => onToggle(false)}
                        aria-label="Close function reference"
                    >
                        <MantineIcon icon={IconX} size="sm" />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <ScrollArea
                className={classes.scrollArea}
                type="auto"
                offsetScrollbars
                scrollbars="y"
            >
                {grouped.length === 0 ? (
                    <Text size="xs" className={classes.empty}>
                        No functions match &ldquo;{query}&rdquo;
                    </Text>
                ) : (
                    grouped.map(({ category, functions }) => {
                        const expanded = isCategoryExpanded(category);
                        return (
                            <div
                                key={category}
                                className={classes.categoryGroup}
                            >
                                <button
                                    type="button"
                                    className={classes.categoryHeader}
                                    onClick={() => toggleCategory(category)}
                                    aria-expanded={expanded}
                                >
                                    <MantineIcon
                                        icon={
                                            expanded
                                                ? IconChevronDown
                                                : IconChevronRight
                                        }
                                        size="xs"
                                        className={classes.categoryChevron}
                                    />
                                    <Text
                                        size="xs"
                                        fw={600}
                                        className={classes.categoryLabel}
                                        span
                                    >
                                        {CATEGORY_LABELS[category]}
                                    </Text>
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        className={classes.categoryCount}
                                        span
                                    >
                                        {functions.length}
                                    </Text>
                                </button>
                                {expanded &&
                                    functions.map((fn) => (
                                        <button
                                            key={fn.name}
                                            type="button"
                                            className={classes.functionRow}
                                            onClick={() => handleInsert(fn)}
                                        >
                                            <Text
                                                size="xs"
                                                className={
                                                    classes.functionSignature
                                                }
                                                span
                                            >
                                                {fn.name}
                                                {formatSignature(fn)}
                                            </Text>
                                            <TruncatedText
                                                size="xs"
                                                className={
                                                    classes.functionDescription
                                                }
                                                maxWidth="400px"
                                            >
                                                {fn.description}
                                            </TruncatedText>
                                        </button>
                                    ))}
                            </div>
                        );
                    })
                )}
            </ScrollArea>
        </Box>
    );
};

type AvailableFieldsHintProps = {
    fields: FieldSuggestionItem[];
    onInsertField: (field: FieldSuggestionItem) => void;
};

/**
 * Hoverable `N fields available` hint: surfaces every field the formula can
 * reference (selected dimensions, metrics, and other table calculations)
 * without having to type `@` first. Clicking a row inserts it. The list is
 * sorted dimensions → metrics → table calculations and each row's icon
 * carries the field type, so no group headers are needed — keeps the list
 * dense when many fields are selected.
 */
const AvailableFieldsHint: FC<AvailableFieldsHintProps> = ({
    fields,
    onInsertField,
}) => {
    return (
        <HoverCard
            width={280}
            position="top-start"
            shadow="md"
            openDelay={100}
            closeDelay={200}
            withinPortal
        >
            <HoverCard.Target>
                <UnstyledButton
                    className={classes.availableFieldsTarget}
                    aria-label="Show available fields"
                >
                    <Text fz="xs" fw={500} ff="inherit">
                        {fields.length === 1
                            ? '1 field available'
                            : `${fields.length} fields available`}
                    </Text>
                </UnstyledButton>
            </HoverCard.Target>
            <HoverCard.Dropdown p={0}>
                <Box className={classes.availableFieldsHeader}>
                    <Text size="xs" fw={600}>
                        Available fields
                    </Text>
                    <Text size="xs" c="dimmed">
                        Click to insert, or type{' '}
                        <kbd className={classes.kbd}>@</kbd> in the formula.
                    </Text>
                </Box>
                <ScrollArea.Autosize
                    mah={280}
                    type="auto"
                    offsetScrollbars
                    scrollbars="y"
                    className={classes.availableFieldsList}
                >
                    {fields.length === 0 ? (
                        <Text size="xs" c="dimmed" p="xs">
                            No fields selected yet — add dimensions or metrics
                            to your query first.
                        </Text>
                    ) : (
                        fields.map((field) => (
                            <UnstyledButton
                                key={field.id}
                                className={classes.fieldRow}
                                onClick={() => onInsertField(field)}
                            >
                                <FieldIcon item={field.item} size="sm" />
                                <Text size="xs" truncate>
                                    {field.label}
                                </Text>
                            </UnstyledButton>
                        ))
                    )}
                </ScrollArea.Autosize>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

type BarProps = {
    opened: boolean;
    onToggle: (next: boolean) => void;
    fields: FieldSuggestionItem[];
    onInsertField: (field: FieldSuggestionItem) => void;
};

export const FormulaReferenceBar: FC<BarProps> = ({
    opened,
    onToggle,
    fields,
    onInsertField,
}) => {
    const toggle = () => onToggle(!opened);

    const kbdHints = (
        <Group gap="md" wrap="nowrap" className={classes.kbdHints}>
            <Group gap={6} wrap="nowrap">
                <kbd className={classes.kbd}>@</kbd>
                <Text size="xs" inherit>
                    field
                </Text>
            </Group>
            <Group gap={6} wrap="nowrap">
                <kbd className={classes.kbd}>#</kbd>
                <Text size="xs" inherit>
                    function
                </Text>
            </Group>
        </Group>
    );

    const fieldsHint = (
        <AvailableFieldsHint fields={fields} onInsertField={onInsertField} />
    );

    return (
        <Group
            className={classes.bar}
            gap="xs"
            wrap="nowrap"
            justify="space-between"
        >
            {opened ? (
                <Group gap="sm" wrap="nowrap">
                    {kbdHints}
                    {fieldsHint}
                </Group>
            ) : (
                <Group gap="sm" wrap="nowrap">
                    <Button
                        variant="subtle"
                        color="gray"
                        size="compact-xs"
                        onClick={toggle}
                        leftSection={
                            <MantineIcon icon={IconMathFunction} size="sm" />
                        }
                        className={classes.helperButton}
                        aria-expanded={opened}
                    >
                        Need help?
                    </Button>
                    {fieldsHint}
                </Group>
            )}

            {opened ? (
                <Group gap="sm" wrap="nowrap">
                    <Divider orientation="vertical" />
                    <Anchor
                        href="https://docs.lightdash.com/guides/formula-table-calculations"
                        target="_blank"
                        rel="noreferrer"
                        size="xs"
                        underline="hover"
                        className={classes.docsLink}
                    >
                        <Group gap={2} wrap="nowrap">
                            Docs
                            <MantineIcon icon={IconArrowUpRight} size="xs" />
                        </Group>
                    </Anchor>
                </Group>
            ) : (
                kbdHints
            )}
        </Group>
    );
};
