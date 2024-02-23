import {
    assertUnreachable,
    SearchFilters,
    SearchItemType,
} from '@lightdash/common';
import { Button, Flex, Group, Menu } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustments,
    IconBrowser,
    IconCalendar,
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
import { getDateFilterLabel } from '../utils/getDateFilterLabel';
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
    filters?: SearchFilters;
    onSearchFilterChange: (searchFilters?: SearchFilters) => void;
};

const OmnibarFilters: FC<Props> = ({ filters, onSearchFilterChange }) => {
    const [isDateMenuOpen, dateMenuHandlers] = useDisclosure(false);

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
                        {filters?.type
                            ? getSearchItemLabel(filters.type as SearchItemType)
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
                            bg={type === filters?.type ? 'blue.1' : undefined}
                            onClick={() => {
                                onSearchFilterChange({
                                    ...filters,
                                    type:
                                        type === filters?.type
                                            ? undefined
                                            : type,
                                });
                            }}
                        >
                            {getSearchItemLabel(type)}
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
            <Menu
                position="bottom-start"
                withArrow
                withinPortal
                shadow="md"
                arrowOffset={11}
                offset={2}
                opened={isDateMenuOpen}
                onOpen={dateMenuHandlers.open}
                onClose={dateMenuHandlers.close}
            >
                <Menu.Target>
                    <Button
                        compact
                        variant="default"
                        radius="xl"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconCalendar} />}
                        rightIcon={<MantineIcon icon={IconChevronDown} />}
                    >
                        {getDateFilterLabel(filters)}
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <Flex direction="column" align="flex-end">
                        <DatePicker
                            type="range"
                            allowSingleDateInRange
                            maxDate={new Date()}
                            value={[
                                filters?.fromDate
                                    ? new Date(filters.fromDate)
                                    : null,
                                filters?.toDate
                                    ? new Date(filters.toDate)
                                    : null,
                            ]}
                            onChange={(value) => {
                                const [fromDate, toDate] = value;

                                onSearchFilterChange({
                                    ...filters,
                                    fromDate: fromDate?.toISOString(),
                                    toDate: toDate?.toISOString(),
                                });

                                if (fromDate && toDate) {
                                    dateMenuHandlers.close();
                                }
                            }}
                        />
                        <Button
                            compact
                            variant="white"
                            size="xs"
                            mt="sm"
                            style={{ alignSelf: 'flex-end' }}
                            onClick={() => {
                                onSearchFilterChange({
                                    ...filters,
                                    fromDate: undefined,
                                    toDate: undefined,
                                });
                            }}
                        >
                            Clear
                        </Button>
                    </Flex>
                </Menu.Dropdown>
            </Menu>
        </Group>
    );
};

export default OmnibarFilters;
