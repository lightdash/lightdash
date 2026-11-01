import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import { IconDots, IconFolderMinus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

type MenuProps = {
    /** The "..." button's accessible name. */
    label: string;
    /** Whether the section has members, on any tab. */
    hasMembers: boolean;
    onRemove: () => void;
};

// A bar capsule's "..." menu: the remove item, one click: "Remove, keep
// filters" moves the members out, deleting nothing
export const SectionMenu: FC<MenuProps> = ({ label, hasMembers, onRemove }) => (
    <Menu position="bottom-end" returnFocus={false}>
        <Menu.Target>
            <Tooltip label={label}>
                <ActionIcon size="sm" radius="xl" aria-label={label}>
                    <MantineIcon icon={IconDots} size={14} />
                </ActionIcon>
            </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
            <Menu.Item
                leftSection={<MantineIcon icon={IconFolderMinus} size={14} />}
                onClick={onRemove}
            >
                {hasMembers ? 'Remove, keep filters' : 'Remove section'}
            </Menu.Item>
        </Menu.Dropdown>
    </Menu>
);
