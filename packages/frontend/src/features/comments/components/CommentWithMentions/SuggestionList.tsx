import { Button, Card, List, Tooltip } from '@mantine/core';
import { type SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { type SuggestionsItem } from '../../types';

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
        <Card shadow="xs" p={0}>
            <List
                withPadding={false}
                listStyleType="none"
                mah={120}
                styles={(theme) => ({
                    root: {
                        overflowY: 'auto',
                    },
                    itemWrapper: {
                        width: '100%',
                        '&:hover': {
                            backgroundColor: theme.colors.blue['1'],
                        },
                    },
                })}
            >
                {props.items.map((item, index) => (
                    <List.Item key={index} fz="xs">
                        <Tooltip
                            fz="xs"
                            label="User doesn't have access to this Dashboard's space"
                            disabled={!item.disabled}
                            withinPortal
                            position="right"
                        >
                            <Button
                                compact
                                onClick={() => {
                                    if (item.disabled) return;
                                    selectItem(index);
                                }}
                                styles={(theme) => ({
                                    root: {
                                        width: '100%',
                                        fontSize: theme.fontSizes.xs,
                                        fontWeight: 400,
                                        textAlign: 'left',
                                        backgroundColor: 'white',
                                        color:
                                            index === selectedIndex
                                                ? theme.colors.blue[6]
                                                : theme.colors.gray[7],
                                        opacity: item.disabled ? 0.5 : 1,
                                        cursor: item.disabled
                                            ? 'not-allowed'
                                            : 'pointer',
                                        '&:hover': {
                                            backgroundColor:
                                                theme.colors.blue[1],
                                        },
                                    },
                                    inner: {
                                        justifyContent: 'flex-start',
                                    },
                                })}
                            >
                                {item.label}
                            </Button>
                        </Tooltip>
                    </List.Item>
                ))}
            </List>
        </Card>
    ) : null;
});
