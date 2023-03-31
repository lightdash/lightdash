import { PivotValue } from '@lightdash/common';
import { Menu } from '@mantine/core';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../MantineIcon';

interface ValueCellProps {
    value: PivotValue;
}

const ValueCell: FC<ValueCellProps> = ({ value }) => {
    return (
        <Menu
            withinPortal
            shadow="md"
            offset={-1}
            position="bottom-end"
            radius="xs"
        >
            <Menu.Target>
                <td>{value?.formatted}</td>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconCopy}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                >
                    Copy
                </Menu.Item>

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
            </Menu.Dropdown>
        </Menu>
    );
};

export default ValueCell;
