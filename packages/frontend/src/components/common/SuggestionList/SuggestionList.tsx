import { Card, Group, Paper, Text } from '@mantine-8/core';
import { type SuggestionProps } from '@tiptap/suggestion';
import {
    forwardRef,
    Fragment,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import styles from './SuggestionList.module.css';

export type SuggestionItem = {
    id: string;
    label: string;
};

export type SuggestionListRef = {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type SuggestionListProps<T extends SuggestionItem> = SuggestionProps<T> & {
    renderItem: (
        item: T,
        isSelected: boolean,
        onClick: () => void,
    ) => ReactNode;
    /** When provided, items are grouped under headers in their existing order. */
    getGroupKey?: (item: T) => string;
    /** Display labels for each group key. Falls back to the raw key. */
    groupLabels?: Record<string, string>;
    emptyMessage?: string;
};

export const SuggestionList = forwardRef<
    SuggestionListRef,
    SuggestionListProps<SuggestionItem>
>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const { items, getGroupKey, groupLabels } = props;

    const groupedItems = useMemo(() => {
        if (!getGroupKey) return null;
        const order: string[] = [];
        const map = new Map<
            string,
            { items: SuggestionItem[]; firstIndex: number }
        >();
        items.forEach((item, index) => {
            const key = getGroupKey(item);
            if (!map.has(key)) {
                map.set(key, { items: [], firstIndex: index });
                order.push(key);
            }
            map.get(key)!.items.push(item);
        });
        return order.map((key) => ({
            key,
            label: groupLabels?.[key] ?? key,
            ...map.get(key)!,
        }));
    }, [items, getGroupKey, groupLabels]);

    const selectItem = (index: number) => {
        if (index >= props.items.length) return;
        props.command(props.items[index]);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useEffect(() => {
        containerRef.current
            ?.querySelector(`[data-index="${selectedIndex}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (props.items.length === 0) return false;

            if (event.key === 'ArrowUp') {
                setSelectedIndex(
                    (selectedIndex + props.items.length - 1) %
                        props.items.length,
                );
                return true;
            }
            if (event.key === 'ArrowDown') {
                setSelectedIndex((selectedIndex + 1) % props.items.length);
                return true;
            }
            if (event.key === 'Enter') {
                selectItem(selectedIndex);
                return true;
            }
            return false;
        },
    }));

    if (props.items.length === 0) {
        return (
            <Card shadow="md" p="xs" className={styles.container}>
                <Text size="xs" c="dimmed">
                    {props.emptyMessage ?? 'No results found'}
                </Text>
            </Card>
        );
    }

    const renderRow = (item: SuggestionItem, index: number) => (
        <div key={item.id} data-index={index}>
            {props.renderItem(item, index === selectedIndex, () =>
                selectItem(index),
            )}
        </div>
    );

    return (
        <Paper
            ref={containerRef}
            withBorder
            shadow="subtle"
            p={0}
            className={styles.container}
        >
            <div className={styles.list}>
                {groupedItems
                    ? groupedItems.map((group) => (
                          <Fragment key={group.key}>
                              <div className={styles.groupHeader}>
                                  {group.label}
                              </div>
                              {group.items.map((item, i) =>
                                  renderRow(item, group.firstIndex + i),
                              )}
                          </Fragment>
                      ))
                    : props.items.map((item, index) => renderRow(item, index))}
            </div>
            <Group gap="xs" wrap="nowrap" className={styles.footer}>
                <Group gap={4} wrap="nowrap">
                    <kbd className={styles.kbd}>↑</kbd>
                    <kbd className={styles.kbd}>↓</kbd>
                    <Text size="xs" inherit>
                        navigate
                    </Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                    <kbd className={styles.kbd}>↵</kbd>
                    <Text size="xs" inherit>
                        select
                    </Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                    <kbd className={styles.kbd}>esc</kbd>
                    <Text size="xs" inherit>
                        close
                    </Text>
                </Group>
            </Group>
        </Paper>
    );
});

SuggestionList.displayName = 'SuggestionList';
