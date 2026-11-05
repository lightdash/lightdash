import { ActionIcon, Menu } from '@mantine/core';
import {
    IconDots,
    IconFolderMinus,
    IconPencil,
    IconSeparatorHorizontal,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type MenuProps = {
    /** The "..." button's accessible name. */
    label: string;
    /** Whether the section has members, on any tab. */
    hasMembers: boolean;
    /** Names it in place, as a click on the name does */
    onRename: () => void;
    /** It shares its line: offers a line of its own */
    isSharingLine: boolean;
    onOwnLine: () => void;
    onRemove: () => void;
};

// A bar capsule's "..." menu: rename, a line of its own when it shares one,
// and the remove item, one click: "Remove section, keep controls" moves the members out,
// deleting nothing
export const SectionMenu: FC<MenuProps> = ({
    label,
    hasMembers,
    onRename,
    isSharingLine,
    onOwnLine,
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
            {isSharingLine && (
                <Menu.Item
                    leftSection={
                        <MantineIcon icon={IconSeparatorHorizontal} size={14} />
                    }
                    onClick={onOwnLine}
                >
                    Move to its own line
                </Menu.Item>
            )}
            <Menu.Item
                leftSection={<MantineIcon icon={IconFolderMinus} size={14} />}
                onClick={onRemove}
            >
                {hasMembers
                    ? 'Remove section, keep controls'
                    : 'Remove section'}
            </Menu.Item>
        </Menu.Dropdown>
    </Menu>
);
