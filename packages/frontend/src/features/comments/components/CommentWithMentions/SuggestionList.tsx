import { Menu } from '@mantine/core';
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

    return (
        <Menu opened={props.items.length > 0}>
            <Menu.Dropdown>
                <Menu.Label p={0} pb="two">
                    Users
                </Menu.Label>
                {props.items.map((item, index) => (
                    <Menu.Item
                        key={index}
                        fz="xs"
                        p="two"
                        ta="left"
                        onClick={() => selectItem(index)}
                        sx={{
                            border: 'none',
                            alignSelf: 'flex-start',
                        }}
                    >
                        {item.label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
});
