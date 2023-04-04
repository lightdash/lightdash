import { FieldValue } from '@lightdash/common';
import { Menu, MenuProps } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../MantineIcon';

type ValueCellMenuProps = {
    value: FieldValue | null;
    onCopy: () => void;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const ValueCellMenu: FC<ValueCellMenuProps> = ({
    children,
    // value,
    opened,
    onOpen,
    onClose,
    onCopy,
}) => {
    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withinPortal
            shadow="md"
            position="bottom-end"
            radius="xs"
            offset={{
                mainAxis: 1,
                crossAxis: 2,
            }}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconCopy}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                    onClick={onCopy}
                >
                    Copy
                </Menu.Item>

                {/*
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconStack}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                >
                    View underlying data
                </Menu.Item>

                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconArrowBarToDown}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                >
                    Drill into "{value?.formatted}"
                </Menu.Item>
                */}
            </Menu.Dropdown>
        </Menu>
    );
};

export default ValueCellMenu;
