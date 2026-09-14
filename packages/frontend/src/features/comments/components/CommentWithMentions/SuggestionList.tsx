import { Paper, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { type SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { type SuggestionsItem } from '../../types';
import classes from './SuggestionList.module.css';

export type SuggestionListRef = {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

export const SuggestionList = forwardRef<
    SuggestionListRef,
    SuggestionProps<SuggestionsItem>
>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

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
        if (props.items[selectedIndex]?.disabled) return;
        selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

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

    return props.items.length > 0 ? (
        <Paper shadow="md" className={classes.root} role="listbox">
            {props.items.map((item, index) => (
                <Tooltip
                    key={item.id}
                    fz="xs"
                    label="User doesn't have access to this Dashboard's space"
                    disabled={!item.disabled}
                    position="right"
                >
                    <UnstyledButton
                        className={classes.item}
                        role="option"
                        aria-selected={index === selectedIndex}
                        aria-disabled={item.disabled || undefined}
                        data-selected={index === selectedIndex || undefined}
                        data-disabled={item.disabled || undefined}
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => {
                            if (item.disabled) return;
                            selectItem(index);
                        }}
                    >
                        <Text fz="xs" truncate>
                            {item.label}
                        </Text>
                    </UnstyledButton>
                </Tooltip>
            ))}
        </Paper>
    ) : null;
});
