import { Card, Paper, Text } from '@mantine-8/core';
import { type SuggestionProps } from '@tiptap/suggestion';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
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
    emptyMessage?: string;
};

export const SuggestionList = forwardRef<
    SuggestionListRef,
    SuggestionListProps<SuggestionItem>
>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

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

    return (
        <Paper
            ref={containerRef}
            withBorder
            shadow="subtle"
            p={0}
            className={styles.container}
        >
            {props.items.map((item, index) => (
                <div key={item.id} data-index={index}>
                    {props.renderItem(item, index === selectedIndex, () =>
                        selectItem(index),
                    )}
                </div>
            ))}
        </Paper>
    );
});

SuggestionList.displayName = 'SuggestionList';
