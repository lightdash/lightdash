import { Menu, MenuProps } from '@mantine/core';
import { FC } from 'react';

import { IconCopy } from '@tabler/icons-react';
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
            withinPortal
            closeOnItemClick
            closeOnEscape
            shadow="md"
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
            </Menu.Dropdown>
        </Menu>
    );
};

export default TotalCellMenu;
