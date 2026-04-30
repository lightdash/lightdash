import { listFunctions } from '@lightdash/formula';
import type { FunctionDefinition } from '@lightdash/formula';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Collapse,
    Divider,
    Group,
    ScrollArea,
    Text,
    TextInput,
    Tooltip,
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
import MantineIcon from '../../../../components/common/MantineIcon';
import classes from './FormulaReference.module.css';

type Props = {
    opened: boolean;
    onToggle: (next: boolean) => void;
    onInsert: (text: string) => void;
};

type Category = FunctionDefinition['category'];

const CATEGORY_LABELS: Record<Category, string> = {
    aggregate: 'Aggregate',
    logical: 'Logic',
    math: 'Math',
    string: 'Text',
    date: 'Date',
    window: 'Window',
    null: 'Null handling',
    type: 'Type',
};

const CATEGORY_ORDER: Category[] = [
    'aggregate',
    'logical',
    'math',
    'string',
    'date',
    'window',
    'null',
    'type',
];

// Inlined to avoid pulling internal helpers from the formula package.
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

export const FormulaReference: FC<Props> = ({ opened, onToggle, onInsert }) => {
    const [query, setQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState<Set<Category>>(
        new Set(),
    );

    const isSearching = query.trim().length > 0;
    const isCategoryExpanded = (cat: Category) =>
        isSearching || expandedCategories.has(cat);
    const toggleCategory = (cat: Category) => {
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

        const byCategory = new Map<Category, FunctionDefinition[]>();
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

    const toggle = () => onToggle(!opened);

    return (
        <Box className={classes.root} data-opened={opened || undefined}>
            <Collapse in={opened} className={classes.collapse}>
                <Box className={classes.panel}>
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        className={classes.searchWrapper}
                    >
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
                            leftSection={
                                <MantineIcon icon={IconSearch} size="xs" />
                            }
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
                                            onClick={() =>
                                                toggleCategory(category)
                                            }
                                            aria-expanded={expanded}
                                        >
                                            <MantineIcon
                                                icon={
                                                    expanded
                                                        ? IconChevronDown
                                                        : IconChevronRight
                                                }
                                                size="xs"
                                                className={
                                                    classes.categoryChevron
                                                }
                                            />
                                            <Text
                                                size="xs"
                                                fw={600}
                                                className={
                                                    classes.categoryLabel
                                                }
                                                span
                                            >
                                                {CATEGORY_LABELS[category]}
                                            </Text>
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                className={
                                                    classes.categoryCount
                                                }
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
                                                    className={
                                                        classes.functionRow
                                                    }
                                                    onClick={() =>
                                                        handleInsert(fn)
                                                    }
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
                                                    <Text
                                                        size="xs"
                                                        className={
                                                            classes.functionDescription
                                                        }
                                                        span
                                                    >
                                                        {fn.description}
                                                    </Text>
                                                </button>
                                            ))}
                                    </div>
                                );
                            })
                        )}
                    </ScrollArea>
                </Box>
            </Collapse>

            <Group
                className={classes.bar}
                gap="xs"
                wrap="nowrap"
                justify="space-between"
            >
                {opened ? (
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
                            onClick={toggle}
                            aria-label="Hide function reference"
                            aria-expanded={opened}
                        >
                            <MantineIcon icon={IconX} size="sm" />
                        </ActionIcon>
                    </Tooltip>
                ) : (
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
                )}

                {opened && (
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
                                <MantineIcon
                                    icon={IconArrowUpRight}
                                    size="xs"
                                />
                            </Group>
                        </Anchor>
                    </Group>
                )}
            </Group>
        </Box>
    );
};
