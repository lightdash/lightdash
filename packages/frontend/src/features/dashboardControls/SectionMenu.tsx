import { ActionIcon, Checkbox, Menu, TextInput } from '@mantine/core';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type NameInputProps = {
    name: string;
    onCommit: (name: string) => void;
    onCancel: () => void;
    classNames: { root: string; input: string };
};

// Enter or blur with a name commits; Escape or an empty name cancels
export const SectionNameInput: FC<NameInputProps> = ({
    name,
    onCommit,
    onCancel,
    classNames,
}) => {
    const isDone = useRef(false);
    const finish = (value: string) => {
        if (isDone.current) return;
        isDone.current = true;
        const trimmed = value.trim();
        if (trimmed === '') onCancel();
        else onCommit(trimmed);
    };
    return (
        <TextInput
            aria-label="Section name"
            placeholder="Section name"
            size="xs"
            className={classNames.root}
            classNames={{ input: classNames.input }}
            defaultValue={name}
            autoFocus
            data-own-escape
            onBlur={(event) => finish(event.currentTarget.value)}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(event.currentTarget.value);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finish('');
                }
            }}
        />
    );
};

type MenuProps = {
    /** The "..." button's accessible name. */
    label: string;
    countLabel: string;
    /** How the bar starts this section: the saved choice, else its size. */
    isCollapsedByDefault: boolean;
    /** Flips the saved default, `section.collapsed`. */
    onToggleCollapsedByDefault: () => void;
    onRemove: () => void;
};

// A bar capsule's "..." menu: "Collapsed by default", then "Remove section"
export const SectionMenu: FC<MenuProps> = ({
    label,
    countLabel,
    isCollapsedByDefault,
    onToggleCollapsedByDefault,
    onRemove,
}) => {
    // "Remove section" asks twice; the menu stays open in between
    const [isRemoveArmed, setIsRemoveArmed] = useState(false);
    return (
        <Menu
            position="bottom-end"
            returnFocus={false}
            onClose={() => setIsRemoveArmed(false)}
        >
            <Menu.Target>
                <ActionIcon variant="subtle" size="sm" aria-label={label}>
                    <MantineIcon icon={IconDots} size={14} />
                </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
                {/* A checkbox item, as the date zoom menu: the item and the
                    box both toggle, the menu stays so the change shows */}
                <Menu.Item
                    fz="xs"
                    closeMenuOnClick={false}
                    leftSection={
                        <Checkbox
                            size="xs"
                            checked={isCollapsedByDefault}
                            onChange={onToggleCollapsedByDefault}
                            onClick={(event) => event.stopPropagation()}
                        />
                    }
                    onClick={onToggleCollapsedByDefault}
                >
                    Collapsed by default
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                    fz="xs"
                    color="red"
                    leftSection={<MantineIcon icon={IconTrash} size={14} />}
                    closeMenuOnClick={isRemoveArmed}
                    aria-pressed={isRemoveArmed}
                    onClick={() => {
                        if (isRemoveArmed) onRemove();
                        else setIsRemoveArmed(true);
                    }}
                >
                    {isRemoveArmed
                        ? `Remove section · ${countLabel}`
                        : 'Remove section'}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
