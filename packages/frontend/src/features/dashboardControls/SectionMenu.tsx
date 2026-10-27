import { ActionIcon, Checkbox, Menu, Tooltip } from '@mantine/core';
import { IconDots, IconFolderMinus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type MenuProps = {
    /** The "..." button's accessible name. */
    label: string;
    /** Whether the section has members, on any tab. */
    hasMembers: boolean;
    /** How the bar starts this section: the saved choice, else its size. */
    isCollapsedByDefault: boolean;
    /** Flips the saved default, `section.collapsed`. */
    onToggleCollapsedByDefault: () => void;
    onRemove: () => void;
};

// A bar capsule's "..." menu: "Collapsed by default", then the remove item,
// one click: "Remove, keep filters" moves the members out, deleting nothing
export const SectionMenu: FC<MenuProps> = ({
    label,
    hasMembers,
    isCollapsedByDefault,
    onToggleCollapsedByDefault,
    onRemove,
}) => (
    <Menu position="bottom-end" returnFocus={false}>
        <Menu.Target>
            <Tooltip label={label}>
                <ActionIcon size="sm" radius="xl" aria-label={label}>
                    <MantineIcon icon={IconDots} size={14} />
                </ActionIcon>
            </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
            {/* A checkbox item, as the date zoom menu: the item and the
                box both toggle, the menu stays so the change shows */}
            <Menu.Item
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
                leftSection={<MantineIcon icon={IconFolderMinus} size={14} />}
                onClick={onRemove}
            >
                {hasMembers ? 'Remove, keep filters' : 'Remove section'}
            </Menu.Item>
        </Menu.Dropdown>
    </Menu>
);
