import {
    assertUnreachable,
    SearchItemType,
    type OrganizationMemberProfile,
    type SearchFilters,
} from '@lightdash/common';
import { Button, Flex, Group, Menu, Select } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import {
    IconAdjustments,
    IconBrowser,
    IconCalendar,
    IconChartBar,
    IconChevronDown,
    IconCodeCircle,
    IconFolder,
    IconLayoutDashboard,
    IconRectangle,
    IconTable,
    IconUser,
    IconX,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
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
        case SearchItemType.SQL_CHART:
            return IconCodeCircle;
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

function findUserName(
    userUuid: string,
    userList: OrganizationMemberProfile[] = [],
) {
    const user = userList.find((u) => u.userUuid === userUuid);

    if (user) {
        return `${user.firstName} ${user.lastName}`;
    }
}

function getFilterButtonProps(hasFilter: boolean) {
    return {
        variant: hasFilter ? 'outline' : 'default',
        color: hasFilter ? 'blue.4' : undefined,
        c: hasFilter ? 'blue.7' : undefined,
    };
}

const OmnibarFilters: FC<Props> = ({ filters, onSearchFilterChange }) => {
    const [isDateMenuOpen, dateMenuHandlers] = useDisclosure(false);
    const [isCreatedByMenuOpen, createdByMenuHelpers] = useDisclosure(false);
    const { data: organizationUsers } = useOrganizationUsers();

    const canClearFilters = useMemo(() => {
        return (
            filters?.type ||
            filters?.fromDate ||
            filters?.toDate ||
            filters?.createdByUuid
        );
    }, [filters]);

    return (
        <Group px="md" py="sm">
            <Menu
                position="bottom-start"
                withArrow
                withinPortal
                shadow="md"
                arrowOffset={11}
                offset={2}
            >
                <Menu.Target>
                    <Button
                        compact
                        radius="xl"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconAdjustments} />}
                        rightIcon={<MantineIcon icon={IconChevronDown} />}
                        {...getFilterButtonProps(!!filters?.type)}
                    >
                        {filters?.type
                            ? getSearchItemLabel(filters.type as SearchItemType)
                            : 'Item type'}
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
                        radius="xl"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconCalendar} />}
                        rightIcon={<MantineIcon icon={IconChevronDown} />}
                        {...getFilterButtonProps(
                            !!filters?.fromDate || !!filters?.toDate,
                        )}
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
            <Menu
                position="bottom-start"
                withArrow
                withinPortal
                shadow="md"
                arrowOffset={11}
                offset={2}
                opened={isCreatedByMenuOpen}
                onOpen={createdByMenuHelpers.open}
                onClose={createdByMenuHelpers.close}
            >
                <Menu.Target>
                    <Button
                        compact
                        radius="xl"
                        size="xs"
                        leftIcon={<MantineIcon icon={IconUser} />}
                        rightIcon={<MantineIcon icon={IconChevronDown} />}
                        {...getFilterButtonProps(!!filters?.createdByUuid)}
                    >
                        {filters?.createdByUuid
                            ? findUserName(
                                  filters.createdByUuid,
                                  organizationUsers,
                              )
                            : 'Created by'}
                    </Button>
                </Menu.Target>

                <Menu.Dropdown>
                    <Select
                        placeholder="Select a user"
                        searchable
                        withinPortal
                        value={filters?.createdByUuid}
                        allowDeselect
                        limit={5}
                        data={
                            organizationUsers?.map((user) => ({
                                value: user.userUuid,
                                label: `${user.firstName} ${user.lastName}`,
                            })) || []
                        }
                        onChange={(value) => {
                            onSearchFilterChange({
                                ...filters,
                                createdByUuid: value || undefined,
                            });

                            createdByMenuHelpers.close();
                        }}
                    />
                </Menu.Dropdown>
            </Menu>

            {canClearFilters && (
                <Button
                    compact
                    variant="subtle"
                    ml="auto"
                    radius="xl"
                    size="xs"
                    leftIcon={<MantineIcon icon={IconX} size="sm" />}
                    onClick={() => {
                        onSearchFilterChange({});
                    }}
                >
                    Clear filters
                </Button>
            )}
        </Group>
    );
};

export default OmnibarFilters;
