import type { FunctionDefinition } from '@lightdash/formula';
import { Card, Group, Paper, Text } from '@mantine-8/core';
import { IconMathFunction } from '@tabler/icons-react';
import { type SuggestionProps } from '@tiptap/suggestion';
import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type FC,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../components/common/PolymorphicGroupButton';
import styles from '../../../../ee/features/ambientAi/components/tableCalculation/components/AiPromptInput/FieldSuggestionList.module.css';

export type FunctionSuggestionItem = {
    id: string;
    label: string;
    description: string;
    definition: FunctionDefinition;
};

export type FunctionSuggestionListRef = {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type ItemProps = {
    suggestion: FunctionSuggestionItem;
    isSelected: boolean;
    onClick: () => void;
};

const FunctionItem: FC<ItemProps> = ({ suggestion, isSelected, onClick }) => (
    <PolymorphicGroupButton
        onClick={onClick}
        className={styles.suggestionItem}
        data-selected={isSelected}
    >
        <Group wrap="nowrap" gap="xs">
            <MantineIcon icon={IconMathFunction} size="sm" color="violet" />
            <Text size="xs" fw={500}>
                {suggestion.label}
            </Text>
            <Text size="xs" c="dimmed" truncate maw={200}>
                {suggestion.description}
            </Text>
        </Group>
    </PolymorphicGroupButton>
);

export const FunctionSuggestionList = forwardRef<
    FunctionSuggestionListRef,
    SuggestionProps<FunctionSuggestionItem>
>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectItem = (index: number) => {
        if (index >= props.items.length) return;
        props.command(props.items[index]);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useEffect(() => {
        const el = containerRef.current?.querySelector(
            `[data-index="${selectedIndex}"]`,
        );
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
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
                    No functions found
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
                    <FunctionItem
                        suggestion={suggestion}
                        isSelected={index === selectedIndex}
                        onClick={() => selectItem(index)}
                    />
                </div>
            ))}
        </Paper>
    );
});

FunctionSuggestionList.displayName = 'FunctionSuggestionList';
