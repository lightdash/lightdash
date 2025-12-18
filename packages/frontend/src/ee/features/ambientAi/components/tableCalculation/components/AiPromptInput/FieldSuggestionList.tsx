import {
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type TableCalculation,
} from '@lightdash/common';
import { Card, Group, Paper, Text } from '@mantine/core';
import { type SuggestionProps } from '@tiptap/suggestion';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type FC,
} from 'react';
import FieldIcon from '../../../../../../../components/common/Filters/FieldIcon';
import { PolymorphicGroupButton } from '../../../../../../../components/common/PolymorphicGroupButton';
import styles from './FieldSuggestionList.module.css';

export type FieldSuggestionItem = {
    id: string;
    label: string;
    item: Field | TableCalculation | AdditionalMetric | CustomDimension;
};

export type FieldSuggestionListRef = {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type FieldItemProps = {
    suggestion: FieldSuggestionItem;
    isSelected: boolean;
    onClick: () => void;
};

const FieldItem: FC<FieldItemProps> = ({ suggestion, isSelected, onClick }) => {
    return (
        <PolymorphicGroupButton
            onClick={onClick}
            className={styles.fieldItem}
            data-selected={isSelected}
        >
            <Group noWrap spacing="xs">
                <FieldIcon item={suggestion.item} size="sm" />
                <Text size="xs" truncate maw={500} fw={400}>
                    {suggestion.label}
                </Text>
            </Group>
        </PolymorphicGroupButton>
    );
};

export const FieldSuggestionList = forwardRef<
    FieldSuggestionListRef,
    SuggestionProps<FieldSuggestionItem>
>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectItem = (index: number) => {
        if (index >= props.items.length) {
            return;
        }

        const suggestion = props.items[index];
        props.command(suggestion);
    };

    const upHandler = () => {
        setSelectedIndex(
            (selectedIndex + props.items.length - 1) % props.items.length,
        );
    };

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
        selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    // Scroll selected item into view when navigating with keyboard
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const selectedElement = container.querySelector(
            `[data-index="${selectedIndex}"]`,
        );
        if (selectedElement) {
            selectedElement.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth',
            });
        }
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (event.key === 'ArrowUp') {
                upHandler();
                return true;
            }

            if (event.key === 'ArrowDown') {
                downHandler();
                return true;
            }

            if (event.key === 'Enter') {
                enterHandler();
                return true;
            }

            return false;
        },
    }));

    if (props.items.length === 0) {
        return (
            <Card shadow="md" p="xs" className={styles.container}>
                <Text size="xs" c="dimmed">
                    No fields found
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
            {props.items.map((suggestion, index) => (
                <div key={suggestion.id} data-index={index}>
                    <FieldItem
                        suggestion={suggestion}
                        isSelected={index === selectedIndex}
                        onClick={() => selectItem(index)}
                    />
                </div>
            ))}
        </Paper>
    );
});

FieldSuggestionList.displayName = 'FieldSuggestionList';
