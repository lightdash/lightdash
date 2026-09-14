import { Menu, type MenuProps } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../MantineIcon';

type TotalCellMenuProps = {
    onCopy: () => void;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const TotalCellMenu: FC<React.PropsWithChildren<TotalCellMenuProps>> = ({
    children,
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
            closeOnItemClick
            closeOnEscape
            radius={0}
            position="bottom-end"
            offset={{
                mainAxis: 0,
                crossAxis: 0,
            }}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    leftSection={
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
            </Menu.Dropdown>
        </Menu>
    );
};

export default TotalCellMenu;
