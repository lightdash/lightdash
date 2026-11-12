import { ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconFolderMinus, IconPencil } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type MenuProps = {
    /** The "..." button's accessible name. */
    label: string;
    /** Whether the section has members, on any tab. */
    hasMembers: boolean;
    /** Names it in place, as a click on the name does */
    onRename: () => void;
    /** Null: the section cannot be removed here, so the item is left out */
    onRemove: (() => void) | null;
};

// A bar capsule's "..." menu: rename, and the remove item, one click:
// "Remove section, keep controls" moves the members out, deleting nothing
export const SectionMenu: FC<MenuProps> = ({
    label,
    hasMembers,
    onRename,
    onRemove,
}) => (
    <Menu position="bottom-start" returnFocus={false}>
        <Menu.Target>
            <ActionIcon size="sm" radius="xl" aria-label={label}>
                <MantineIcon icon={IconDots} size={14} />
            </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
            <Menu.Item
                leftSection={<MantineIcon icon={IconPencil} size={14} />}
                onClick={onRename}
            >
                Rename
            </Menu.Item>
            {onRemove !== null && (
                <Menu.Item
                    leftSection={
                        <MantineIcon icon={IconFolderMinus} size={14} />
                    }
                    onClick={onRemove}
                >
                    {hasMembers
                        ? 'Remove section, keep controls'
                        : 'Remove section'}
                </Menu.Item>
            )}
        </Menu.Dropdown>
    </Menu>
);
