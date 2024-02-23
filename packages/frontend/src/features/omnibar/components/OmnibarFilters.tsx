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

const getOmnibarItemIcon = (itemType: SearchItemType) => {
    switch (itemType) {
        case SearchItemType.FIELD:
            return IconRectangle;
        case SearchItemType.DASHBOARD:
            return IconLayoutDashboard;
        case SearchItemType.CHART:
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

type Props = {
    searchFilter: SearchItemType | undefined;
    onSearchFilterChange: (filter: SearchItemType | undefined) => void;
};

const OmnibarFilters: FC<Props> = ({ searchFilter, onSearchFilterChange }) => {
    return (
        <Group px="md" py="sm">
            <Menu
                position="bottom-end"
                withArrow
                withinPortal
                shadow="md"
                arrowOffset={11}
                offset={2}
            >
                <Menu.Target>
                    <Button
                        compact
                        variant="default"
                        radius="xl"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconAdjustments} />}
                        rightIcon={<MantineIcon icon={IconChevronDown} />}
                    >
                        {searchFilter
                            ? getSearchItemLabel(searchFilter)
                            : 'All items'}
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
                            bg={type === searchFilter ? 'blue.1' : undefined}
                            onClick={() =>
                                onSearchFilterChange(
                                    type === searchFilter ? undefined : type,
                                )
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
