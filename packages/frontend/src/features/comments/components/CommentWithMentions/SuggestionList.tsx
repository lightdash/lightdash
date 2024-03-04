import { Card, List, UnstyledButton } from '@mantine/core';
import { SuggestionProps } from '@tiptap/suggestion';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { SuggestionsItem } from '../../types';

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
                    <List.Item key={index} fz="xs" w="100%">
                        <UnstyledButton
                            fz="xs"
                            w="100%"
                            p="two"
                            c={index === selectedIndex ? 'blue.6' : 'inherit'}
                            variant="default"
                            ta="left"
                            onClick={() => {
                                selectItem(index);
                            }}
                            sx={{
                                border: 'none',
                                alignSelf: 'flex-start',
                                '&:hover': {
                                    backgroundColor: 'gray.1',
                                },
                            }}
                        >
                            {item.label}
                        </UnstyledButton>
                    </List.Item>
                ))}
            </List>
        </Card>
    ) : null;
});
