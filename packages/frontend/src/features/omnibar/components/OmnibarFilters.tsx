import { assertUnreachable, SearchItemType } from '@lightdash/common';
import { Button, Group, Menu } from '@mantine/core';
import {
    IconAdjustments,
    IconBrowser,
    IconChartBar,
    IconChevronDown,
    IconFolder,
    IconLayoutDashboard,
    IconRectangle,
    IconTable,
} from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { allSearchItemTypes } from '../types/searchItem';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import { getOmnibarItemColor } from './OmnibarItemIcon';

type Props = {};

const getOmnibarItemIcon = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return IconRectangle;
        case SearchItemType.DASHBOARD:
            return IconLayoutDashboard;
        case SearchItemType.SAVED_CHART:
            return IconChartBar;
        case SearchItemType.SPACE:
            return IconFolder;
        case SearchItemType.TABLE:
            return IconTable;
        case SearchItemType.PAGE:
            return IconBrowser;
        default:
            return assertUnreachable(
                itemType,
                `Unknown search item type: ${itemType}`,
            );
    }
};

const OmnibarFilters: FC<Props> = () => {
    return (
        <Group px="md" py="sm">
            <Menu
                position="bottom-end"
                withArrow
                withinPortal
                shadow="md"
                arrowOffset={13}
                offset={2}
            >
                <Menu.Target>
                    <Button
                        variant="default"
                        radius="xl"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconAdjustments} />}
                        rightIcon={<MantineIcon icon={IconChevronDown} />}
                    >
                        Filter
                    </Button>
                </Menu.Target>

                <Menu.Dropdown>
                    {allSearchItemTypes.map((type) => (
                        <Menu.Item
                            key={type}
                            icon={
                                <MantineIcon
                                    icon={getOmnibarItemIcon(type)}
                                    color={getOmnibarItemColor(type)}
                                />
                            }
                        >
                            {getSearchItemLabel(type)}
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
        </Group>
    );
};

export default OmnibarFilters;
