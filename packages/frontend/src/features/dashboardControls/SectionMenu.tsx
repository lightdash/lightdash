import { ActionIcon, Checkbox, Menu, Tooltip } from '@mantine/core';
import { IconDots, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

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
